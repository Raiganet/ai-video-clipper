"use client";

import { useMemo } from "react";
import { CheckCircle2, CircleAlert, ClipboardList, FolderKanban, Focus, ListChecks, RefreshCw, Rows4, Video, Wand2 } from "lucide-react";
import type { BriefingSpec } from "@/lib/briefing";
import type { BrandingSettings } from "@/lib/branding";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";
import { deriveChecklist, deriveNarrativeCoverage, normalizeWorkspace, type CampaignWorkspaceDraft } from "@/lib/campaignWorkspace";

interface ClipLike {
  id: number;
  title: string;
  briefingNarrative?: string;
  briefingFlags?: string[];
}

interface Props {
  brief: BriefingSpec;
  workspace: CampaignWorkspaceDraft;
  clips: ClipLike[];
  branding: BrandingSettings;
  clipMetadata: Record<number, ClipSocialMetadata>;
  disabled?: boolean;
  onChange: (next: CampaignWorkspaceDraft) => void;
  onFocusNarrative: (narrative: string | null) => void;
  onSelectClip?: (clipId: number) => void;
}

export default function CampaignWorkspace({ brief, workspace, clips, branding, clipMetadata, disabled, onChange, onFocusNarrative, onSelectClip }: Props) {
  const normalized = useMemo(() => normalizeWorkspace(workspace), [workspace]);
  const coverage = useMemo(() => deriveNarrativeCoverage(brief, clips), [brief, clips]);
  const checklist = useMemo(() => deriveChecklist({ brief, workspace: normalized, branding, clipMetadata, clips }), [brief, normalized, branding, clipMetadata, clips]);

  const readyCount = coverage.filter((item) => item.status === "ready").length;
  const activeFocus = normalized.focusedNarrative || null;

  if (!brief.enabled) return null;

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center"><FolderKanban className="w-5 h-5 text-emerald-300" /></div>
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-bold text-lg">Campaign Workspace</h3>
          <p className="text-xs text-zinc-500 mt-1">Kelola banyak narasi campaign, source video, cakupan kandidat klip, dan checklist siap submit. Fokus narasi bisa dipilih agar pencarian berikutnya lebih spesifik.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={normalized.enabled} disabled={disabled} onChange={(e) => onChange({ ...normalized, enabled: e.target.checked })} className="accent-emerald-500" />
          Aktifkan workspace
        </label>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-4">
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><Rows4 className="w-4 h-4 text-emerald-400" /> Coverage narasi campaign</div>
          <div className="text-xs text-zinc-500 mb-3">Siap: {readyCount}/{coverage.length || 0} narasi • Fokus saat ini: <span className="text-zinc-300">{activeFocus || "Semua narasi"}</span></div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {coverage.length === 0 && <div className="text-xs text-zinc-600">Narasi campaign akan muncul setelah briefing dianalisis.</div>}
            {coverage.map((item) => {
              const badge = item.status === "ready"
                ? "bg-emerald-500/10 text-emerald-300"
                : item.status === "partial"
                  ? "bg-amber-500/10 text-amber-300"
                  : "bg-zinc-800 text-zinc-400";
              return (
                <div key={item.narrative} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium leading-snug">{item.narrative}</div>
                      <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                        <span className={`px-2 py-1 rounded-full ${badge}`}>{item.total} kandidat</span>
                        {item.ready > 0 && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300">{item.ready} siap</span>}
                        {item.needsReview > 0 && <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-300">{item.needsReview} review</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        const next = normalized.focusedNarrative === item.narrative ? null : item.narrative;
                        onChange({ ...normalized, focusedNarrative: next });
                        onFocusNarrative(next);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${normalized.focusedNarrative === item.narrative ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}
                    >
                      <span className="inline-flex items-center gap-1"><Focus className="w-3 h-3" /> {normalized.focusedNarrative === item.narrative ? "Fokus aktif" : "Fokus"}</span>
                    </button>
                  </div>
                  {item.clipIds.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.clipIds.slice(0, 4).map((id) => {
                        const clip = clips.find((entry) => entry.id === id);
                        if (!clip) return null;
                        return (
                          <button key={id} type="button" onClick={() => onSelectClip?.(id)} className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[11px] text-zinc-300 border border-zinc-800">
                            Clip {id}: {clip.title.slice(0, 28)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={disabled} onClick={() => { onChange({ ...normalized, focusedNarrative: null, lastGeneratedAt: Date.now() }); onFocusNarrative(null); }} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Mode semua narasi</button>
            <span className="text-[11px] text-zinc-600 self-center">Setelah memilih fokus narasi, klik lagi <span className="text-zinc-400">Cari Preview Klip</span> agar sistem membuat kandidat yang lebih spesifik untuk narasi itu.</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><Video className="w-4 h-4 text-sky-400" /> Source video campaign</div>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {normalized.sourceVideos.length === 0 && <div className="text-xs text-zinc-600">Belum ada source video yang terdaftar. Upload video akan otomatis menambahkannya ke workspace.</div>}
              {normalized.sourceVideos.map((item) => (
                <div key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <div className="text-sm text-white truncate">{item.name}</div>
                  <div className="text-[11px] text-zinc-500 mt-1">{(item.size / 1024 / 1024).toFixed(1)} MB • {item.status === "uploaded" ? "Video utama" : "Referensi"}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><ListChecks className="w-4 h-4 text-amber-400" /> Checklist siap submit</div>
            <div className="space-y-2">
              {checklist.map((item) => {
                const icon = item.status === "pass"
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" />
                  : item.status === "manual"
                    ? <ClipboardList className="w-4 h-4 text-sky-400 mt-0.5" />
                    : <CircleAlert className="w-4 h-4 text-amber-400 mt-0.5" />;
                return (
                  <div key={item.key} className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                    {icon}
                    <div className="min-w-0">
                      <div className="text-xs text-white">{item.label}</div>
                      {item.detail && <div className="text-[11px] text-zinc-500 mt-0.5">{item.detail}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Wand2 className="w-4 h-4 text-violet-400" /> Catatan workspace</div>
            <textarea value={normalized.notes} onChange={(e) => onChange({ ...normalized, notes: e.target.value.slice(0, 4000) })} disabled={disabled} rows={4} placeholder="Catatan produksi, penekanan angle, atau TODO campaign..." className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 resize-y focus:outline-none focus:border-emerald-500" />
          </div>
        </div>
      </div>
    </section>
  );
}
