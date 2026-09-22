"use client";

import type { LoadedProject, ProjectDraft, ProjectSummary } from "@/lib/projectTypes";
export type { LoadedProject, PersistedClip, ProjectDraft, ProjectSummary } from "@/lib/projectTypes";

const DB_NAME = "ai-video-clipper-stage4";
const DB_VERSION = 2;
const PROJECTS = "projects";
const SOURCES = "sources";
const CAMPAIGN_SOURCES = "campaignSources";
const MAX_STORED_SOURCE = 300 * 1024 * 1024;
const MAX_CAMPAIGN_STORED_TOTAL = 750 * 1024 * 1024;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("IndexedDB gagal dibuka."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(SOURCES)) db.createObjectStore(SOURCES, { keyPath: "projectId" });
      if (!db.objectStoreNames.contains(CAMPAIGN_SOURCES)) {
        const store = db.createObjectStore(CAMPAIGN_SOURCES, { keyPath: "key" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
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

async function saveCampaignSources(db: IDBDatabase, projectId: string, files: Record<string, File>) {
  const entries = Object.entries(files).filter(([, file]) => canPersistSource(file));
  let total = 0;
  const accepted: Array<[string, File]> = [];
  for (const entry of entries.sort((a, b) => a[1].size - b[1].size)) {
    if (total + entry[1].size > MAX_CAMPAIGN_STORED_TOTAL) continue;
    total += entry[1].size;
    accepted.push(entry);
  }
  if (accepted.length === 0) return;

  const readTx = db.transaction(CAMPAIGN_SOURCES, "readonly");
  const readStore = readTx.objectStore(CAMPAIGN_SOURCES);
  const pending: Array<[string, File]> = [];
  for (const [sourceId, file] of accepted) {
    const key = `${projectId}:${sourceId}`;
    const existing = await requestPromise(readStore.get(key)) as { size?: number; lastModified?: number } | undefined;
    if (!existing || existing.size !== file.size || existing.lastModified !== file.lastModified) pending.push([sourceId, file]);
  }
  if (pending.length === 0) return;

  const tx = db.transaction(CAMPAIGN_SOURCES, "readwrite");
  const store = tx.objectStore(CAMPAIGN_SOURCES);
  for (const [sourceId, file] of pending) {
    store.put({
      key: `${projectId}:${sourceId}`,
      projectId,
      sourceId,
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
    });
  }
  await transactionDone(tx);
}

export async function saveProject(draft: ProjectDraft, sourceFile?: File | null, campaignSourceFiles: Record<string, File> = {}) {
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

    try {
      await saveCampaignSources(db, draft.id, campaignSourceFiles);
    } catch (error) {
      console.warn("Some campaign source files could not be stored in IndexedDB.", error);
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

async function loadCampaignSources(db: IDBDatabase, projectId: string) {
  if (!db.objectStoreNames.contains(CAMPAIGN_SOURCES)) return {} as Record<string, File>;
  const tx = db.transaction(CAMPAIGN_SOURCES, "readonly");
  const store = tx.objectStore(CAMPAIGN_SOURCES);
  const index = store.index("projectId");
  const rows = await requestPromise(index.getAll(IDBKeyRange.only(projectId))) as Array<{
    sourceId: string;
    blob?: Blob;
    name?: string;
    type?: string;
    lastModified?: number;
  }>;
  const result: Record<string, File> = {};
  for (const row of rows) {
    if (!row.blob || !row.sourceId) continue;
    result[row.sourceId] = new File([row.blob], row.name || row.sourceId, {
      type: row.type || "video/mp4",
      lastModified: row.lastModified || Date.now(),
    });
  }
  return result;
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
    const campaignSourceFiles = await loadCampaignSources(db, id);
    return { draft, sourceFile, campaignSourceFiles };
  } finally {
    db.close();
  }
}

export async function deleteProject(id: string) {
  const db = await openDb();
  try {
    const tx = db.transaction([PROJECTS, SOURCES, CAMPAIGN_SOURCES], "readwrite");
    tx.objectStore(PROJECTS).delete(id);
    tx.objectStore(SOURCES).delete(id);
    const campaignStore = tx.objectStore(CAMPAIGN_SOURCES);
    const index = campaignStore.index("projectId");
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      campaignStore.delete(cursor.primaryKey);
      cursor.continue();
    };
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
