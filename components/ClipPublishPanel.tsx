"use client";

import { useState } from "react";
import { Clipboard, Loader2, Sparkles } from "lucide-react";
import { generateClipSocialMetadata, type ClipSocialMetadata } from "@/lib/clipMetadata";
import type { BriefingSpec } from "@/lib/briefing";

interface Props {
  clipTitle: string;
  reason?: string;
  transcript: string;
  vibe: string;
  durationSec: number;
  value?: ClipSocialMetadata;
  briefing?: BriefingSpec;
  disabled?: boolean;
  onChange: (value: ClipSocialMetadata) => void;
}

export default function ClipPublishPanel({ clipTitle, reason, transcript, vibe, durationSec, value, briefing, disabled, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const generate = async () => {
    if (!transcript.trim()) { setMessage("Transcript klip belum tersedia."); return; }
    setBusy(true); setMessage("");
    try {
      onChange(await generateClipSocialMetadata({ clipTitle, reason, transcript, vibe, durationSec, briefing: briefing?.enabled ? { campaignName: briefing.campaignName, ctaText: briefing.ctaText, bioLink: briefing.bioLink, hashtags: briefing.hashtags, requiredNarratives: briefing.requiredNarratives, forbiddenRules: briefing.forbiddenRules } : undefined }));
      setMessage("Metadata AI siap.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Metadata AI gagal."); }
    finally { setBusy(false); }
  };

  const copyAll = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(`${value.title}\n\n${value.description}\n\n${value.hashtags.join(" ")}\n\n${value.cta}`.trim());
    setMessage("Copy siap ditempel ke platform sosial.");
  };

  return (
    <section className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div><div className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-400" /> AI Publish Pack</div><div className="text-[11px] text-zinc-500 mt-1">Judul, deskripsi, hook, CTA, dan hashtag dari transcript klip.</div></div>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={disabled || busy || !transcript.trim()} onClick={() => void generate()} className="px-3 py-2 rounded-lg bg-violet-600/20 text-violet-200 hover:bg-violet-600/30 disabled:opacity-40 text-sm flex items-center gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate</button>
          <button type="button" disabled={!value} onClick={() => void copyAll()} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-sm flex items-center gap-2"><Clipboard className="w-4 h-4" /> Copy</button>
        </div>
      </div>
      {value ? <div className="grid gap-3">
        <label className="text-xs text-zinc-500">Judul<input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white" /></label>
        <label className="text-xs text-zinc-500">Deskripsi<textarea value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} rows={3} className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white resize-y" /></label>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs text-zinc-500">Hook<input value={value.hook} onChange={(e) => onChange({ ...value, hook: e.target.value })} className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white" /></label><label className="text-xs text-zinc-500">CTA<input value={value.cta} onChange={(e) => onChange({ ...value, cta: e.target.value })} className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white" /></label></div>
        <label className="text-xs text-zinc-500">Hashtag<input value={value.hashtags.join(" ")} onChange={(e) => onChange({ ...value, hashtags: e.target.value.split(/\s+/).map((item) => item.trim()).filter(Boolean).slice(0, 12) })} className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white" /></label>
      </div> : <div className="rounded-lg border border-dashed border-zinc-700 bg-black/20 p-4 text-xs text-zinc-500">Generate setelah transcript tersedia. Hasil dapat diedit sebelum disalin.</div>}
      {briefing?.enabled && (briefing.bioLink || briefing.hashtags.length > 0) && <div className="mt-3 rounded-lg border border-violet-500/15 bg-violet-500/5 p-3 text-[11px] text-zinc-400">{briefing.bioLink && <div><span className="text-violet-300 font-semibold">Reminder bio:</span> {briefing.bioLink}</div>}{briefing.hashtags.length > 0 && <div className="mt-1"><span className="text-violet-300 font-semibold">Hashtag wajib:</span> {briefing.hashtags.join(" ")}</div>}</div>}
      {message && <div className="text-xs text-zinc-500 mt-3">{message}</div>}
    </section>
  );
}
