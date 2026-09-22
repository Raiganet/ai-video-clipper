"use client";

import { getFirebaseIdToken } from "@/lib/firebaseClient";
import type { RenderClipOptions } from "@/lib/ffmpeg";

interface WorkerSession {
  workerUrl: string;
  token: string;
  jobId: string;
  expiresAt: number;
  uploaded: boolean;
}

const sessions = new WeakMap<File, Promise<WorkerSession>>();

async function createSession(file: File): Promise<WorkerSession> {
  const token = await getFirebaseIdToken();
  const response = await fetch("/api/render-worker/session", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  const payload = await response.json() as Partial<WorkerSession> & { error?: string; code?: string };
  if (!response.ok || !payload.workerUrl || !payload.token || !payload.jobId) {
    const error = new Error(payload.error || "Render worker tidak tersedia.") as Error & { code?: string };
    error.code = payload.code || (response.status === 503 ? "WORKER_NOT_CONFIGURED" : "WORKER_SESSION_FAILED");
    throw error;
  }
  const session: WorkerSession = { workerUrl: payload.workerUrl, token: payload.token, jobId: payload.jobId, expiresAt: Number(payload.expiresAt || Date.now() + 30 * 60_000), uploaded: false };
  let uploaded = false;
  try {
    const prepare = await fetch(`${session.workerUrl}/v3/uploads/${encodeURIComponent(session.jobId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
      cache: "no-store",
    });
    if (prepare.ok) {
      const signed = await prepare.json() as { uploadUrl?: string; error?: string };
      if (signed.uploadUrl) {
        const direct = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!direct.ok) throw new Error(`Upload object storage gagal (HTTP ${direct.status}).`);
        uploaded = true;
      }
    }
  } catch (error) {
    console.warn("Direct object-storage upload unavailable, falling back to worker upload", error);
  }
  if (!uploaded) {
    const upload = await fetch(`${session.workerUrl}/v2/files/${encodeURIComponent(session.jobId)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
      body: file,
    });
    if (!upload.ok) {
      const message = await upload.text().catch(() => "");
      throw new Error(message || `Upload ke render worker gagal (HTTP ${upload.status}).`);
    }
  }
  session.uploaded = true;
  return session;
}

async function sessionFor(file: File) {
  let existing = sessions.get(file);
  if (!existing) {
    existing = createSession(file);
    sessions.set(file, existing);
  }
  try {
    const session = await existing;
    if (session.expiresAt <= Date.now() + 30_000) {
      sessions.delete(file);
      return sessionFor(file);
    }
    return session;
  } catch (error) {
    sessions.delete(file);
    throw error;
  }
}

export async function isRenderWorkerConfigured() {
  try {
    const response = await fetch("/api/render-worker/session", { cache: "no-store" });
    const payload = await response.json() as { configured?: boolean };
    return Boolean(response.ok && payload.configured);
  } catch {
    return false;
  }
}

export async function renderVideoClipRemote(file: File, options: RenderClipOptions, signal?: AbortSignal): Promise<Blob> {
  if (signal?.aborted) throw new DOMException("Render dibatalkan.", "AbortError");
  options.onProgress?.(2, "render");
  const session = await sessionFor(file);
  options.onProgress?.(5, "render");

  const create = await fetch(`${session.workerUrl}/v2/jobs/${encodeURIComponent(session.jobId)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      start: options.start,
      duration: options.duration,
      ratio: options.ratio,
      captionStyle: options.captionStyle,
      captionCues: options.captionCues || [],
      cropFocus: options.cropFocus,
      cropTrack: options.cropTrack,
      branding: options.branding,
      ctaOverlay: options.ctaOverlay,
      sourceWidth: options.sourceWidth,
      sourceHeight: options.sourceHeight,
    }),
    signal,
  });
  const created = await create.json() as { success?: boolean; renderId?: string; error?: string };
  if (!create.ok || !created.success || !created.renderId) throw new Error(created.error || `Gagal membuat antrean render (HTTP ${create.status}).`);

  const renderId = created.renderId;
  const cancelRemote = () => {
    void fetch(`${session.workerUrl}/v2/jobs/${encodeURIComponent(session.jobId)}/${encodeURIComponent(renderId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
    }).catch(() => undefined);
  };
  if (signal?.aborted) { cancelRemote(); throw new DOMException("Render dibatalkan.", "AbortError"); }
  signal?.addEventListener("abort", cancelRemote, { once: true });
  const startedAt = Date.now();
  let lastProgress = 5;
  try {
  while (true) {
    if (signal?.aborted) throw new DOMException("Render dibatalkan.", "AbortError");
    if (Date.now() - startedAt > 45 * 60_000) throw new Error("Render server melewati batas tunggu 45 menit.");
    const statusResponse = await fetch(`${session.workerUrl}/v2/jobs/${encodeURIComponent(session.jobId)}/${encodeURIComponent(renderId)}`, {
      headers: { Authorization: `Bearer ${session.token}` },
      cache: "no-store",
      signal,
    });
    const status = await statusResponse.json() as { status?: string; progress?: number; phase?: string; attempt?: number; maxAttempts?: number; error?: string };
    if (!statusResponse.ok) throw new Error(status.error || `Gagal membaca status render (HTTP ${statusResponse.status}).`);
    const progress = Math.max(lastProgress, Math.min(98, Number(status.progress || 0)));
    lastProgress = progress;
    options.onProgress?.(progress, "render");
    if (status.status === "completed") break;
    if (status.status === "failed" || status.status === "cancelled") {
      const retryText = Number(status.attempt || 0) > 1 ? ` setelah ${status.attempt} percobaan` : "";
      throw new Error(`${status.error || "Server render gagal"}${retryText}.`);
    }
    await new Promise((resolve) => window.setTimeout(resolve, 700));
  }

  options.onProgress?.(99, "render");
  const output = await fetch(`${session.workerUrl}/v2/output/${encodeURIComponent(session.jobId)}/${encodeURIComponent(renderId)}`, {
    headers: { Authorization: `Bearer ${session.token}` },
    cache: "no-store",
    signal,
  });
  if (!output.ok) {
    const message = await output.text().catch(() => "");
    throw new Error(message || `Download hasil server render gagal (HTTP ${output.status}).`);
  }
  const blob = await output.blob();
  options.onProgress?.(100, "render");
  return blob.type === "video/mp4" ? blob : new Blob([blob], { type: "video/mp4" });
  } finally {
    signal?.removeEventListener("abort", cancelRemote);
  }
}
