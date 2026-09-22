"use client";

import { useMemo, useState } from "react";
import { Archive, CheckCircle2, CircleAlert, ClipboardCheck, History, ListChecks, Loader2, RotateCcw, Send, ShieldCheck, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import type { CampaignSubmissionStatus } from "@/lib/campaignWorkspace";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";
import type { CaptionCue } from "@/lib/captions";
import {
  EMPTY_SUBMISSION,
  PLATFORM_LABELS,
  canEnterFinalPackage,
  ensureClipReview,
  exportFinalSubmissionPackage,
  normalizeCampaignSubmission,
  platformCompletion,
  setPlatformSubmission,
  updateClipReview,
  type CampaignSubmissionDraft,
  type InternalDecision,
  type SubmissionClipInput,
  type SubmissionPlatformId,
} from "@/lib/submissionManager";

interface ClipItem {
  id: number;
  title: string;
  sourceName?: string;
  narrative?: string;
  briefStatus: CampaignSubmissionStatus;
  briefReasons?: string[];
  renderReady: boolean;
  blobUrl?: string | null;
  cues?: CaptionCue[];
  metadata?: ClipSocialMetadata;
}

interface Props {
  projectName: string;
  clips: ClipItem[];
  value?: CampaignSubmissionDraft;
  ratio: string;
  captionStyle: string;
  disabled?: boolean;
  onChange: (next: CampaignSubmissionDraft) => void;
  onSelectClip?: (clipId: number) => void;
}

function decisionLabel(decision: InternalDecision) {
  if (decision === "approved") return "Approved";
  if (decision === "revision") return "Perlu Revisi";
  if (decision === "rejected") return "Rejected";
  return "Pending";
}

function decisionClass(decision: InternalDecision) {
  if (decision === "approved") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (decision === "revision") return "text-amber-300 bg-amber-500/10 border-amber-500/20";
  if (decision === "rejected") return "text-red-300 bg-red-500/10 border-red-500/20";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
}

function briefClass(status: CampaignSubmissionStatus) {
  if (status === "ready") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (status === "failed") return "text-red-300 bg-red-500/10 border-red-500/20";
  return "text-amber-300 bg-amber-500/10 border-amber-500/20";
}

function briefLabel(status: CampaignSubmissionStatus) {
  if (status === "ready") return "Siap Submit";
  if (status === "failed") return "Gagal Brief";
  return "Perlu Revisi";
}

export default function CampaignSubmissionManager({ projectName, clips, value = EMPTY_SUBMISSION, ratio, captionStyle, disabled, onChange, onSelectClip }: Props) {
  const state = useMemo(() => normalizeCampaignSubmission(value), [value]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");

  const stats = useMemo(() => {
    let shortlist = 0, approved = 0, revision = 0, rejected = 0, finalReady = 0;
    for (const clip of clips) {
      const review = ensureClipReview(state, clip.id);
      if (review.shortlisted) shortlist += 1;
      if (review.decision === "approved") approved += 1;
      if (review.decision === "revision") revision += 1;
      if (review.decision === "rejected") rejected += 1;
      if (canEnterFinalPackage(clip, review)) finalReady += 1;
    }
    return { shortlist, approved, revision, rejected, finalReady };
  }, [clips, state]);

  const updateDecision = (clipId: number, decision: InternalDecision) => {
    const current = ensureClipReview(state, clipId);
    onChange(updateClipReview(state, clipId, {
      decision,
      shortlisted: decision === "approved" ? true : current.shortlisted,
    }));
  };

  const exportFinal = async () => {
    setBusy(true); setMessage(""); setProgress(0);
    try {
      const result = await exportFinalSubmissionPackage({ projectName, clips, state, ratio, captionStyle, onProgress: setProgress });
      onChange({ ...state, finalPackageGeneratedAt: result.generatedAt });
      setMessage(`Paket final berhasil dibuat: ${result.count} klip approved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal membuat paket final.");
    } finally {
      setBusy(false);
      window.setTimeout(() => setProgress(0), 1200);
    }
  };

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-8">
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-sky-500/15 border border-sky-500/20 flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-sky-300" /></div>
        <div className="flex-1 min-w-[220px]">
          <h3 className="font-bold text-lg">Campaign Submission Manager</h3>
          <p className="text-xs text-zinc-500 mt-1">Shortlist kandidat final, approve/reject internal, catat revisi per versi, cek submission per platform, lalu buat satu paket final campaign.</p>
        </div>
        <button type="button" disabled={disabled || busy || stats.finalReady === 0} onClick={() => void exportFinal()} className="px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-sm font-semibold flex items-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />} Paket Final ({stats.finalReady})
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {[
          ["Shortlist", stats.shortlist, "text-violet-300"],
          ["Approved", stats.approved, "text-emerald-300"],
          ["Revisi", stats.revision, "text-amber-300"],
          ["Rejected", stats.rejected, "text-red-300"],
          ["Final Ready", stats.finalReady, "text-sky-300"],
        ].map(([label, count, cls]) => <div key={String(label)} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"><div className={`text-xl font-bold ${cls}`}>{count}</div><div className="text-[11px] text-zinc-500">{label}</div></div>)}
      </div>

      <textarea value={state.campaignNote} onChange={(e) => onChange({ ...state, campaignNote: e.target.value.slice(0, 4000) })} disabled={disabled} rows={3} placeholder="Catatan final campaign / instruksi submit..." className="w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 resize-y focus:outline-none focus:border-sky-500 mb-4" />

      <div className="space-y-3">
        {clips.length === 0 && <div className="text-sm text-zinc-600 text-center py-8">Belum ada kandidat klip.</div>}
        {clips.map((clip) => {
          const review = ensureClipReview(state, clip.id);
          const completion = platformCompletion(review);
          const expanded = expandedId === clip.id;
          const finalReady = canEnterFinalPackage(clip, review);
          return (
            <div key={clip.id} className={`rounded-xl border p-4 ${finalReady ? "border-sky-500/30 bg-sky-500/5" : "border-zinc-800 bg-black/20"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <label className="mt-1 flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                  <input type="checkbox" checked={review.shortlisted} disabled={disabled || clip.briefStatus === "failed"} onChange={(e) => onChange(updateClipReview(state, clip.id, { shortlisted: e.target.checked }))} className="accent-violet-500" />
                  <Star className={`w-4 h-4 ${review.shortlisted ? "text-violet-300 fill-violet-300" : "text-zinc-600"}`} />
                </label>
                <button type="button" onClick={() => onSelectClip?.(clip.id)} className="text-left flex-1 min-w-[220px]">
                  <div className="font-semibold text-sm text-white">Clip {clip.id} • {clip.title}</div>
                  <div className="text-[11px] text-zinc-500 mt-1">{clip.sourceName || "Source"}{clip.narrative ? ` • ${clip.narrative}` : ""}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`text-[10px] px-2 py-1 rounded-full border ${briefClass(clip.briefStatus)}`}>{briefLabel(clip.briefStatus)}</span>
                    <span className={`text-[10px] px-2 py-1 rounded-full border ${decisionClass(review.decision)}`}>{decisionLabel(review.decision)}</span>
                    <span className="text-[10px] px-2 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300">{review.version > 0 ? `v${review.version}` : "Belum render"}</span>
                    {clip.renderReady ? <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Render terbaru</span> : <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">Perlu render</span>}
                    {finalReady && <span className="text-[10px] px-2 py-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Final package</span>}
                  </div>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" disabled={disabled || clip.briefStatus === "failed"} onClick={() => updateDecision(clip.id, "approved")} className="px-2.5 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> Approve</button>
                  <button type="button" disabled={disabled} onClick={() => updateDecision(clip.id, "revision")} className="px-2.5 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Revisi</button>
                  <button type="button" disabled={disabled} onClick={() => updateDecision(clip.id, "rejected")} className="px-2.5 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5" /> Reject</button>
                  <button type="button" onClick={() => setExpandedId(expanded ? null : clip.id)} className="px-2.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> Detail</button>
                </div>
              </div>

              {review.decision === "revision" && (
                <div className="mt-3">
                  <label className="text-[11px] text-amber-300">Catatan revisi</label>
                  <textarea value={review.revisionNote} onChange={(e) => onChange(updateClipReview(state, clip.id, { revisionNote: e.target.value.slice(0, 2000) }))} disabled={disabled} rows={2} placeholder="Contoh: CTA terlalu cepat, ganti hook 3 detik pertama, crop wajah lebih ke kanan..." className="mt-1 w-full rounded-lg bg-zinc-950 border border-amber-500/20 px-3 py-2 text-sm text-zinc-200 resize-y" />
                </div>
              )}

              {expanded && (
                <div className="mt-4 border-t border-zinc-800 pt-4 grid lg:grid-cols-[.75fr_1.25fr] gap-4">
                  <div>
                    <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 mb-2"><History className="w-3.5 h-3.5" /> Riwayat versi</div>
                    <div className="text-[10px] text-zinc-600 mb-2">Riwayat menyimpan metadata versi. Browser hanya mempertahankan file render aktif.</div><div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {review.renderHistory.length === 0 && <div className="text-[11px] text-zinc-600">Belum ada render version tercatat.</div>}
                      {[...review.renderHistory].reverse().map((entry) => <div key={`${entry.version}-${entry.renderedAt}`} className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2"><div className="text-xs text-white">v{entry.version} • {new Date(entry.renderedAt).toLocaleString()}</div><div className="text-[10px] text-zinc-600 mt-1 truncate">{entry.note || "Render settings berubah"}</div></div>)}
                    </div>
                    <label className="text-[11px] text-zinc-500 block mt-3">Catatan reviewer</label>
                    <textarea value={review.reviewerNote} onChange={(e) => onChange(updateClipReview(state, clip.id, { reviewerNote: e.target.value.slice(0, 2000) }))} disabled={disabled} rows={3} className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 resize-y" placeholder="Catatan approval/internal..." />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2"><div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> Checklist platform</div><div className="text-[11px] text-zinc-500">Submitted {completion.done}/{completion.total}</div></div>
                    <div className="space-y-2">
                      {(Object.keys(PLATFORM_LABELS) as SubmissionPlatformId[]).map((platformId) => {
                        const platform = review.platforms[platformId];
                        return (
                          <div key={platformId} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <label className="flex items-center gap-2 text-xs font-semibold text-white"><input type="checkbox" checked={platform.enabled} disabled={disabled} onChange={(e) => onChange(setPlatformSubmission(state, clip.id, platformId, { enabled: e.target.checked }))} className="accent-sky-500" /> {PLATFORM_LABELS[platformId]}</label>
                              {platform.submitted && <span className="ml-auto text-[10px] text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Submitted</span>}
                            </div>
                            {platform.enabled && <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-zinc-400">
                              {[
                                ["captionChecked", "Caption"],
                                ["hashtagsChecked", "Hashtag"],
                                ["bioChecked", "Bio link"],
                                ["uploaded", "Uploaded"],
                                ["submitted", "Submit"],
                              ].map(([key, label]) => <label key={key} className="flex items-center gap-1.5"><input type="checkbox" checked={Boolean(platform[key as keyof typeof platform])} disabled={disabled} onChange={(e) => onChange(setPlatformSubmission(state, clip.id, platformId, { [key]: e.target.checked } as Partial<typeof platform>))} className="accent-emerald-500" /> {label}</label>)}
                            </div>}
                            {platform.enabled && <input value={platform.notes} disabled={disabled} onChange={(e) => onChange(setPlatformSubmission(state, clip.id, platformId, { notes: e.target.value.slice(0, 1000) }))} placeholder="URL post / catatan submission..." className="mt-2 w-full rounded-lg bg-black/30 border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {busy && <div className="mt-4"><div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-sky-500 transition-all" style={{ width: `${progress}%` }} /></div><div className="text-[11px] text-zinc-500 mt-1">Menyusun paket final • {progress}%</div></div>}
      {message && <div className="mt-3 text-xs text-zinc-400 flex items-center gap-2">{message.includes("berhasil") ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <CircleAlert className="w-4 h-4 text-amber-400" />}{message}</div>}
    </section>
  );
}
