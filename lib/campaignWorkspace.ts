import type { BrandingSettings } from "@/lib/branding";
import type { BriefingSpec, BriefComplianceCheck } from "@/lib/briefing";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";

export type CampaignSourceAnalysisStatus = "pending" | "analyzing" | "done" | "error";
export type CampaignSubmissionStatus = "ready" | "revise" | "failed";

export interface CampaignVideoSource {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  status: "uploaded" | "referenced";
  analysisStatus?: CampaignSourceAnalysisStatus;
  speakerCount?: number;
  targetSpeakerIndex?: number | null;
  candidateCount?: number;
  error?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export interface CampaignWorkspaceDraft {
  enabled: boolean;
  focusedNarrative: string | null;
  sourceVideos: CampaignVideoSource[];
  lastGeneratedAt: number | null;
  notes: string;
  candidateTargetPerNarrative: number;
  manualReviewDone: string[];
}

export interface CampaignNarrativeCoverage {
  narrative: string;
  clipIds: number[];
  total: number;
  ready: number;
  needsReview: number;
  failed: number;
  status: "ready" | "partial" | "empty";
}

export interface CampaignChecklistItem {
  key: string;
  label: string;
  status: "pass" | "warning" | "fail" | "manual";
  detail?: string;
}

export const EMPTY_WORKSPACE: CampaignWorkspaceDraft = {
  enabled: false,
  focusedNarrative: null,
  sourceVideos: [],
  lastGeneratedAt: null,
  notes: "",
  candidateTargetPerNarrative: 2,
  manualReviewDone: [],
};

export interface WorkspaceClipLike {
  id: number;
  briefingNarrative?: string;
  briefingFlags?: string[];
  submissionStatus?: CampaignSubmissionStatus;
}

function uniq<T>(values: T[]) {
  return Array.from(new Set(values));
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function words(value: string) {
  return normalizeText(value).split(" ").filter((word) => word.length >= 4);
}

export function sameNarrative(a: string, b: string) {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aWords = words(a);
  const bWords = words(b);
  if (!aWords.length || !bWords.length) return false;
  const hits = aWords.filter((word) => bWords.includes(word)).length;
  return hits >= Math.max(2, Math.min(4, Math.floor(Math.min(aWords.length, bWords.length) * 0.5)));
}

export function campaignSourceId(file: Pick<File, "name" | "lastModified" | "size">) {
  let hash = 2166136261;
  const raw = `${file.name}|${file.lastModified}|${file.size}`;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `src-${(hash >>> 0).toString(36)}`;
}

export function normalizeWorkspace(input?: Partial<CampaignWorkspaceDraft> | null): CampaignWorkspaceDraft {
  const sourceVideos = Array.isArray(input?.sourceVideos)
    ? input!.sourceVideos!.map((item, index) => ({
        id: String(item?.id || `source-${index + 1}`).slice(0, 80),
        name: String(item?.name || `Source ${index + 1}`).slice(0, 180),
        size: Math.max(0, Number(item?.size || 0)),
        type: String(item?.type || "video/mp4").slice(0, 120),
        lastModified: Math.max(0, Number(item?.lastModified || 0)),
        status: item?.status === "referenced" ? "referenced" as const : "uploaded" as const,
        analysisStatus: (["pending", "analyzing", "done", "error"] as const).includes(item?.analysisStatus as CampaignSourceAnalysisStatus) ? item!.analysisStatus : "pending" as const,
        speakerCount: Math.max(0, Number(item?.speakerCount || 0)),
        targetSpeakerIndex: Number.isInteger(item?.targetSpeakerIndex) && Number(item?.targetSpeakerIndex) >= 0 ? Number(item?.targetSpeakerIndex) : null,
        candidateCount: Math.max(0, Number(item?.candidateCount || 0)),
        error: String(item?.error || "").slice(0, 500),
        duration: Math.max(0, Number(item?.duration || 0)),
        width: Math.max(0, Number(item?.width || 0)),
        height: Math.max(0, Number(item?.height || 0)),
      }))
    : [];
  return {
    enabled: Boolean(input?.enabled),
    focusedNarrative: input?.focusedNarrative ? String(input.focusedNarrative).slice(0, 400) : null,
    sourceVideos,
    lastGeneratedAt: Number.isFinite(Number(input?.lastGeneratedAt)) ? Number(input?.lastGeneratedAt) : null,
    notes: String(input?.notes || "").slice(0, 4000),
    candidateTargetPerNarrative: Math.max(1, Math.min(4, Number(input?.candidateTargetPerNarrative || 2))),
    manualReviewDone: Array.isArray(input?.manualReviewDone) ? uniq(input!.manualReviewDone!.map(String).map((item) => item.slice(0, 500))).slice(0, 40) : [],
  };
}

export function upsertWorkspaceSource(workspaceInput: CampaignWorkspaceDraft, file: File | null, status: CampaignVideoSource["status"] = "uploaded") {
  const workspace = normalizeWorkspace(workspaceInput);
  if (!file) return workspace;
  const id = campaignSourceId(file);
  const existingItem = workspace.sourceVideos.find((item) => item.id === id);
  const next: CampaignVideoSource = {
    id,
    name: file.name,
    size: file.size,
    type: file.type || "video/mp4",
    lastModified: file.lastModified,
    status,
    analysisStatus: existingItem?.analysisStatus || "pending",
    speakerCount: existingItem?.speakerCount || 0,
    targetSpeakerIndex: existingItem?.targetSpeakerIndex ?? null,
    candidateCount: existingItem?.candidateCount || 0,
    error: existingItem?.error || "",
    duration: existingItem?.duration || 0,
    width: existingItem?.width || 0,
    height: existingItem?.height || 0,
  };
  const existing = workspace.sourceVideos.findIndex((item) => item.id === next.id);
  const sourceVideos = existing >= 0
    ? workspace.sourceVideos.map((item, index) => index === existing ? next : item)
    : [next, ...workspace.sourceVideos].slice(0, 12);
  return { ...workspace, sourceVideos };
}

export function updateWorkspaceSource(workspaceInput: CampaignWorkspaceDraft, sourceId: string, patch: Partial<CampaignVideoSource>) {
  const workspace = normalizeWorkspace(workspaceInput);
  return {
    ...workspace,
    sourceVideos: workspace.sourceVideos.map((item) => item.id === sourceId ? { ...item, ...patch, id: item.id } : item),
  };
}

export function removeWorkspaceSource(workspaceInput: CampaignWorkspaceDraft, sourceId: string) {
  const workspace = normalizeWorkspace(workspaceInput);
  return { ...workspace, sourceVideos: workspace.sourceVideos.filter((item) => item.id !== sourceId) };
}

export function deriveNarrativeCoverage(brief: BriefingSpec, clips: WorkspaceClipLike[]): CampaignNarrativeCoverage[] {
  return brief.requiredNarratives.map((narrative) => {
    const matches = clips.filter((clip) => clip.briefingNarrative && sameNarrative(clip.briefingNarrative, narrative));
    const ready = matches.filter((clip) => clip.submissionStatus === "ready").length;
    const failed = matches.filter((clip) => clip.submissionStatus === "failed").length;
    const needsReview = matches.length - ready - failed;
    return {
      narrative,
      clipIds: matches.map((clip) => clip.id),
      total: matches.length,
      ready,
      needsReview,
      failed,
      status: matches.length === 0 ? "empty" : ready > 0 ? "ready" : "partial",
    };
  });
}

export function deriveChecklist(args: {
  brief: BriefingSpec;
  workspace: CampaignWorkspaceDraft;
  branding: BrandingSettings;
  clipMetadata: Record<number, ClipSocialMetadata>;
  clips: WorkspaceClipLike[];
}): CampaignChecklistItem[] {
  const { brief, workspace, branding, clipMetadata, clips } = args;
  const coverage = deriveNarrativeCoverage(brief, clips);
  const allTags = uniq(Object.values(clipMetadata).flatMap((meta) => meta.hashtags || []).map((item) => item.toLowerCase()));
  const missingTags = brief.hashtags.filter((tag) => !allTags.includes(tag.toLowerCase()));
  const done = new Set(workspace.manualReviewDone);
  const allManualDone = brief.manualChecks.every((item) => done.has(item));
  const bioDone = !brief.bioLink || done.has("__bio_link__");
  return [
    { key: "brief", label: "Briefing sudah dianalisis", status: brief.enabled && !!brief.analyzedAt ? "pass" : "fail", detail: brief.enabled ? (brief.analyzedAt ? "Briefing parsed" : "Klik Analisis Briefing") : "Aktifkan briefing" },
    { key: "source", label: "Video sumber campaign tersedia", status: workspace.sourceVideos.length ? "pass" : "fail", detail: workspace.sourceVideos.length ? `${workspace.sourceVideos.length} source terdaftar` : "Upload minimal 1 video sumber" },
    { key: "coverage", label: "Setiap narasi memiliki kandidat", status: coverage.length && coverage.every((item) => item.total > 0) ? "pass" : coverage.some((item) => item.total > 0) ? "warning" : "fail", detail: coverage.length ? `${coverage.filter((item) => item.total > 0).length}/${coverage.length} narasi sudah punya kandidat` : "Belum ada narasi briefing" },
    { key: "logo", label: "Logo campaign", status: brief.requireLogo ? (branding.enabled && !!branding.logoDataUrl ? "pass" : "fail") : "pass", detail: brief.requireLogo ? (branding.logoDataUrl ? "Logo siap render" : "Upload logo di Branding") : "Tidak diwajibkan" },
    { key: "speaker", label: "Target speaker per source", status: brief.requireTargetSpeaker ? (workspace.sourceVideos.length > 0 && workspace.sourceVideos.every((item) => !item.speakerCount || item.targetSpeakerIndex !== null) ? "pass" : "warning") : "pass", detail: brief.requireTargetSpeaker ? "Tag speaker target pada setiap source yang sudah dianalisis" : "Tidak diwajibkan" },
    { key: "cta", label: "CTA campaign tersedia", status: brief.ctaText.trim() ? "pass" : "warning", detail: brief.ctaText || "Tambahkan CTA di briefing" },
    { key: "hashtags", label: "Hashtag campaign masuk Publish Pack", status: brief.hashtags.length === 0 ? "pass" : missingTags.length === 0 ? "pass" : "warning", detail: missingTags.length ? `Belum ada: ${missingTags.join(" ")}` : brief.hashtags.join(" ") },
    { key: "bio", label: "Link bio profile sudah dipasang", status: bioDone ? "pass" : "manual", detail: brief.bioLink || "Tidak diwajibkan" },
    { key: "manual", label: "Manual review campaign", status: allManualDone ? "pass" : brief.manualChecks.length ? "manual" : "pass", detail: brief.manualChecks.length ? `${brief.manualChecks.filter((item) => done.has(item)).length}/${brief.manualChecks.length} review dikonfirmasi` : "Tidak ada manual review khusus" },
  ];
}

export function deriveClipSubmissionStatus(args: {
  compliance: BriefComplianceCheck[];
  flags?: string[];
  renderReady: boolean;
  hasPublishPack: boolean;
  brief: BriefingSpec;
  workspace: CampaignWorkspaceDraft;
}): { status: CampaignSubmissionStatus; reasons: string[] } {
  const reasons: string[] = [];
  const hardFlag = (args.flags || []).find((flag) => /(topik terlarang|larangan klaim finansial|target speaker kurang dominan)/i.test(flag));
  if (hardFlag) reasons.push(hardFlag);
  const hardFailedChecks = args.compliance.filter((item) => item.status === "fail" && ["duration", "speaker", "content"].includes(item.key));
  reasons.push(...hardFailedChecks.map((item) => item.detail || item.label));
  if (reasons.length) return { status: "failed", reasons: uniq(reasons) };

  const fixableFailedChecks = args.compliance.filter((item) => item.status === "fail" && !["duration", "speaker", "content"].includes(item.key));
  const softFlags = (args.flags || []).filter((flag) => /(belum ditag|perlu review|review klaim)/i.test(flag));
  const done = new Set(args.workspace.manualReviewDone);
  const manualMissing = args.brief.manualChecks.filter((item) => !done.has(item));
  if (args.brief.bioLink && !done.has("__bio_link__")) manualMissing.push(`Pasang ${args.brief.bioLink} di bio profile`);
  const softChecks = args.compliance.filter((item) => {
    if (item.status === "warning") return true;
    if (item.status !== "manual") return false;
    if (item.key === "bio") return !done.has("__bio_link__");
    return !done.has(item.label);
  });
  reasons.push(...softFlags);
  reasons.push(...fixableFailedChecks.map((item) => item.detail || item.label));
  if (!args.renderReady) reasons.push("Video belum dirender dengan setting terbaru");
  if ((args.brief.hashtags.length || args.brief.ctaText) && !args.hasPublishPack) reasons.push("Publish Pack belum dibuat");
  reasons.push(...softChecks.map((item) => item.detail || item.label));
  reasons.push(...manualMissing);
  if (reasons.length) return { status: "revise", reasons: uniq(reasons) };
  return { status: "ready", reasons: [] };
}

export interface WorkspaceMomentLike {
  candidateId: number;
  score: number;
  title: string;
  reason: string;
  narrative: string;
  flags: string[];
}

export interface WorkspaceCandidateLike {
  id: number;
  start: number;
  end: number;
  flags: string[];
  narrativeHint: string;
}

function overlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  const seconds = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return seconds / Math.max(1, Math.min(a.end - a.start, b.end - b.start));
}

export function chooseCampaignWorkspaceMoments(args: {
  brief: BriefingSpec;
  candidates: WorkspaceCandidateLike[];
  rankings: WorkspaceMomentLike[];
  maxClips: number;
  focusedNarrative?: string | null;
  maxPerNarrative?: number;
}) {
  const { brief, maxClips } = args;
  const focusedNarrative = args.focusedNarrative ? String(args.focusedNarrative) : "";
  const maxPerNarrative = Math.max(1, args.maxPerNarrative || 2);
  const byId = new Map(args.candidates.map((candidate) => [candidate.id, candidate]));
  const ranked = args.rankings.map((rank) => ({ rank, candidate: byId.get(rank.candidateId) }))
    .filter((item): item is { rank: WorkspaceMomentLike; candidate: WorkspaceCandidateLike } => Boolean(item.candidate))
    .filter((item) => !(item.rank.flags || []).some((flag) => /(topik terlarang|larangan klaim finansial|target speaker kurang dominan)/i.test(flag)))
    .sort((a, b) => b.rank.score - a.rank.score);

  const chosen: Array<{ start: number; end: number; score: number; title: string; reason: string; narrative: string; flags: string[] }> = [];
  const counts = new Map<string, number>();
  const narratives = focusedNarrative
    ? [focusedNarrative]
    : brief.requiredNarratives.length
      ? brief.requiredNarratives
      : [];

  const tryPush = (item: { rank: WorkspaceMomentLike; candidate: WorkspaceCandidateLike }) => {
    const narrative = item.rank.narrative || item.candidate.narrativeHint || "Sesuai briefing";
    const normalized = normalizeText(narrative);
    if (chosen.length >= maxClips) return false;
    if (chosen.some((existing) => overlap(existing, item.candidate) > 0.45)) return false;
    if ((counts.get(normalized) || 0) >= maxPerNarrative) return false;
    chosen.push({
      start: item.candidate.start,
      end: item.candidate.end,
      score: item.rank.score / 10,
      title: item.rank.title,
      reason: item.rank.reason,
      narrative,
      flags: uniq([...(item.rank.flags || []), ...(item.candidate.flags || [])]).slice(0, 8),
    });
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
    return true;
  };

  if (narratives.length) {
    for (const narrative of narratives) {
      let added = 0;
      for (const item of ranked) {
        if (sameNarrative(item.rank.narrative || item.candidate.narrativeHint, narrative) && tryPush(item)) {
          added += 1;
          if (added >= maxPerNarrative) break;
        }
      }
    }
  }

  for (const item of ranked) {
    if (chosen.length >= maxClips) break;
    if (focusedNarrative && !sameNarrative(item.rank.narrative || item.candidate.narrativeHint, focusedNarrative)) continue;
    tryPush(item);
  }

  return chosen;
}
