"use client";

import type { LoadedProject, ProjectDraft, ProjectSummary } from "@/lib/projectTypes";
export type { LoadedProject, PersistedClip, ProjectDraft, ProjectSummary } from "@/lib/projectTypes";

const DB_NAME = "ai-video-clipper-stage4";
const DB_VERSION = 1;
const PROJECTS = "projects";
const SOURCES = "sources";
const MAX_STORED_SOURCE = 300 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("IndexedDB gagal dibuka."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SOURCES)) db.createObjectStore(SOURCES, { keyPath: "projectId" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request gagal."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction gagal."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction dibatalkan."));
  });
}

export function canPersistSource(file: File) {
  return file.size <= MAX_STORED_SOURCE;
}

export async function saveProject(draft: ProjectDraft, sourceFile?: File | null) {
  const db = await openDb();
  try {
    const projectTx = db.transaction(PROJECTS, "readwrite");
    projectTx.objectStore(PROJECTS).put(draft);
    await transactionDone(projectTx);

    if (sourceFile && canPersistSource(sourceFile)) {
      const readTx = db.transaction(SOURCES, "readonly");
      const existing = await requestPromise(readTx.objectStore(SOURCES).get(draft.id)) as { size?: number; lastModified?: number } | undefined;
      if (!existing || existing.size !== sourceFile.size || existing.lastModified !== sourceFile.lastModified) {
        try {
          const sourceTx = db.transaction(SOURCES, "readwrite");
          sourceTx.objectStore(SOURCES).put({
            projectId: draft.id,
            blob: sourceFile,
            name: sourceFile.name,
            type: sourceFile.type,
            size: sourceFile.size,
            lastModified: sourceFile.lastModified,
          });
          await transactionDone(sourceTx);
        } catch (error) {
          console.warn("Video source could not be stored in IndexedDB; keeping draft metadata only.", error);
          const fallbackTx = db.transaction(PROJECTS, "readwrite");
          fallbackTx.objectStore(PROJECTS).put({ ...draft, sourceStored: false });
          await transactionDone(fallbackTx);
        }
      }
    }
  } finally {
    db.close();
  }
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(PROJECTS, "readonly");
    const rows = await requestPromise(tx.objectStore(PROJECTS).getAll()) as ProjectDraft[];
    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        updatedAt: row.updatedAt,
        sourceName: row.sourceName,
        sourceSize: row.sourceSize,
        sourceStored: row.sourceStored,
        clipCount: row.clips.length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function loadProject(id: string): Promise<LoadedProject | null> {
  const db = await openDb();
  try {
    const tx = db.transaction([PROJECTS, SOURCES], "readonly");
    const draft = await requestPromise(tx.objectStore(PROJECTS).get(id)) as ProjectDraft | undefined;
    if (!draft) return null;
    const source = await requestPromise(tx.objectStore(SOURCES).get(id)) as {
      blob?: Blob;
      name?: string;
      type?: string;
      lastModified?: number;
    } | undefined;
    const sourceFile = source?.blob
      ? new File([source.blob], source.name || draft.sourceName, {
          type: source.type || draft.sourceType,
          lastModified: source.lastModified || draft.sourceLastModified,
        })
      : null;
    return { draft, sourceFile };
  } finally {
    db.close();
  }
}

export async function deleteProject(id: string) {
  const db = await openDb();
  try {
    const tx = db.transaction([PROJECTS, SOURCES], "readwrite");
    tx.objectStore(PROJECTS).delete(id);
    tx.objectStore(SOURCES).delete(id);
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 };
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage || 0, quota: estimate.quota || 0 };
}

export function notifyProjectsChanged() {
  window.dispatchEvent(new Event("clipper-projects-changed"));
}
