"use client";

import { getFirebaseIdToken } from "@/lib/firebaseClient";
import { saveProject } from "@/lib/projects";
import type { CloudProjectSummary, ProjectDraft } from "@/lib/projectTypes";

async function authedFetch(path: string, init?: RequestInit) {
  const token = await getFirebaseIdToken();
  if (!token) throw new Error("Login diperlukan untuk cloud sync.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(String(payload.error || "Cloud sync gagal.")) as Error & { code?: string; remoteUpdatedAt?: number };
    error.code = String(payload.code || "");
    if (typeof payload.remoteUpdatedAt === "number") error.remoteUpdatedAt = payload.remoteUpdatedAt;
    throw error;
  }
  return payload;
}

export async function listCloudProjects(): Promise<CloudProjectSummary[]> {
  const payload = await authedFetch("/api/projects");
  return Array.isArray(payload.projects) ? payload.projects as unknown as CloudProjectSummary[] : [];
}

export async function syncProjectToCloud(draft: ProjectDraft, force = false) {
  return authedFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({ draft, force }),
  });
}

export async function fetchCloudProject(id: string): Promise<ProjectDraft> {
  const payload = await authedFetch(`/api/projects?id=${encodeURIComponent(id)}`);
  if (!payload.project) throw new Error("Project cloud tidak ditemukan.");
  return payload.project as unknown as ProjectDraft;
}

export async function importCloudProject(id: string): Promise<ProjectDraft> {
  const draft = await fetchCloudProject(id);
  await saveProject({ ...draft, sourceStored: false }, null);
  return { ...draft, sourceStored: false };
}

export async function deleteCloudProject(id: string) {
  await authedFetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
