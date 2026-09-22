"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Database, FolderOpen, HardDrive, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { deleteProject, listProjects, loadProject, notifyProjectsChanged, storageEstimate, type ProjectSummary } from "@/lib/projects";
import { deleteCloudProject, importCloudProject, listCloudProjects, syncProjectToCloud } from "@/lib/cloudProjects";
import { getFirebaseAuth } from "@/lib/firebaseClient";
import type { CloudProjectSummary } from "@/lib/projectTypes";

interface Props {
  open: boolean;
  currentProjectId: string | null;
  onClose: () => void;
  onOpenProject: (id: string) => Promise<void>;
  onNewProject: () => void;
}

function size(bytes: number) {
  if (!bytes) return "0 MB";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

type Combined = { id: string; local?: ProjectSummary; cloud?: CloudProjectSummary };

export default function ProjectHistory({ open, currentProjectId, onClose, onOpenProject, onNewProject }: Props) {
  const [localItems, setLocalItems] = useState<ProjectSummary[]>([]);
  const [cloudItems, setCloudItems] = useState<CloudProjectSummary[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const [cloudMessage, setCloudMessage] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true); setCloudMessage("");
    try {
      const [projects, estimate] = await Promise.all([listProjects(), storageEstimate()]);
      setLocalItems(projects);
      setStorage(estimate);
      const auth = getFirebaseAuth();
      if (auth?.currentUser?.emailVerified) {
        try { setCloudItems(await listCloudProjects()); }
        catch (error) { setCloudItems([]); setCloudMessage(error instanceof Error ? error.message : "Cloud sync tidak tersedia."); }
      } else {
        setCloudItems([]);
        if (auth?.currentUser) setCloudMessage("Verifikasi email agar Cloud Sync aktif.");
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) void refresh(); }, [open, refresh, user?.uid, user?.emailVerified]);
  useEffect(() => {
    const handler = () => { if (open) void refresh(); };
    window.addEventListener("clipper-projects-changed", handler);
    return () => window.removeEventListener("clipper-projects-changed", handler);
  }, [open, refresh]);

  const combined = useMemo(() => {
    const map = new Map<string, Combined>();
    localItems.forEach((item) => map.set(item.id, { id: item.id, local: item }));
    cloudItems.forEach((item) => map.set(item.id, { ...(map.get(item.id) || { id: item.id }), cloud: item }));
    return [...map.values()].sort((a, b) => Math.max(b.local?.updatedAt || 0, b.cloud?.updatedAt || 0) - Math.max(a.local?.updatedAt || 0, a.cloud?.updatedAt || 0));
  }, [localItems, cloudItems]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end" onMouseDown={onClose}>
      <aside className="w-full max-w-lg h-full bg-zinc-950 border-l border-zinc-800 p-5 overflow-y-auto" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-5">
          <div><h2 className="font-bold text-lg flex items-center gap-2"><FolderOpen className="w-5 h-5 text-emerald-400" /> Project & Cloud Sync</h2><p className="text-xs text-zinc-500 mt-1">Draft sync lintas perangkat; video sumber tetap lokal.</p></div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800"><X className="w-4 h-4" /></button>
        </div>

        <button type="button" onClick={() => { onNewProject(); onClose(); }} className="w-full mb-4 bg-emerald-600 hover:bg-emerald-700 rounded-lg py-3 font-semibold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Project Baru</button>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 mb-3 text-xs text-zinc-400 flex items-center gap-2"><HardDrive className="w-4 h-4 text-emerald-400" /> Penyimpanan browser: {size(storage.usage)}{storage.quota ? ` / ${size(storage.quota)}` : ""}</div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 mb-4 text-xs text-zinc-400 flex items-center gap-2"><Database className="w-4 h-4 text-sky-400" /> {user?.emailVerified ? `${cloudItems.length} project tersedia di cloud` : user ? "Cloud Sync menunggu verifikasi email" : "Login untuk Cloud Sync lintas perangkat"}<button type="button" onClick={() => void refresh()} className="ml-auto p-1.5 rounded bg-zinc-800 hover:bg-zinc-700"><RefreshCw className="w-3 h-3" /></button></div>
        {cloudMessage && <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">{cloudMessage}</div>}

        {loading ? <div className="py-12 flex justify-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin" /></div> : combined.length === 0 ? <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-zinc-500 text-sm">Belum ada project tersimpan.</div> : (
          <div className="space-y-3">
            {combined.map(({ id, local, cloud }) => {
              const item = local || cloud!;
              const cloudNewer = Boolean(local && cloud && cloud.updatedAt > local.updatedAt);
              const localNewer = Boolean(local && cloud && local.updatedAt > cloud.updatedAt);
              return <div key={id} className={`rounded-xl border p-4 ${id === currentProjectId ? "border-emerald-500/50 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900"}`}>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold truncate">{item.name}</div><div className="text-xs text-zinc-500 truncate mt-1">{item.sourceName}</div><div className="text-[11px] text-zinc-600 mt-2">{item.clipCount} klip • {size(item.sourceSize)} • {new Date(Math.max(local?.updatedAt || 0, cloud?.updatedAt || 0)).toLocaleString("id-ID")}</div><div className="flex flex-wrap gap-1.5 mt-2">{local && <span className="text-[10px] rounded-full bg-emerald-500/10 text-emerald-300 px-2 py-1">LOCAL{local.sourceStored ? " + VIDEO" : ""}</span>}{cloud && <span className="text-[10px] rounded-full bg-sky-500/10 text-sky-300 px-2 py-1">CLOUD {size(cloud.compressedBytes)}</span>}{cloudNewer && <span className="text-[10px] text-amber-300">Cloud lebih baru</span>}{localNewer && <span className="text-[10px] text-amber-300">Local belum tersinkron</span>}</div></div></div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {local && <button type="button" disabled={openingId !== null} onClick={async () => { setOpeningId(id); try { await onOpenProject(id); onClose(); } finally { setOpeningId(null); } }} className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1.5">{openingId === id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />} Buka Lokal</button>}
                  {cloud && <button type="button" disabled={actionId !== null} onClick={async () => { if (localNewer && !window.confirm("Versi lokal lebih baru. Ambil versi cloud akan mengganti draft lokal (video lokal tetap tersimpan). Lanjutkan?")) return; setActionId(`pull:${id}`); try { await importCloudProject(id); notifyProjectsChanged(); await onOpenProject(id); onClose(); } catch (error) { setCloudMessage(error instanceof Error ? error.message : "Gagal mengambil cloud."); } finally { setActionId(null); } }} className="bg-sky-600/20 text-sky-200 hover:bg-sky-600/30 disabled:opacity-50 rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1.5"><Database className="w-3.5 h-3.5" /> Ambil Cloud</button>}
                  {local && user?.emailVerified && <button type="button" disabled={actionId !== null} onClick={async () => { setActionId(`push:${id}`); try { const loaded = await loadProject(id); if (!loaded) throw new Error("Project lokal tidak ditemukan."); await syncProjectToCloud(loaded.draft); setCloudMessage("Project berhasil disinkronkan ke cloud."); await refresh(); } catch (error) { setCloudMessage(error instanceof Error ? error.message : "Sync cloud gagal."); } finally { setActionId(null); } }} className="bg-emerald-600/20 text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-50 rounded-lg py-2 text-xs font-medium">Sync → Cloud</button>}
                  <div className="flex items-center justify-end gap-1">{local && <button type="button" title="Hapus lokal" onClick={async () => { if (!window.confirm("Hapus salinan lokal project ini?")) return; await deleteProject(id); notifyProjectsChanged(); await refresh(); }} className="p-2 text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}{cloud && <button type="button" title="Hapus cloud" onClick={async () => { if (!window.confirm("Hapus project ini dari cloud? Salinan lokal tidak ikut dihapus.")) return; try { await deleteCloudProject(id); await refresh(); } catch (error) { setCloudMessage(error instanceof Error ? error.message : "Gagal menghapus cloud."); } }} className="p-2 text-sky-500 hover:text-red-400"><Database className="w-4 h-4" /></button>}</div>
                </div>
              </div>;
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
