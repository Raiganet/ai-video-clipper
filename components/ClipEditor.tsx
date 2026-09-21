"use client";

import { useEffect, useMemo, useState } from "react";
import { Captions, Plus, RotateCcw, Scissors, Trash2 } from "lucide-react";
import type { CaptionCue, CaptionStyle } from "@/lib/captions";

interface Props {
  clipStart: number;
  clipDuration: number;
  videoDuration: number;
  captionStyle: CaptionStyle;
  cues: CaptionCue[];
  disabled?: boolean;
  onTrimChange: (start: number, end: number) => void;
  onCueTextChange: (index: number, text: string) => void;
  onCueDelete: (index: number) => void;
  onCueAdd: () => void;
  onResetCaptions: () => void;
}

function formatSeconds(value: number) {
  const min = Math.floor(value / 60);
  const sec = Math.floor(value % 60);
  const decimal = Math.round((value % 1) * 10);
  return `${min}:${sec.toString().padStart(2, "0")}.${decimal}`;
}

export default function ClipEditor({
  clipStart,
  clipDuration,
  videoDuration,
  captionStyle,
  cues,
  disabled,
  onTrimChange,
  onCueTextChange,
  onCueDelete,
  onCueAdd,
  onResetCaptions,
}: Props) {
  const clipEnd = clipStart + clipDuration;
  const [draftStart, setDraftStart] = useState(clipStart);
  const [draftEnd, setDraftEnd] = useState(clipEnd);

  useEffect(() => {
    setDraftStart(clipStart);
    setDraftEnd(clipEnd);
  }, [clipStart, clipEnd]);

  const dirty = Math.abs(draftStart - clipStart) > 0.04 || Math.abs(draftEnd - clipEnd) > 0.04;
  const safeDuration = Math.max(0, videoDuration || clipEnd);
  const maxStart = Math.max(0, safeDuration - 1);
  const minEnd = Math.min(safeDuration, draftStart + 1);

  const durationLabel = useMemo(
    () => `${Math.max(0, draftEnd - draftStart).toFixed(1)} dtk`,
    [draftEnd, draftStart]
  );

  return (
    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h4 className="font-semibold flex items-center gap-2"><Scissors className="w-4 h-4 text-emerald-400" /> Trim Manual</h4>
          <span className="text-xs text-zinc-500">{durationLabel}</span>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-zinc-500 mb-2"><span>Mulai</span><span>{formatSeconds(draftStart)}</span></div>
            <input
              type="range"
              min={0}
              max={maxStart}
              step={0.1}
              value={Math.min(draftStart, maxStart)}
              disabled={disabled}
              onChange={(event) => {
                const next = Number(event.target.value);
                setDraftStart(next);
                if (draftEnd < next + 1) setDraftEnd(Math.min(safeDuration, next + 1));
              }}
              className="w-full accent-emerald-500"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-500 mb-2"><span>Selesai</span><span>{formatSeconds(draftEnd)}</span></div>
            <input
              type="range"
              min={minEnd}
              max={Math.max(minEnd, safeDuration)}
              step={0.1}
              value={Math.max(minEnd, draftEnd)}
              disabled={disabled}
              onChange={(event) => setDraftEnd(Number(event.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-500">Start (detik)
              <input type="number" min={0} max={maxStart} step={0.1} value={draftStart.toFixed(1)} disabled={disabled} onChange={(event) => {
                const next = Math.max(0, Math.min(maxStart, Number(event.target.value) || 0));
                setDraftStart(next);
                if (draftEnd < next + 1) setDraftEnd(Math.min(safeDuration, next + 1));
              }} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
            <label className="text-xs text-zinc-500">End (detik)
              <input type="number" min={minEnd} max={safeDuration} step={0.1} value={draftEnd.toFixed(1)} disabled={disabled} onChange={(event) => setDraftEnd(Math.max(minEnd, Math.min(safeDuration, Number(event.target.value) || minEnd)))} className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
            </label>
          </div>

          <button
            type="button"
            disabled={disabled || !dirty || draftEnd - draftStart < 1}
            onClick={() => onTrimChange(draftStart, draftEnd)}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-lg py-2.5 font-semibold text-sm"
          >
            Terapkan Trim
          </button>
          <p className="text-[11px] text-zinc-600">Perubahan trim membuat preview lama menjadi stale. Klik Render ulang setelah selesai mengedit.</p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h4 className="font-semibold flex items-center gap-2"><Captions className="w-4 h-4 text-emerald-400" /> Editor Caption</h4>
          <div className="flex items-center gap-2">
            <button type="button" disabled={disabled || captionStyle === "none"} onClick={onCueAdd} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40" title="Tambah caption"><Plus className="w-4 h-4" /></button>
            <button type="button" disabled={disabled || captionStyle === "none"} onClick={onResetCaptions} className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40" title="Reset caption otomatis"><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>

        {captionStyle === "none" ? (
          <div className="rounded-lg bg-zinc-800/70 p-4 text-sm text-zinc-500">Aktifkan gaya caption untuk mengedit teks sebelum render.</div>
        ) : cues.length === 0 ? (
          <div className="rounded-lg bg-zinc-800/70 p-4 text-sm text-zinc-500">Belum ada transcript/caption untuk klip ini. Kamu masih bisa menambah caption manual.</div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {cues.map((cue, index) => (
              <div key={`${cue.start}-${cue.end}-${index}`} className="rounded-lg border border-zinc-700 bg-zinc-800/70 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] text-zinc-500">{formatSeconds(cue.start)} – {formatSeconds(cue.end)}</span>
                  <button type="button" disabled={disabled} onClick={() => onCueDelete(index)} className="text-zinc-500 hover:text-red-400 disabled:opacity-40" title="Hapus caption"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <textarea
                  value={cue.text}
                  disabled={disabled}
                  rows={2}
                  maxLength={160}
                  onChange={(event) => onCueTextChange(index, event.target.value)}
                  className="w-full resize-none rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-zinc-600 mt-3">Edit teks di sini sebelum render. Timing mengikuti timestamp AI dan trim klip.</p>
      </section>
    </div>
  );
}
