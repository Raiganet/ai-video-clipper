"use client";

import Image from "next/image";
import { Play, Info } from "lucide-react";
import { extractYouTubeId } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onUseUpload: () => void;
}

export default function YouTubeInput({ value, onChange, onUseUpload }: Props) {
  const videoId = value ? extractYouTubeId(value) : null;
  const invalid = Boolean(value && !videoId);

  return (
    <div>
      <div className="relative">
        <input
          type="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className={`w-full bg-zinc-800 border rounded-lg px-4 py-3 pl-12 text-white placeholder-zinc-500 focus:outline-none ${invalid ? "border-red-500" : "border-zinc-700 focus:border-emerald-500"}`}
        />
        <Play className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
      </div>
      {invalid && <p className="text-red-400 text-sm mt-2">Format URL YouTube tidak valid.</p>}

      {videoId && (
        <div className="mt-4 border border-zinc-700 bg-zinc-800/50 rounded-lg p-4 flex gap-4 items-center">
          <Image src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`} alt="Preview YouTube" width={160} height={90} className="w-32 aspect-video object-cover rounded-md bg-black" />
          <div className="min-w-0">
            <p className="font-medium text-white">Link YouTube dikenali</p>
            <p className="text-xs text-zinc-500 mt-1 break-all">Video ID: {videoId}</p>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100">
        <div className="flex gap-2">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Import langsung YouTube belum diaktifkan.</p>
            <p className="text-sky-200/70 mt-1">Tahap 1 tidak memakai downloader pihak ketiga yang rapuh. Untuk video milikmu, unduh/siapkan file sumber lalu proses lewat Upload Video.</p>
            <button type="button" onClick={onUseUpload} className="mt-3 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/20 px-3 py-2 rounded-md font-medium">Pindah ke Upload Video</button>
          </div>
        </div>
      </div>
    </div>
  );
}
