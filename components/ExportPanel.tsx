"use client";

import { useState } from "react";
import { Archive, Captions, CloudUpload, Loader2 } from "lucide-react";
import { buildStoredZip, buildSubtitleFiles, createDriveFolder, fetchExportClips, requestDriveToken, saveBlob, uploadBlobToDrive, type ExportClip } from "@/lib/exporters";

interface Props {
  clips: ExportClip[];
  projectName: string;
  ratio: string;
  captionStyle: string;
  disabled?: boolean;
}

function safeProjectName(value: string) { return value.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 80) || "AI-Clips"; }

export default function ExportPanel({ clips, projectName, ratio, captionStyle, disabled }: Props) {
  const [busy, setBusy] = useState<"zip" | "subs" | "drive" | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const exportZip = async () => {
    if (clips.length === 0) return;
    setBusy("zip"); setProgress(0); setMessage("");
    try {
      const videos = await fetchExportClips(clips, ratio, captionStyle, (p) => setProgress(Math.round(p * 0.30)));
      const subtitles = buildSubtitleFiles(clips);
      const zip = await buildStoredZip([...videos, ...subtitles], (p) => setProgress(30 + Math.round(p * 0.70)));
      saveBlob(zip, `${safeProjectName(projectName)}-${Date.now()}.zip`);
      setMessage(`ZIP siap: ${clips.length} klip.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export ZIP gagal."); }
    finally { setBusy(null); window.setTimeout(() => setProgress(0), 1200); }
  };


  const exportSubtitles = async () => {
    const files = buildSubtitleFiles(clips);
    if (files.length === 0) { setMessage("Belum ada caption untuk diexport."); return; }
    setBusy("subs"); setProgress(0); setMessage("");
    try {
      const zip = await buildStoredZip(files, setProgress);
      saveBlob(zip, `${safeProjectName(projectName)}-subtitles-${Date.now()}.zip`);
      setMessage(`Subtitle siap: ${files.length / 2} klip dalam format SRT + VTT.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export subtitle gagal."); }
    finally { setBusy(null); window.setTimeout(() => setProgress(0), 1200); }
  };

  const exportDrive = async () => {
    if (clips.length === 0) return;
    setBusy("drive"); setProgress(0); setMessage("");
    try {
      const token = await requestDriveToken();
      setProgress(5);
      const folder = await createDriveFolder(token, `AI Clipper - ${safeProjectName(projectName)}`);
      const files = await fetchExportClips(clips, ratio, captionStyle);
      for (let index = 0; index < files.length; index += 1) {
        await uploadBlobToDrive(token, files[index].blob, files[index].name, folder);
        setProgress(5 + Math.round(((index + 1) / files.length) * 95));
      }
      setMessage(`${files.length} klip berhasil dikirim ke folder baru di Google Drive.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export Google Drive gagal."); }
    finally { setBusy(null); window.setTimeout(() => setProgress(0), 1600); }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0"><div className="font-semibold text-sm">Export Batch</div><div className="text-xs text-zinc-500">ZIP dibuat lokal. Google Drive memakai scope <code>drive.file</code> dan hanya membuat file aplikasi ini.</div></div>
        <div className="sm:ml-auto flex flex-wrap gap-2">
          <button type="button" disabled={disabled || clips.length === 0 || busy !== null} onClick={() => void exportZip()} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm flex items-center gap-2">{busy === "zip" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} ZIP</button>
          <button type="button" disabled={disabled || clips.length === 0 || busy !== null} onClick={() => void exportSubtitles()} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm flex items-center gap-2">{busy === "subs" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Captions className="w-4 h-4" />} SRT/VTT</button>
          <button type="button" disabled={disabled || clips.length === 0 || busy !== null} onClick={() => void exportDrive()} className="px-3 py-2 rounded-lg bg-sky-600/20 text-sky-200 hover:bg-sky-600/30 disabled:opacity-40 text-sm flex items-center gap-2">{busy === "drive" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />} Google Drive</button>
        </div>
      </div>
      {busy && <div className="mt-3"><div className="h-1.5 rounded-full overflow-hidden bg-zinc-800"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div><div className="text-[11px] text-zinc-500 mt-1">{busy === "zip" ? "Menyusun ZIP" : busy === "subs" ? "Menyusun subtitle" : "Upload Drive"} • {progress}%</div></div>}
      {message && <div className="text-xs text-zinc-400 mt-3">{message}</div>}
    </div>
  );
}
