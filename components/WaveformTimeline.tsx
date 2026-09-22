"use client";

import { useEffect, useMemo, useState } from "react";
import type { TranscriptSegment } from "@/lib/transcription";

interface Props {
  file: File | null;
  duration: number;
  start: number;
  end: number;
  transcriptSegments: TranscriptSegment[];
  disabled?: boolean;
  onPick: (time: number) => void;
}

const BAR_COUNT = 120;
const MAX_DECODE_BYTES = 80 * 1024 * 1024;

function speechFallback(duration: number, segments: TranscriptSegment[]) {
  const values = Array.from({ length: BAR_COUNT }, () => 0.08);
  if (!duration || segments.length === 0) return values;
  for (let i = 0; i < BAR_COUNT; i += 1) {
    const t0 = duration * (i / BAR_COUNT);
    const t1 = duration * ((i + 1) / BAR_COUNT);
    let activity = 0;
    for (const segment of segments) {
      const overlap = Math.max(0, Math.min(t1, segment.end) - Math.max(t0, segment.start));
      if (overlap > 0) activity += overlap / Math.max(0.001, t1 - t0);
    }
    values[i] = Math.min(1, 0.12 + activity * 0.88);
  }
  return values;
}

async function decodeWaveform(file: File) {
  if (file.size > MAX_DECODE_BYTES) throw new Error("SOURCE_TOO_LARGE");
  const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) throw new Error("AUDIO_CONTEXT_UNAVAILABLE");
  const context = new Context();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const values: number[] = [];
    const block = Math.max(1, Math.floor(channel.length / BAR_COUNT));
    for (let bar = 0; bar < BAR_COUNT; bar += 1) {
      const from = bar * block;
      const to = Math.min(channel.length, from + block);
      let peak = 0;
      for (let i = from; i < to; i += Math.max(1, Math.floor(block / 100))) peak = Math.max(peak, Math.abs(channel[i] || 0));
      values.push(peak);
    }
    const max = Math.max(0.05, ...values);
    return values.map((value) => Math.max(0.06, Math.min(1, value / max)));
  } finally {
    await context.close().catch(() => undefined);
  }
}

export default function WaveformTimeline({ file, duration, start, end, transcriptSegments, disabled, onPick }: Props) {
  const fallback = useMemo(() => speechFallback(duration, transcriptSegments), [duration, transcriptSegments]);
  const [bars, setBars] = useState<number[]>(fallback);
  const [mode, setMode] = useState<"audio" | "speech">("speech");

  useEffect(() => {
    let cancelled = false;
    setBars(fallback);
    setMode("speech");
    if (!file || !duration) return;
    void decodeWaveform(file).then((next) => {
      if (!cancelled) { setBars(next); setMode("audio"); }
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [file, duration, fallback]);

  const safeDuration = Math.max(0.001, duration);
  const startPct = Math.max(0, Math.min(100, (start / safeDuration) * 100));
  const endPct = Math.max(startPct, Math.min(100, (end / safeDuration) * 100));

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-zinc-600 mb-2">
        <span>Timeline waveform</span><span>{mode === "audio" ? "audio waveform" : "speech activity fallback"}</span>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
          onPick(pct * safeDuration);
        }}
        className="relative h-20 w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 disabled:opacity-50"
        title="Klik timeline untuk memindahkan batas trim terdekat"
      >
        <div className="absolute inset-0 flex items-center gap-px px-1">
          {bars.map((value, index) => <span key={index} className="flex-1 rounded-full bg-zinc-600" style={{ height: `${Math.max(8, value * 62)}px` }} />)}
        </div>
        <div className="absolute inset-y-0 bg-black/65 pointer-events-none" style={{ left: 0, width: `${startPct}%` }} />
        <div className="absolute inset-y-0 bg-black/65 pointer-events-none" style={{ left: `${endPct}%`, right: 0 }} />
        <div className="absolute inset-y-0 border-l-2 border-emerald-400 pointer-events-none" style={{ left: `${startPct}%` }} />
        <div className="absolute inset-y-0 border-r-2 border-emerald-400 pointer-events-none" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
      </button>
      <p className="mt-2 text-[10px] text-zinc-600">Klik waveform untuk memindahkan batas Start/End yang paling dekat. Untuk video besar/codec yang tidak bisa didecode browser, timeline memakai aktivitas transcript.</p>
    </div>
  );
}
