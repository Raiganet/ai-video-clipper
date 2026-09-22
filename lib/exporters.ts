"use client";

import { cuesToSrt, cuesToVtt } from "@/lib/subtitles";
import type { CaptionCue } from "@/lib/captions";

export interface ExportClip {
  id: number;
  title: string;
  blobUrl: string;
  cues?: CaptionCue[];
}

const encoder = new TextEncoder();
let crcTable: Uint32Array | null = null;

function table() {
  if (crcTable) return crcTable;
  const values = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    values[n] = c >>> 0;
  }
  crcTable = values;
  return values;
}

async function crc32(blob: Blob) {
  let crc = 0xffffffff;
  const lookup = table();
  const reader = blob.stream().getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const byte of value) crc = lookup[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
  } finally {
    reader.releaseLock();
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, value, true); return a; }
function u32(value: number) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, value >>> 0, true); return a; }
function sanitize(value: string) { return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "clip"; }

export async function buildStoredZip(files: Array<{ name: string; blob: Blob }>, onProgress?: (percent: number) => void) {
  if (files.length === 0) throw new Error("Tidak ada file untuk ZIP.");
  const totalSize = files.reduce((sum, item) => sum + item.blob.size, 0);
  if (totalSize >= 3.8 * 1024 * 1024 * 1024) throw new Error("ZIP browser dibatasi sekitar 3.8 GB. Ekspor file dalam beberapa batch.");

  const entries: Array<{ nameBytes: Uint8Array; blob: Blob; crc: number; offset: number }> = [];
  let offset = 0;
  for (let index = 0; index < files.length; index += 1) {
    const item = files[index];
    if (item.blob.size >= 0xffffffff) throw new Error("Satu file terlalu besar untuk ZIP32 browser.");
    const nameBytes = encoder.encode(sanitize(item.name));
    const crc = await crc32(item.blob);
    entries.push({ nameBytes, blob: item.blob, crc, offset });
    offset += 30 + nameBytes.length + item.blob.size;
    onProgress?.(Math.round(((index + 1) / files.length) * 45));
  }

  const parts: BlobPart[] = [];
  for (const entry of entries) {
    parts.push(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(entry.crc), u32(entry.blob.size), u32(entry.blob.size), u16(entry.nameBytes.length), u16(0), entry.nameBytes, entry.blob);
  }
  const centralOffset = offset;
  let centralSize = 0;
  entries.forEach((entry, index) => {
    const header: BlobPart[] = [u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(entry.crc), u32(entry.blob.size), u32(entry.blob.size), u16(entry.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(entry.offset), entry.nameBytes];
    centralSize += 46 + entry.nameBytes.length;
    parts.push(...header);
    onProgress?.(45 + Math.round(((index + 1) / entries.length) * 45));
  });
  parts.push(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralSize), u32(centralOffset), u16(0));
  onProgress?.(100);
  return new Blob(parts, { type: "application/zip" });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitize(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function fetchExportClips(clips: ExportClip[], ratio: string, captionStyle: string, onProgress?: (percent: number) => void) {
  const output: Array<{ name: string; blob: Blob }> = [];
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index];
    const response = await fetch(clip.blobUrl);
    if (!response.ok) throw new Error(`Gagal membaca ${clip.title}.`);
    output.push({ name: `${String(index + 1).padStart(2, "0")}-${sanitize(clip.title)}-${ratio}-${captionStyle}.mp4`, blob: await response.blob() });
    onProgress?.(Math.round(((index + 1) / clips.length) * 100));
  }
  return output;
}


export function buildSubtitleFiles(clips: ExportClip[]) {
  const files: Array<{ name: string; blob: Blob }> = [];
  clips.forEach((clip, index) => {
    const cues = clip.cues || [];
    if (cues.length === 0) return;
    const base = `${String(index + 1).padStart(2, "0")}-${sanitize(clip.title)}`;
    files.push({ name: `${base}.srt`, blob: new Blob([cuesToSrt(cues)], { type: "application/x-subrip;charset=utf-8" }) });
    files.push({ name: `${base}.vtt`, blob: new Blob([cuesToVtt(cues)], { type: "text/vtt;charset=utf-8" }) });
  });
  return files;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string; error_description?: string }) => void; error_callback?: (error: unknown) => void }) => { requestAccessToken: (options?: { prompt?: string }) => void };
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;
function loadGoogleIdentityServices() {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Drive hanya tersedia di browser."));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-ai-clipper-gis="1"]');
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Google Identity Services gagal dimuat.")), { once: true }); return; }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.aiClipperGis = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services gagal dimuat."));
    document.head.appendChild(script);
  });
  return gisPromise;
}

export async function requestDriveToken() {
  const clientId = String(process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || "").trim();
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID belum dikonfigurasi.");
  await loadGoogleIdentityServices();
  return new Promise<string>((resolve, reject) => {
    const client = window.google?.accounts?.oauth2?.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (response) => response.access_token ? resolve(response.access_token) : reject(new Error(response.error_description || response.error || "Izin Google Drive ditolak.")),
      error_callback: () => reject(new Error("Google Drive authorization dibatalkan.")),
    });
    if (!client) { reject(new Error("Google Identity Services belum siap.")); return; }
    client.requestAccessToken({ prompt: "consent" });
  });
}

async function driveJson(url: string, token: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(String((payload.error as { message?: string } | undefined)?.message || `Google Drive HTTP ${response.status}`));
  return payload;
}

export async function createDriveFolder(token: string, name: string) {
  const payload = await driveJson("https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: sanitize(name), mimeType: "application/vnd.google-apps.folder" }),
  });
  return String(payload.id || "");
}

export async function uploadBlobToDrive(token: string, blob: Blob, name: string, folderId?: string) {
  const metadata: Record<string, unknown> = { name: sanitize(name) };
  if (folderId) metadata.parents = [folderId];
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": blob.type || "application/octet-stream",
      "X-Upload-Content-Length": String(blob.size),
    },
    body: JSON.stringify(metadata),
  });
  if (!init.ok) {
    const payload = await init.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(payload.error?.message || `Gagal memulai upload Google Drive (HTTP ${init.status}).`);
  }
  const location = init.headers.get("Location");
  if (!location) throw new Error("Google Drive tidak mengembalikan resumable upload URL.");
  const upload = await fetch(location, { method: "PUT", headers: { "Content-Type": blob.type || "application/octet-stream", "Content-Length": String(blob.size) }, body: blob });
  const payload = await upload.json().catch(() => ({})) as { id?: string; name?: string; webViewLink?: string; error?: { message?: string } };
  if (!upload.ok) throw new Error(payload.error?.message || `Upload Google Drive gagal (HTTP ${upload.status}).`);
  return payload;
}
