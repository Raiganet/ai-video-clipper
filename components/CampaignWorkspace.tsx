"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, ClipboardList, FilePlus2, FolderKanban, Focus, Layers3, ListChecks, Loader2, RefreshCw, Rows4, Save, Trash2, Video, Wand2 } from "lucide-react";
import type { BriefingSpec } from "@/lib/briefing";
import type { BrandingSettings } from "@/lib/branding";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";
import { deriveChecklist, deriveNarrativeCoverage, normalizeWorkspace, type CampaignSubmissionStatus, type CampaignWorkspaceDraft } from "@/lib/campaignWorkspace";
import { applyCampaignTemplate, deleteCampaignTemplate, listCampaignTemplates, saveCampaignTemplate, type CampaignTemplate } from "@/lib/campaignTemplates";

interface ClipLike {
  id: number;
  title: string;
  sourceName?: string;
  briefingNarrative?: string;
  briefingFlags?: string[];
  submissionStatus?: CampaignSubmissionStatus;
}

interface Props {
  brief: BriefingSpec;
  workspace: CampaignWorkspaceDraft;
  clips: ClipLike[];
  branding: BrandingSettings;
  clipMetadata: Record<number, ClipSocialMetadata>;
  disabled?: boolean;
  batchStatus?: string;
  batchProgress?: number;
  loadedSourceIds?: string[];
  onChange: (next: CampaignWorkspaceDraft) => void;
  onFocusNarrative: (narrative: string | null) => void;
  onSelectClip?: (clipId: number) => void;
  onAddSourceFiles?: (files: File[]) => void;
  onRemoveSource?: (sourceId: string) => void;
  onAnalyzeSources?: () => void;
  onSetSourceSpeaker?: (sourceId: string, speakerIndex: number | null) => void;
  onApplyTemplate?: (brief: BriefingSpec, workspace: CampaignWorkspaceDraft) => void;
}

function statusBadge(status?: CampaignSubmissionStatus) {
  if (status === "ready") return { text: "Siap Submit", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" };
  if (status === "failed") return { text: "Gagal Brief", cls: "bg-red-500/10 text-red-300 border-red-500/20" };
  return { text: "Perlu Revisi", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" };
}

export default function CampaignWorkspace({
  brief,
  workspace,
  clips,
  branding,
  clipMetadata,
  disabled,
  batchStatus,
  batchProgress = 0,
  loadedSourceIds = [],
  onChange,
  onFocusNarrative,
  onSelectClip,
  onAddSourceFiles,
  onRemoveSource,
  onAnalyzeSources,
  onSetSourceSpeaker,
  onApplyTemplate,
}: Props) {
  const normalized = useMemo(() => normalizeWorkspace(workspace), [workspace]);
  const coverage = useMemo(() => deriveNarrativeCoverage(brief, clips), [brief, clips]);
  const checklist = useMemo(() => deriveChecklist({ brief, workspace: normalized, branding, clipMetadata, clips }), [brief, normalized, branding, clipMetadata, clips]);
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templateName, setTemplateName] = useState(brief.campaignName || "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTemplates(listCampaignTemplates());
  }, []);

  useEffect(() => {
    if (!templateName && brief.campaignName) setTemplateName(brief.campaignName);
  }, [brief.campaignName, templateName]);

  const readyCount = clips.filter((clip) => clip.submissionStatus === "ready").length;
  const reviseCount = clips.filter((clip) => clip.submissionStatus !== "ready" && clip.submissionStatus !== "failed").length;
  const failedCount = clips.filter((clip) => clip.submissionStatus === "failed").length;
  const activeFocus = normalized.focusedNarrative || null;

  if (!brief.enabled) return null;

  const toggleManual = (key: string, checked: boolean) => {
    const current = new Set<string>(normalized.manualReviewDone);
    if (checked) current.add(key); else current.delete(key);
    onChange({ ...normalized, manualReviewDone: Array.from(current) });
  };

  const saveTemplate = () => {
    const saved = saveCampaignTemplate({
      name: templateName || brief.campaignName || "Campaign Template",
      briefing: brief,
      workspace: normalized,
    });
    setTemplates(listCampaignTemplates());
    setTemplateName(saved.name);
  };

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center"><FolderKanban className="w-5 h-5 text-emerald-300" /></div>
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-bold text-lg">Campaign Workspace</h3>
          <p className="text-xs text-zinc-500 mt-1">Stage 14: multi-video batch + Campaign Submission Manager untuk shortlist, approval, revisi, versi, dan paket final.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={normalized.enabled} disabled={disabled} onChange={(e) => onChange({ ...normalized, enabled: e.target.checked })} className="accent-emerald-500" />
          Aktifkan workspace
        </label>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3"><div className="text-2xl font-bold text-emerald-300">{readyCount}</div><div className="text-xs text-zinc-500">Siap Submit</div></div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3"><div className="text-2xl font-bold text-amber-300">{reviseCount}</div><div className="text-xs text-zinc-500">Perlu Revisi / Review</div></div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3"><div className="text-2xl font-bold text-red-300">{failedCount}</div><div className="text-xs text-zinc-500">Gagal Brief</div></div>
      </div>

      <div className="grid xl:grid-cols-[1.15fr_.85fr] gap-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold mr-auto"><Video className="w-4 h-4 text-sky-400" /> Multi-video source campaign</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files || []) as File[];
                  if (files.length) onAddSourceFiles?.(files);
                  event.currentTarget.value = "";
                }}
              />
              <button type="button" disabled={disabled} onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-xs font-semibold flex items-center gap-1"><FilePlus2 className="w-3.5 h-3.5" /> Tambah video</button>
              <button type="button" disabled={disabled || normalized.sourceVideos.length === 0 || !brief.analyzedAt} onClick={onAnalyzeSources} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-xs font-semibold flex items-center gap-1">{disabled ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers3 className="w-3.5 h-3.5" />} Analisis Semua Video</button>
            </div>

            <div className="grid sm:grid-cols-[1fr_180px] gap-3 mb-3">
              <label className="text-xs text-zinc-500">Kandidat per narasi
                <select value={normalized.candidateTargetPerNarrative} disabled={disabled} onChange={(e) => onChange({ ...normalized, candidateTargetPerNarrative: Number(e.target.value) })} className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white">
                  {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} kandidat / narasi</option>)}
                </select>
              </label>
              <div className="text-[11px] text-zinc-600 self-end pb-2">Semakin tinggi jumlah kandidat, semakin besar penggunaan quota AI dan waktu analisis.</div>
            </div>

            {disabled && batchStatus && (
              <div className="mb-3 rounded-lg border border-sky-500/20 bg-sky-500/10 p-3">
                <div className="flex justify-between text-xs text-sky-200 gap-3"><span>{batchStatus}</span><span>{Math.round(batchProgress)}%</span></div>
                <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className="h-full bg-sky-400 transition-all" style={{ width: `${Math.max(0, Math.min(100, batchProgress))}%` }} /></div>
              </div>
            )}

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {normalized.sourceVideos.length === 0 && <div className="text-xs text-zinc-600">Belum ada source video. Tambahkan beberapa video YouTube/Drive yang sudah kamu download secara sah sebagai file lokal.</div>}
              {normalized.sourceVideos.map((item) => {
                const loaded = loadedSourceIds.includes(item.id);
                const statusText = item.analysisStatus === "analyzing" ? "Menganalisis" : item.analysisStatus === "done" ? `${item.candidateCount || 0} kandidat` : item.analysisStatus === "error" ? "Gagal" : "Belum dianalisis";
                return (
                  <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white truncate" title={item.name}>{item.name}</div>
                        <div className="text-[11px] text-zinc-500 mt-1">{(item.size / 1024 / 1024).toFixed(1)} MB {item.duration ? `• ${Math.round(item.duration)} dtk` : ""} • {statusText}</div>
                        {item.error && <div className="text-[11px] text-red-300 mt-1 line-clamp-2">{item.error}</div>}
                      </div>
                      <button type="button" disabled={disabled} onClick={() => onRemoveSource?.(item.id)} className="p-1.5 text-zinc-600 hover:text-red-400 disabled:opacity-40" title="Hapus source"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    {brief.requireTargetSpeaker && item.speakerCount && item.speakerCount > 0 ? (
                      <label className="text-[11px] text-zinc-500 block mt-3">Target speaker untuk source ini
                        <select value={item.targetSpeakerIndex ?? ""} disabled={disabled} onChange={(e) => onSetSourceSpeaker?.(item.id, e.target.value === "" ? null : Number(e.target.value))} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white">
                          <option value="">Belum ditag — perlu review</option>
                          {Array.from({ length: item.speakerCount }, (_, index) => <option key={index} value={index}>Speaker {index + 1}{brief.targetSubject ? ` = ${brief.targetSubject}?` : ""}</option>)}
                        </select>
                      </label>
                    ) : null}
                    {!loaded && <div className="text-[10px] text-amber-300 mt-2">File source belum tersedia di sesi ini. Pilih ulang file untuk analisis/render.</div>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><Rows4 className="w-4 h-4 text-emerald-400" /> Coverage narasi campaign</div>
            <div className="text-xs text-zinc-500 mb-3">Fokus saat ini: <span className="text-zinc-300">{activeFocus || "Semua narasi"}</span></div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {coverage.length === 0 && <div className="text-xs text-zinc-600">Narasi campaign akan muncul setelah briefing dianalisis.</div>}
              {coverage.map((item) => {
                const badge = item.status === "ready" ? "bg-emerald-500/10 text-emerald-300" : item.status === "partial" ? "bg-amber-500/10 text-amber-300" : "bg-zinc-800 text-zinc-400";
                return (
                  <div key={item.narrative} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium leading-snug">{item.narrative}</div>
                        <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                          <span className={`px-2 py-1 rounded-full ${badge}`}>{item.total} kandidat</span>
                          {item.ready > 0 && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300">{item.ready} siap</span>}
                          {item.needsReview > 0 && <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-300">{item.needsReview} revisi</span>}
                          {item.failed > 0 && <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-300">{item.failed} gagal</span>}
                        </div>
                      </div>
                      <button type="button" disabled={disabled} onClick={() => {
                        const next = normalized.focusedNarrative === item.narrative ? null : item.narrative;
                        onChange({ ...normalized, focusedNarrative: next });
                        onFocusNarrative(next);
                      }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${normalized.focusedNarrative === item.narrative ? "bg-emerald-600 border-emerald-500 text-white" : "bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
                        <span className="inline-flex items-center gap-1"><Focus className="w-3 h-3" /> {normalized.focusedNarrative === item.narrative ? "Fokus aktif" : "Fokus"}</span>
                      </button>
                    </div>
                    {item.clipIds.length > 0 && (
                      <div className="mt-3 grid sm:grid-cols-2 gap-2">
                        {item.clipIds.slice(0, 8).map((id) => {
                          const clip = clips.find((entry) => entry.id === id);
                          if (!clip) return null;
                          const badgeInfo = statusBadge(clip.submissionStatus);
                          return (
                            <button key={id} type="button" onClick={() => onSelectClip?.(id)} className="text-left px-2.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-[11px] text-zinc-300 border border-zinc-800">
                              <div className="truncate">Clip {id}: {clip.title}</div>
                              <div className="flex items-center gap-2 mt-1"><span className={`px-1.5 py-0.5 rounded-full border ${badgeInfo.cls}`}>{badgeInfo.text}</span>{clip.sourceName && <span className="text-zinc-600 truncate">{clip.sourceName}</span>}</div>
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
              <span className="text-[11px] text-zinc-600 self-center">Pilih Fokus lalu analisis ulang jika ingin kandidat tambahan khusus satu angle.</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><Save className="w-4 h-4 text-violet-400" /> Campaign Template</div>
            <div className="flex gap-2">
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value.slice(0, 120))} placeholder="Nama template, mis. Fortis Circle" className="min-w-0 flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
              <button type="button" disabled={disabled || !brief.analyzedAt} onClick={saveTemplate} className="px-3 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-800 text-xs font-semibold">Simpan</button>
            </div>
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
              {templates.length === 0 && <div className="text-xs text-zinc-600">Belum ada template tersimpan di browser ini.</div>}
              {templates.map((template) => (
                <div key={template.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <div className="min-w-0 flex-1"><div className="text-xs text-white truncate">{template.name}</div><div className="text-[10px] text-zinc-600">{template.briefing.requiredNarratives.length} narasi • {template.candidateTargetPerNarrative} kandidat/narasi</div></div>
                  <button type="button" disabled={disabled} onClick={() => {
                    const applied = applyCampaignTemplate(template, normalized);
                    onApplyTemplate?.(applied.briefing, applied.workspace);
                    setTemplateName(template.name);
                  }} className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px]">Pakai</button>
                  <button type="button" disabled={disabled} onClick={() => { deleteCampaignTemplate(template.id); setTemplates(listCampaignTemplates()); }} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold"><ListChecks className="w-4 h-4 text-amber-400" /> Checklist siap submit</div>
            <div className="space-y-2">
              {checklist.map((item) => {
                const icon = item.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> : item.status === "manual" ? <ClipboardList className="w-4 h-4 text-sky-400 mt-0.5" /> : <CircleAlert className="w-4 h-4 text-amber-400 mt-0.5" />;
                return <div key={item.key} className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">{icon}<div className="min-w-0"><div className="text-xs text-white">{item.label}</div>{item.detail && <div className="text-[11px] text-zinc-500 mt-0.5">{item.detail}</div>}</div></div>;
              })}
            </div>
            {(brief.bioLink || brief.manualChecks.length > 0) && (
              <div className="mt-4 border-t border-zinc-800 pt-3 space-y-2">
                <div className="text-[11px] text-zinc-500">Konfirmasi manual — centang hanya setelah benar-benar diperiksa.</div>
                {brief.bioLink && <label className="flex items-start gap-2 text-xs text-zinc-300"><input type="checkbox" checked={normalized.manualReviewDone.includes("__bio_link__")} onChange={(e) => toggleManual("__bio_link__", e.target.checked)} className="mt-0.5 accent-emerald-500" /><span>Link <b>{brief.bioLink}</b> sudah dipasang di bio profile.</span></label>}
                {brief.manualChecks.map((item) => <label key={item} className="flex items-start gap-2 text-xs text-zinc-300"><input type="checkbox" checked={normalized.manualReviewDone.includes(item)} onChange={(e) => toggleManual(item, e.target.checked)} className="mt-0.5 accent-emerald-500" /><span>{item}</span></label>)}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Wand2 className="w-4 h-4 text-violet-400" /> Catatan workspace</div>
            <textarea value={normalized.notes} onChange={(e) => onChange({ ...normalized, notes: e.target.value.slice(0, 4000) })} disabled={disabled} rows={5} placeholder="Catatan produksi, penekanan angle, atau TODO campaign..." className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 resize-y focus:outline-none focus:border-emerald-500" />
          </div>
        </div>
      </div>
    </section>
  );
}
