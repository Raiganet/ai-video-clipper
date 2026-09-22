"use client";

import type { CaptionCue } from "@/lib/captions";
import type { CampaignSubmissionStatus } from "@/lib/campaignWorkspace";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";
import { buildStoredZip, saveBlob } from "@/lib/exporters";
import { cuesToSrt, cuesToVtt } from "@/lib/subtitles";

export type InternalDecision = "pending" | "approved" | "revision" | "rejected";
export type SubmissionPlatformId = "tiktok" | "instagram_reels" | "youtube_shorts" | "campaign_portal";

export interface PlatformSubmissionState {
  enabled: boolean;
  captionChecked: boolean;
  hashtagsChecked: boolean;
  bioChecked: boolean;
  uploaded: boolean;
  submitted: boolean;
  submittedAt: number | null;
  notes: string;
}

export interface RenderRevisionEntry {
  version: number;
  renderedAt: number;
  signature: string;
  note?: string;
}

export interface ClipSubmissionReview {
  shortlisted: boolean;
  decision: InternalDecision;
  revisionNote: string;
  reviewerNote: string;
  version: number;
  lastRenderSignature: string | null;
  renderHistory: RenderRevisionEntry[];
  platforms: Record<SubmissionPlatformId, PlatformSubmissionState>;
  updatedAt: number;
}

export interface CampaignSubmissionDraft {
  clips: Record<number, ClipSubmissionReview>;
  campaignNote: string;
  finalPackageGeneratedAt: number | null;
}

export interface SubmissionClipInput {
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

export const PLATFORM_LABELS: Record<SubmissionPlatformId, string> = {
  tiktok: "TikTok",
  instagram_reels: "Instagram Reels",
  youtube_shorts: "YouTube Shorts",
  campaign_portal: "Campaign Portal",
};

export const EMPTY_SUBMISSION: CampaignSubmissionDraft = {
  clips: {},
  campaignNote: "",
  finalPackageGeneratedAt: null,
};

function defaultPlatform(enabled = false): PlatformSubmissionState {
  return {
    enabled,
    captionChecked: false,
    hashtagsChecked: false,
    bioChecked: false,
    uploaded: false,
    submitted: false,
    submittedAt: null,
    notes: "",
  };
}

export function createDefaultClipReview(): ClipSubmissionReview {
  return {
    shortlisted: false,
    decision: "pending",
    revisionNote: "",
    reviewerNote: "",
    version: 0,
    lastRenderSignature: null,
    renderHistory: [],
    platforms: {
      tiktok: defaultPlatform(true),
      instagram_reels: defaultPlatform(true),
      youtube_shorts: defaultPlatform(true),
      campaign_portal: defaultPlatform(false),
    },
    updatedAt: Date.now(),
  };
}

export function normalizeClipReview(input?: Partial<ClipSubmissionReview> | null): ClipSubmissionReview {
  const base = createDefaultClipReview();
  const decision = (["pending", "approved", "revision", "rejected"] as const).includes(input?.decision as InternalDecision)
    ? input!.decision as InternalDecision
    : "pending";
  const platforms = { ...base.platforms };
  for (const key of Object.keys(platforms) as SubmissionPlatformId[]) {
    const source = input?.platforms?.[key];
    if (!source) continue;
    platforms[key] = {
      enabled: Boolean(source.enabled),
      captionChecked: Boolean(source.captionChecked),
      hashtagsChecked: Boolean(source.hashtagsChecked),
      bioChecked: Boolean(source.bioChecked),
      uploaded: Boolean(source.uploaded),
      submitted: Boolean(source.submitted),
      submittedAt: Number.isFinite(Number(source.submittedAt)) ? Number(source.submittedAt) : null,
      notes: String(source.notes || "").slice(0, 1000),
    };
  }
  const history = Array.isArray(input?.renderHistory)
    ? input!.renderHistory!.map((entry) => ({
        version: Math.max(1, Math.round(Number(entry.version || 1))),
        renderedAt: Math.max(0, Number(entry.renderedAt || 0)),
        signature: String(entry.signature || "").slice(0, 500),
        note: String(entry.note || "").slice(0, 500),
      })).filter((entry) => entry.signature).slice(-20)
    : [];
  return {
    shortlisted: Boolean(input?.shortlisted),
    decision,
    revisionNote: String(input?.revisionNote || "").slice(0, 2000),
    reviewerNote: String(input?.reviewerNote || "").slice(0, 2000),
    version: Math.max(0, Math.round(Number(input?.version || 0))),
    lastRenderSignature: input?.lastRenderSignature ? String(input.lastRenderSignature).slice(0, 500) : null,
    renderHistory: history,
    platforms,
    updatedAt: Number.isFinite(Number(input?.updatedAt)) ? Number(input?.updatedAt) : Date.now(),
  };
}

export function normalizeCampaignSubmission(input?: Partial<CampaignSubmissionDraft> | null): CampaignSubmissionDraft {
  const clips: Record<number, ClipSubmissionReview> = {};
  if (input?.clips && typeof input.clips === "object") {
    for (const [rawId, value] of Object.entries(input.clips)) {
      const id = Number(rawId);
      if (!Number.isFinite(id) || id <= 0) continue;
      clips[id] = normalizeClipReview(value);
    }
  }
  return {
    clips,
    campaignNote: String(input?.campaignNote || "").slice(0, 4000),
    finalPackageGeneratedAt: Number.isFinite(Number(input?.finalPackageGeneratedAt)) ? Number(input?.finalPackageGeneratedAt) : null,
  };
}

export function ensureClipReview(state: CampaignSubmissionDraft, clipId: number) {
  return state.clips[clipId] ? normalizeClipReview(state.clips[clipId]) : createDefaultClipReview();
}

export function updateClipReview(stateInput: CampaignSubmissionDraft, clipId: number, patch: Partial<ClipSubmissionReview>): CampaignSubmissionDraft {
  const state = normalizeCampaignSubmission(stateInput);
  const current = ensureClipReview(state, clipId);
  return {
    ...state,
    clips: {
      ...state.clips,
      [clipId]: normalizeClipReview({ ...current, ...patch, updatedAt: Date.now() }),
    },
  };
}

export function recordRenderRevision(stateInput: CampaignSubmissionDraft, clipId: number, signature: string): CampaignSubmissionDraft {
  if (!signature) return stateInput;
  const state = normalizeCampaignSubmission(stateInput);
  const current = ensureClipReview(state, clipId);
  if (current.lastRenderSignature === signature) return state;
  const version = Math.max(1, current.version + 1);
  const entry: RenderRevisionEntry = { version, renderedAt: Date.now(), signature, note: current.revisionNote || "Render settings berubah" };
  const platforms = Object.fromEntries((Object.keys(current.platforms) as SubmissionPlatformId[]).map((key) => [key, {
    ...current.platforms[key],
    uploaded: false,
    submitted: false,
    submittedAt: null,
  }])) as Record<SubmissionPlatformId, PlatformSubmissionState>;
  return updateClipReview(state, clipId, {
    version,
    lastRenderSignature: signature,
    renderHistory: [...current.renderHistory, entry].slice(-20),
    platforms,
    decision: current.decision === "approved" ? "revision" : current.decision,
  });
}

export function setPlatformSubmission(
  stateInput: CampaignSubmissionDraft,
  clipId: number,
  platform: SubmissionPlatformId,
  patch: Partial<PlatformSubmissionState>
): CampaignSubmissionDraft {
  const state = normalizeCampaignSubmission(stateInput);
  const current = ensureClipReview(state, clipId);
  const nextPlatform = { ...current.platforms[platform], ...patch };
  if (patch.submitted === true && !nextPlatform.submittedAt) nextPlatform.submittedAt = Date.now();
  if (patch.submitted === false) nextPlatform.submittedAt = null;
  return updateClipReview(state, clipId, {
    platforms: { ...current.platforms, [platform]: nextPlatform },
  });
}

export function platformCompletion(reviewInput: ClipSubmissionReview) {
  const review = normalizeClipReview(reviewInput);
  const enabled = (Object.keys(review.platforms) as SubmissionPlatformId[]).filter((key) => review.platforms[key].enabled);
  if (!enabled.length) return { done: 0, total: 0, percent: 0 };
  const done = enabled.filter((key) => review.platforms[key].submitted).length;
  return { done, total: enabled.length, percent: Math.round((done / enabled.length) * 100) };
}

export function canEnterFinalPackage(clip: SubmissionClipInput, reviewInput: ClipSubmissionReview) {
  const review = normalizeClipReview(reviewInput);
  return review.shortlisted && review.decision === "approved" && clip.briefStatus === "ready" && clip.renderReady && Boolean(clip.blobUrl);
}

function sanitize(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 90) || "clip";
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return `"${raw.replace(/"/g, '""')}"`;
}

export function buildSubmissionManifest(projectName: string, clips: SubmissionClipInput[], stateInput: CampaignSubmissionDraft) {
  const state = normalizeCampaignSubmission(stateInput);
  const rows = clips.map((clip) => {
    const review = ensureClipReview(state, clip.id);
    const platform = platformCompletion(review);
    return {
      clipId: clip.id,
      title: clip.title,
      version: Math.max(1, review.version),
      sourceName: clip.sourceName || "",
      narrative: clip.narrative || "",
      briefStatus: clip.briefStatus,
      internalDecision: review.decision,
      shortlisted: review.shortlisted,
      revisionNote: review.revisionNote,
      reviewerNote: review.reviewerNote,
      platformsSubmitted: `${platform.done}/${platform.total}`,
      publishTitle: clip.metadata?.title || "",
      description: clip.metadata?.description || "",
      cta: clip.metadata?.cta || "",
      hashtags: (clip.metadata?.hashtags || []).join(" "),
      briefReasons: (clip.briefReasons || []).join(" | "),
    };
  });
  return {
    schema: "kastriva-ai-clipper-submission-v1",
    projectName,
    generatedAt: new Date().toISOString(),
    campaignNote: state.campaignNote,
    clips: rows,
  };
}

export function manifestToCsv(manifest: ReturnType<typeof buildSubmissionManifest>) {
  const headers = ["clipId", "title", "version", "sourceName", "narrative", "briefStatus", "internalDecision", "shortlisted", "revisionNote", "reviewerNote", "platformsSubmitted", "publishTitle", "description", "cta", "hashtags", "briefReasons"] as const;
  const lines = [headers.map(csvCell).join(",")];
  for (const row of manifest.clips) lines.push(headers.map((key) => csvCell(row[key])).join(","));
  return lines.join("\r\n");
}

export async function exportFinalSubmissionPackage(args: {
  projectName: string;
  clips: SubmissionClipInput[];
  state: CampaignSubmissionDraft;
  ratio: string;
  captionStyle: string;
  onProgress?: (percent: number) => void;
}) {
  const state = normalizeCampaignSubmission(args.state);
  const selected = args.clips.filter((clip) => canEnterFinalPackage(clip, ensureClipReview(state, clip.id)));
  if (!selected.length) throw new Error("Belum ada klip yang sekaligus Shortlist + Approved + Siap Submit + render terbaru.");

  const files: Array<{ name: string; blob: Blob }> = [];
  for (let index = 0; index < selected.length; index += 1) {
    const clip = selected[index];
    const review = ensureClipReview(state, clip.id);
    const response = await fetch(clip.blobUrl!);
    if (!response.ok) throw new Error(`Gagal membaca hasil render ${clip.title}.`);
    const prefix = `${String(index + 1).padStart(2, "0")}-${sanitize(clip.title)}-v${Math.max(1, review.version)}`;
    files.push({ name: `videos/${prefix}-${args.ratio}-${args.captionStyle}.mp4`, blob: await response.blob() });
    if (clip.cues?.length) {
      files.push({ name: `subtitles/${prefix}.srt`, blob: new Blob([cuesToSrt(clip.cues)], { type: "application/x-subrip;charset=utf-8" }) });
      files.push({ name: `subtitles/${prefix}.vtt`, blob: new Blob([cuesToVtt(clip.cues)], { type: "text/vtt;charset=utf-8" }) });
    }
    if (clip.metadata) {
      const publishText = [
        `TITLE\n${clip.metadata.title || clip.title}`,
        `\nDESCRIPTION\n${clip.metadata.description || ""}`,
        `\nCTA\n${clip.metadata.cta || ""}`,
        `\nHASHTAGS\n${(clip.metadata.hashtags || []).join(" ")}`,
      ].join("\n");
      files.push({ name: `publish/${prefix}.txt`, blob: new Blob([publishText], { type: "text/plain;charset=utf-8" }) });
    }
    args.onProgress?.(Math.round(((index + 1) / selected.length) * 45));
  }

  const manifest = buildSubmissionManifest(args.projectName, selected, state);
  files.push({ name: "submission/manifest.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json;charset=utf-8" }) });
  files.push({ name: "submission/manifest.csv", blob: new Blob([manifestToCsv(manifest)], { type: "text/csv;charset=utf-8" }) });
  files.push({ name: "submission/README.txt", blob: new Blob([
    `Kastriva AI Video Clipper — Final Campaign Package\nProject: ${args.projectName}\nGenerated: ${new Date().toLocaleString()}\n\nIsi folder:\n- videos/: MP4 final approved\n- subtitles/: SRT/VTT\n- publish/: caption/publish pack per clip\n- submission/: manifest JSON/CSV\n\nCatatan campaign:\n${state.campaignNote || "-"}\n`,
  ], { type: "text/plain;charset=utf-8" }) });

  const zip = await buildStoredZip(files, (percent) => args.onProgress?.(45 + Math.round(percent * 0.55)));
  saveBlob(zip, `${sanitize(args.projectName)}-FINAL-SUBMISSION-${Date.now()}.zip`);
  return { count: selected.length, generatedAt: Date.now() };
}
