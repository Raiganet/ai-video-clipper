import type { BrandingSettings } from "@/lib/branding";
import type { BriefingSpec } from "@/lib/briefing";
import type { ClipSocialMetadata } from "@/lib/clipMetadata";

export interface CampaignVideoSource {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  status: "uploaded" | "referenced";
}

export interface CampaignWorkspaceDraft {
  enabled: boolean;
  focusedNarrative: string | null;
  sourceVideos: CampaignVideoSource[];
  lastGeneratedAt: number | null;
  notes: string;
}

export interface CampaignNarrativeCoverage {
  narrative: string;
  clipIds: number[];
  total: number;
  ready: number;
  needsReview: number;
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
};

export interface WorkspaceClipLike {
  id: number;
  briefingNarrative?: string;
  briefingFlags?: string[];
}

function uniq<T>(values: T[]) {
  return [...new Set(values)];
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function words(value: string) {
  return normalizeText(value).split(" ").filter((word) => word.length >= 4);
}

function sameNarrative(a: string, b: string) {
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

export function normalizeWorkspace(input?: Partial<CampaignWorkspaceDraft> | null): CampaignWorkspaceDraft {
  const sourceVideos = Array.isArray(input?.sourceVideos)
    ? input!.sourceVideos!.map((item, index) => ({
        id: String(item?.id || `source-${index + 1}`).slice(0, 80),
        name: String(item?.name || `Source ${index + 1}`).slice(0, 180),
        size: Math.max(0, Number(item?.size || 0)),
        type: String(item?.type || "video/mp4").slice(0, 120),
        lastModified: Math.max(0, Number(item?.lastModified || 0)),
        status: item?.status === "referenced" ? "referenced" : "uploaded",
      }))
    : [];
  return {
    enabled: Boolean(input?.enabled),
    focusedNarrative: input?.focusedNarrative ? String(input.focusedNarrative).slice(0, 400) : null,
    sourceVideos,
    lastGeneratedAt: Number.isFinite(Number(input?.lastGeneratedAt)) ? Number(input?.lastGeneratedAt) : null,
    notes: String(input?.notes || "").slice(0, 4000),
  };
}

export function upsertWorkspaceSource(workspaceInput: CampaignWorkspaceDraft, file: File | null, status: CampaignVideoSource["status"] = "uploaded") {
  const workspace = normalizeWorkspace(workspaceInput);
  if (!file) return workspace;
  const next: CampaignVideoSource = {
    id: `${file.name}-${file.lastModified}-${file.size}`.slice(0, 80),
    name: file.name,
    size: file.size,
    type: file.type || "video/mp4",
    lastModified: file.lastModified,
    status,
  };
  const existing = workspace.sourceVideos.findIndex((item) => item.id === next.id);
  const sourceVideos = existing >= 0
    ? workspace.sourceVideos.map((item, index) => index === existing ? next : item)
    : [next, ...workspace.sourceVideos].slice(0, 12);
  return { ...workspace, sourceVideos };
}

export function deriveNarrativeCoverage(brief: BriefingSpec, clips: WorkspaceClipLike[]): CampaignNarrativeCoverage[] {
  return brief.requiredNarratives.map((narrative) => {
    const matches = clips.filter((clip) => clip.briefingNarrative && sameNarrative(clip.briefingNarrative, narrative));
    const ready = matches.filter((clip) => !(clip.briefingFlags || []).some((flag) => /(topik terlarang|larangan klaim finansial|target speaker kurang dominan)/i.test(flag))).length;
    const needsReview = matches.length - ready;
    return {
      narrative,
      clipIds: matches.map((clip) => clip.id),
      total: matches.length,
      ready,
      needsReview,
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
  return [
    { key: "brief", label: "Briefing sudah dianalisis", status: brief.enabled && !!brief.analyzedAt ? "pass" : "fail", detail: brief.enabled ? (brief.analyzedAt ? "Briefing parsed" : "Klik Analisis Briefing") : "Aktifkan briefing" },
    { key: "source", label: "Video sumber campaign tersedia", status: workspace.sourceVideos.length ? "pass" : "fail", detail: workspace.sourceVideos.length ? `${workspace.sourceVideos.length} source terdaftar` : "Upload minimal 1 video sumber" },
    { key: "coverage", label: "Setiap narasi memiliki kandidat", status: coverage.length && coverage.every((item) => item.total > 0) ? "pass" : coverage.some((item) => item.total > 0) ? "warning" : "fail", detail: coverage.length ? `${coverage.filter((item) => item.total > 0).length}/${coverage.length} narasi sudah punya kandidat` : "Belum ada narasi briefing" },
    { key: "logo", label: "Logo campaign", status: brief.requireLogo ? (branding.enabled && !!branding.logoDataUrl ? "pass" : "fail") : "pass", detail: brief.requireLogo ? (branding.logoDataUrl ? "Logo siap render" : "Upload logo di Branding") : "Tidak diwajibkan" },
    { key: "speaker", label: "Target speaker ditag", status: brief.requireTargetSpeaker ? (brief.targetSpeakerIndex === null ? "warning" : "pass") : "pass", detail: brief.requireTargetSpeaker ? (brief.targetSpeakerIndex === null ? `Pilih Speaker untuk ${brief.targetSubject || "target"}` : `Speaker ${brief.targetSpeakerIndex + 1}`) : "Tidak diwajibkan" },
    { key: "cta", label: "CTA campaign tersedia", status: brief.ctaText.trim() ? "pass" : "warning", detail: brief.ctaText || "Tambahkan CTA di briefing" },
    { key: "hashtags", label: "Hashtag campaign masuk Publish Pack", status: brief.hashtags.length === 0 ? "pass" : missingTags.length === 0 ? "pass" : "warning", detail: missingTags.length ? `Belum ada: ${missingTags.join(" ")}` : brief.hashtags.join(" ") },
    { key: "manual", label: "Manual review campaign", status: brief.manualChecks.length ? "manual" : "pass", detail: brief.manualChecks[0] || "Tidak ada manual review khusus" },
  ];
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
      for (const item of ranked) {
        if (sameNarrative(item.rank.narrative || item.candidate.narrativeHint, narrative) && tryPush(item)) break;
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
