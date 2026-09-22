"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Brain, CheckCircle2, ExternalLink, FileText, Link2, Loader2, Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { analyzeBriefing } from "@/lib/briefingClient";
import { normalizeBriefing, type BriefMaterial, type BriefingSpec } from "@/lib/briefing";

interface Props {
  value: BriefingSpec;
  speakerCount: number;
  disabled?: boolean;
  onChange: (next: BriefingSpec) => void;
  onApplyRecommendations?: (next: BriefingSpec) => void;
}

function kindFromUrl(url: string): BriefMaterial["kind"] {
  if (/youtu(?:\.be|be\.com)/i.test(url)) return "youtube";
  if (/drive\.google\.com/i.test(url)) return "drive";
  if (/^https?:\/\//i.test(url)) return "website";
  return "other";
}

export default function BriefingPanel({ value, speakerCount, disabled, onChange, onApplyRecommendations }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const parsed = useMemo(() => normalizeBriefing(value), [value]);

  const analyze = async () => {
    if (parsed.raw.trim().length < 20) { setMessage("Tempel briefing campaign terlebih dahulu."); return; }
    setBusy(true); setMessage("");
    try {
      const next = await analyzeBriefing(parsed.raw);
      onChange(next);
      onApplyRecommendations?.(next);
      setMessage(next.source === "ai" ? "Briefing berhasil dianalisis AI." : "AI tidak tersedia; briefing dianalisis dengan parser lokal.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gagal menganalisis briefing."); }
    finally { setBusy(false); }
  };

  const addMaterial = () => {
    const raw = materialUrl.trim(); if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const next: BriefMaterial = { id: crypto.randomUUID(), title: kindFromUrl(url) === "youtube" ? "YouTube materi" : "Materi", url: url.slice(0, 1000), kind: kindFromUrl(url) };
    onChange({ ...parsed, materials: [...parsed.materials, next].slice(0, 20) }); setMaterialUrl("");
  };

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center"><FileText className="w-5 h-5 text-violet-300" /></div>
        <div className="flex-1 min-w-[220px]"><h3 className="font-bold text-lg">Briefing-Aware Clipper</h3><p className="text-xs text-zinc-500 mt-1">Tempel brief campaign. Sistem akan memilih section, durasi, target speaker, CTA, branding, hashtag, dan filter konten berdasarkan aturan tersebut.</p></div>
        <label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={parsed.enabled} disabled={disabled} onChange={(e) => onChange({ ...parsed, enabled: e.target.checked })} className="accent-violet-500" /> Aktifkan briefing</label>
      </div>

      <textarea value={parsed.raw} disabled={disabled || busy} onChange={(e) => onChange({ ...parsed, raw: e.target.value.slice(0, 30000), source: "manual", analyzedAt: null })} rows={9} placeholder="Tempel briefing campaign di sini..." className="w-full rounded-xl bg-zinc-950 border border-zinc-800 px-4 py-3 text-sm text-zinc-200 resize-y focus:outline-none focus:border-violet-500" />
      <div className="flex flex-wrap gap-2 mt-3">
        <button type="button" disabled={disabled || busy || parsed.raw.trim().length < 20} onClick={() => void analyze()} className="px-4 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-sm font-semibold flex items-center gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />} Analisis Briefing</button>
        {parsed.analyzedAt && <span className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Parsed {parsed.source === "ai" ? "AI" : "lokal"}</span>}
      </div>

      {parsed.enabled && parsed.analyzedAt && <div className="mt-5 grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-zinc-500">Min durasi<input type="number" min={5} max={600} value={parsed.durationMin} onChange={(e) => onChange({ ...parsed, durationMin: Math.max(5, Number(e.target.value) || 5) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white" /></label>
            <label className="text-xs text-zinc-500">Max durasi<input type="number" min={parsed.durationMin} max={1800} value={parsed.durationMax} onChange={(e) => onChange({ ...parsed, durationMax: Math.max(parsed.durationMin, Number(e.target.value) || parsed.durationMin) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white" /></label>
          </div>
          <label className="text-xs text-zinc-500 block">Target utama<input value={parsed.targetSubject} onChange={(e) => onChange({ ...parsed, targetSubject: e.target.value.slice(0, 120) })} placeholder="contoh: David Noah" className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white" /></label>
          {parsed.requireTargetSpeaker && <label className="text-xs text-zinc-500 block"><span className="flex items-center gap-1"><UsersRound className="w-3 h-3" /> Tag target speaker</span><select value={parsed.targetSpeakerIndex ?? ""} onChange={(e) => onChange({ ...parsed, targetSpeakerIndex: e.target.value === "" ? null : Number(e.target.value) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"><option value="">Belum ditag — buat draft awal</option>{Array.from({ length: speakerCount }, (_, i) => <option key={i} value={i}>Speaker {i + 1}{parsed.targetSubject ? ` = ${parsed.targetSubject}?` : ""}</option>)}</select><span className="block mt-1 text-[10px] text-zinc-600">Identitas speaker tidak ditebak otomatis. Dengarkan preview lalu pilih label speaker yang benar.</span></label>}
          <label className="text-xs text-zinc-500 block">CTA akhir video<input value={parsed.ctaText} onChange={(e) => onChange({ ...parsed, ctaText: e.target.value.slice(0, 220) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-zinc-500 block">Link wajib di bio<input value={parsed.bioLink} onChange={(e) => onChange({ ...parsed, bioLink: e.target.value.slice(0, 500) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white" /></label>
          <div className="flex flex-wrap gap-2">{parsed.hashtags.map((tag) => <span key={tag} className="text-xs px-2 py-1 rounded-full bg-violet-500/10 text-violet-300">{tag}</span>)}{parsed.requireLogo && <span className="text-xs px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Logo wajib</span>}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
          <div className="text-xs font-semibold text-zinc-300 mb-2">Narasi yang dicari</div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">{parsed.requiredNarratives.length ? parsed.requiredNarratives.map((item, i) => <div key={i} className="text-xs text-zinc-400 flex gap-2"><span className="text-emerald-400">✓</span><span>{item}</span></div>) : <div className="text-xs text-zinc-600">Belum ada narasi terstruktur.</div>}</div>
          <div className="text-xs font-semibold text-zinc-300 mt-4 mb-2">Larangan / review</div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">{parsed.forbiddenRules.slice(0, 8).map((item, i) => <div key={i} className="text-xs text-zinc-400 flex gap-2"><AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" /><span>{item}</span></div>)}</div>
        </div>
      </div>}

      {parsed.enabled && <div className="mt-5 rounded-xl border border-zinc-800 bg-black/20 p-4">
        <div className="flex items-center gap-2 mb-3"><Link2 className="w-4 h-4 text-sky-400" /><div className="text-sm font-semibold">Materi sumber yang diizinkan</div></div>
        <div className="flex gap-2"><input value={materialUrl} onChange={(e) => setMaterialUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMaterial(); } }} placeholder="Tempel URL YouTube / Drive materi" className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" /><button type="button" onClick={addMaterial} disabled={!materialUrl.trim()} className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40"><Plus className="w-4 h-4" /></button></div>
        <div className="mt-3 space-y-2">{parsed.materials.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"><span className="text-[10px] uppercase text-zinc-500 w-16">{item.kind}</span><input value={item.title} onChange={(e) => onChange({ ...parsed, materials: parsed.materials.map((m) => m.id === item.id ? { ...m, title: e.target.value.slice(0, 120) } : m) })} className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none" /><a href={item.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-sky-300" title="Buka materi"><ExternalLink className="w-3.5 h-3.5" /></a><button type="button" onClick={() => onChange({ ...parsed, materials: parsed.materials.filter((m) => m.id !== item.id) })} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button></div>)}</div>
        <p className="text-[10px] text-zinc-600 mt-2">URL materi disimpan sebagai referensi briefing. Untuk pemrosesan, gunakan file video yang memang kamu berhak gunakan lalu Upload Video.</p>
      </div>}
      {message && <div className="text-xs text-zinc-500 mt-3">{message}</div>}
    </section>
  );
}
