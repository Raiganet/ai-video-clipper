import type { BrandingSettings } from "@/lib/branding";
import type { TranscriptSegment } from "@/lib/transcription";

export interface BriefMaterial {
  id: string;
  title: string;
  url: string;
  kind: "youtube" | "drive" | "website" | "other";
}

export interface BriefingSpec {
  enabled: boolean;
  raw: string;
  campaignName: string;
  objective: string;
  targetSubject: string;
  targetSpeakerIndex: number | null;
  durationMin: number;
  durationMax: number;
  ctaText: string;
  ctaDuration: number;
  bioLink: string;
  requireLogo: boolean;
  requireTargetSpeaker: boolean;
  requiredNarratives: string[];
  requiredRules: string[];
  forbiddenRules: string[];
  forbiddenTopics: string[];
  hashtags: string[];
  materials: BriefMaterial[];
  manualChecks: string[];
  analyzedAt: number | null;
  source: "manual" | "ai";
}

export interface BriefCandidate {
  id: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  speakerRatio: number;
  localScore: number;
  narrativeHint: string;
  flags: string[];
}

export interface BriefRankedMoment {
  candidateId: number;
  score: number;
  title: string;
  reason: string;
  narrative: string;
  flags: string[];
}

export interface BriefComplianceCheck {
  key: string;
  label: string;
  status: "pass" | "fail" | "manual" | "warning";
  detail?: string;
}

export const EMPTY_BRIEFING: BriefingSpec = {
  enabled: false,
  raw: "",
  campaignName: "",
  objective: "",
  targetSubject: "",
  targetSpeakerIndex: null,
  durationMin: 20,
  durationMax: 60,
  ctaText: "",
  ctaDuration: 3.5,
  bioLink: "",
  requireLogo: false,
  requireTargetSpeaker: false,
  requiredNarratives: [],
  requiredRules: [],
  forbiddenRules: [],
  forbiddenTopics: [],
  hashtags: [],
  materials: [],
  manualChecks: [],
  analyzedAt: null,
  source: "manual",
};

function uniq(values: string[], max = 24) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, max);
}

function cleanUrl(value: string) {
  return value.replace(/[),.;]+$/g, "").trim();
}

function materialKind(url: string): BriefMaterial["kind"] {
  if (/youtu(?:\.be|be\.com)/i.test(url)) return "youtube";
  if (/drive\.google\.com/i.test(url)) return "drive";
  if (/^https?:\/\//i.test(url)) return "website";
  return "other";
}

function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Materi";
  }
}

export function normalizeBriefing(input?: Partial<BriefingSpec> | null): BriefingSpec {
  const min = Math.max(5, Math.min(600, Number(input?.durationMin ?? EMPTY_BRIEFING.durationMin) || EMPTY_BRIEFING.durationMin));
  const max = Math.max(min, Math.min(1800, Number(input?.durationMax ?? EMPTY_BRIEFING.durationMax) || EMPTY_BRIEFING.durationMax));
  const materials = Array.isArray(input?.materials) ? input!.materials!.map((item, index) => ({
    id: String(item?.id || `material-${index + 1}`).slice(0, 80),
    title: String(item?.title || titleFromUrl(String(item?.url || ""))).slice(0, 120),
    url: cleanUrl(String(item?.url || "")).slice(0, 1000),
    kind: (["youtube", "drive", "website", "other"] as const).includes(item?.kind as BriefMaterial["kind"]) ? item!.kind : materialKind(String(item?.url || "")),
  })).filter((item) => item.url) : [];
  return {
    enabled: Boolean(input?.enabled),
    raw: String(input?.raw || "").slice(0, 30_000),
    campaignName: String(input?.campaignName || "").slice(0, 140),
    objective: String(input?.objective || "").slice(0, 1000),
    targetSubject: String(input?.targetSubject || "").slice(0, 120),
    targetSpeakerIndex: Number.isInteger(input?.targetSpeakerIndex) && Number(input?.targetSpeakerIndex) >= 0 ? Number(input?.targetSpeakerIndex) : null,
    durationMin: min,
    durationMax: max,
    ctaText: String(input?.ctaText || "").slice(0, 220),
    ctaDuration: Math.max(1.5, Math.min(8, Number(input?.ctaDuration ?? 3.5) || 3.5)),
    bioLink: String(input?.bioLink || "").slice(0, 500),
    requireLogo: Boolean(input?.requireLogo),
    requireTargetSpeaker: Boolean(input?.requireTargetSpeaker),
    requiredNarratives: uniq(Array.isArray(input?.requiredNarratives) ? input!.requiredNarratives!.map(String) : [], 16),
    requiredRules: uniq(Array.isArray(input?.requiredRules) ? input!.requiredRules!.map(String) : [], 24),
    forbiddenRules: uniq(Array.isArray(input?.forbiddenRules) ? input!.forbiddenRules!.map(String) : [], 24),
    forbiddenTopics: uniq(Array.isArray(input?.forbiddenTopics) ? input!.forbiddenTopics!.map(String) : [], 16),
    hashtags: uniq(Array.isArray(input?.hashtags) ? input!.hashtags!.map((value) => String(value).trim()).filter(Boolean).map((value) => value.startsWith("#") ? value : `#${value.replace(/^#+/, "")}`) : [], 16),
    materials,
    manualChecks: uniq(Array.isArray(input?.manualChecks) ? input!.manualChecks!.map(String) : [], 20),
    analyzedAt: Number.isFinite(Number(input?.analyzedAt)) ? Number(input?.analyzedAt) : null,
    source: input?.source === "ai" ? "ai" : "manual",
  };
}

export function parseBriefingLocally(raw: string): BriefingSpec {
  const text = String(raw || "").trim();
  const lines = text.split(/\r?\n/).map((line) => line.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
  const hashtags = uniq(text.match(/#[\p{L}\p{N}_]+/gu) || [], 16);
  const urls = uniq((text.match(/https?:\/\/[^\s]+|\b(?:www\.)?[a-z0-9.-]+\.(?:com|id|io|co|net|org)(?:\/[^\s]*)?/gi) || []).map((url) => /^https?:\/\//i.test(url) ? cleanUrl(url) : `https://${cleanUrl(url)}`), 20);
  const duration = text.match(/(?:durasi[^\d]{0,20})?(\d{1,3})\s*(?:-|–|—|sampai|hingga)\s*(\d{1,3})\s*(?:detik|dtk|second|seconds)/i);
  const ctaLine = lines.find((line) => /^cta\b/i.test(line) || /cta\s+di\s+akhir/i.test(line));
  const cta = ctaLine?.replace(/^cta[^:]*:\s*/i, "").replace(/^cta\s*/i, "").trim() || "";
  const targetMatch = text.match(/(?:highlight|fokus(?:\s+ke)?|menonjolkan)\s+([A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+){0,3})\s+(?:saat|ketika)/u)
    || text.match(/(?:highlight|fokus(?:\s+ke)?)\s+([A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+){0,3})/u);
  const bioUrl = urls.find((url) => /(?:bio|class|fortis)/i.test(url)) || "";
  const narratives: string[] = [];
  let inNarrative = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^narasi\b/i.test(line)) { inNarrative = true; continue; }
    if (/^(hashtag|do\s*&?\s*don'?ts?|materi|wajib)\b/i.test(line)) { if (inNarrative) inNarrative = false; }
    if (inNarrative && /^[-•*]/.test(line)) narratives.push(line.replace(/^[-•*\s]+/, "").trim());
  }
  const forbidden = lines.filter((line) => /^(dilarang|tidak\s+boleh|jangan|tidak\s+diizinkan)/i.test(line));
  const required = lines.filter((line) => /(harus|wajib|CTA|mencantumkan|tambahkan|mengambil footage|fokus ke highlight)/i.test(line) && !/dilarang/i.test(line));
  const manualChecks = forbidden.filter((line) => /(screenshot|ads|bot|repost|posting|diposting|video yang sudah)/i.test(line));
  const forbiddenTopics = [
    /politik/i.test(text) ? "politik" : "",
    /agama/i.test(text) ? "agama" : "",
    /(seksual|sexual)/i.test(text) ? "seksual" : "",
    /(rasial|racial|SARA)/i.test(text) ? "rasial/SARA" : "",
  ].filter(Boolean);
  return normalizeBriefing({
    enabled: Boolean(text), raw: text,
    campaignName: lines[0]?.slice(0, 120) || "Briefing Campaign",
    objective: narratives[0] || required[0] || "",
    targetSubject: targetMatch?.[1]?.trim() || "",
    targetSpeakerIndex: null,
    durationMin: duration ? Number(duration[1]) : 20,
    durationMax: duration ? Number(duration[2]) : 60,
    ctaText: cta,
    bioLink: bioUrl,
    requireLogo: /logo/i.test(text) && /(harus|wajib|semua video|semua clipping)/i.test(text),
    requireTargetSpeaker: /(highlight|fokus).{0,60}(berbicara|saat|ketika)/i.test(text),
    requiredNarratives: narratives,
    requiredRules: required,
    forbiddenRules: forbidden,
    forbiddenTopics,
    hashtags,
    materials: urls.filter((url) => url !== bioUrl).map((url, index) => ({ id: `material-${index + 1}`, title: titleFromUrl(url), url, kind: materialKind(url) })),
    manualChecks,
    analyzedAt: Date.now(),
    source: "manual",
  });
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const SENSITIVE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "politik", re: /\b(politik|pemilu|partai|presiden|capres|cawapres|kampanye politik|pilkada|dpr|menteri)\b/i },
  { label: "agama", re: /\b(agama|islam|kristen|katolik|hindu|buddha|yahudi|gereja|masjid|ustadz|pendeta)\b/i },
  { label: "seksual", re: /\b(seks|seksual|porn|porno|telanjang|hubungan intim)\b/i },
  { label: "rasial/SARA", re: /\b(rasis|rasial|suku|etnis|cina|pribumi|SARA)\b/i },
];
const FINANCE_PROMISE = /\b(pasti untung|jamin(?:an)? untung|dijamin cuan|pasti naik|auto cuan|tanpa risiko)\b/i;
const FINANCE_REVIEW = /\b(rekomendasi saham|beli saham ini|target profit)\b/i;

function narrativeKeywords(narrative: string) {
  return normalizeText(narrative).split(" ").filter((word) => word.length >= 4).slice(0, 16);
}

function candidateFlags(text: string, brief: BriefingSpec) {
  const flags: string[] = [];
  for (const pattern of SENSITIVE_PATTERNS) {
    if (brief.forbiddenTopics.some((topic) => normalizeText(topic).includes(normalizeText(pattern.label))) && pattern.re.test(text)) flags.push(`Topik terlarang: ${pattern.label}`);
  }
  if (FINANCE_PROMISE.test(text)) flags.push("Larangan klaim finansial: janji keuntungan/risiko");
  else if (FINANCE_REVIEW.test(text)) flags.push("Perlu review klaim/rekomendasi finansial dalam konteks asli");
  return flags;
}

export function buildBriefCandidates(segments: TranscriptSegment[], videoDuration: number, briefInput: BriefingSpec, maxCandidates = 28): BriefCandidate[] {
  const brief = normalizeBriefing(briefInput);
  const valid = segments.filter((segment) => segment.text.trim() && segment.end > segment.start).sort((a, b) => a.start - b.start);
  if (valid.length === 0) return [];
  const targetMin = brief.durationMin;
  const targetMax = brief.durationMax;
  const ideal = Math.max(targetMin, Math.min(targetMax, targetMin + (targetMax - targetMin) * 0.55));
  const candidates: BriefCandidate[] = [];
  const starts = valid.length <= maxCandidates ? valid.map((_, i) => i) : Array.from({ length: maxCandidates }, (_, i) => Math.floor(i * (valid.length - 1) / Math.max(1, maxCandidates - 1)));

  for (const startIndex of starts) {
    const startSegment = valid[startIndex];
    let endIndex = startIndex;
    let end = startSegment.end;
    const texts = [startSegment.text];
    const speakerSeconds = new Map<number, number>();
    const addSpeaker = (segment: TranscriptSegment) => {
      if (typeof segment.speaker !== "number") return;
      speakerSeconds.set(segment.speaker, (speakerSeconds.get(segment.speaker) || 0) + Math.max(0, segment.end - segment.start));
    };
    addSpeaker(startSegment);
    while (endIndex + 1 < valid.length && end - startSegment.start < ideal) {
      const next = valid[endIndex + 1];
      if (next.start - end > 5 || next.end - startSegment.start > targetMax) break;
      endIndex += 1; end = next.end; texts.push(next.text); addSpeaker(next);
    }
    while (endIndex + 1 < valid.length && end - startSegment.start < targetMin) {
      const next = valid[endIndex + 1];
      if (next.start - end > 5 || next.end - startSegment.start > targetMax) break;
      endIndex += 1; end = next.end; texts.push(next.text); addSpeaker(next);
    }
    const start = Math.max(0, startSegment.start - 0.8);
    end = Math.min(videoDuration, end + 0.8);
    const duration = end - start;
    if (duration < targetMin * 0.9 || duration > targetMax + 0.5) continue;
    const text = texts.join(" ").replace(/\s+/g, " ").trim();
    const normalized = normalizeText(text);
    let localScore = 20 + Math.max(0, 18 - Math.abs(duration - ideal) * 0.7);
    let narrativeHint = "";
    let bestHits = 0;
    for (const narrative of brief.requiredNarratives) {
      const hits = narrativeKeywords(narrative).filter((keyword) => normalized.includes(keyword)).length;
      if (hits > bestHits) { bestHits = hits; narrativeHint = narrative; }
    }
    localScore += Math.min(28, bestHits * 5);
    const speakerRatio = brief.targetSpeakerIndex === null ? 0 : (speakerSeconds.get(brief.targetSpeakerIndex) || 0) / Math.max(1, duration);
    if (brief.targetSpeakerIndex !== null) localScore += Math.min(30, speakerRatio * 45);
    const flags = candidateFlags(text, brief);
    if (brief.requireTargetSpeaker && brief.targetSpeakerIndex !== null && speakerRatio < 0.45) {
      flags.push(`Target speaker kurang dominan: ${Math.round(speakerRatio * 100)}%`);
      localScore -= 45;
    }
    if (flags.some((flag) => flag.startsWith("Topik terlarang"))) localScore -= 80;
    else if (flags.length) localScore -= 18;
    candidates.push({ id: candidates.length + 1, start, end, duration, text: text.slice(0, 5000), speakerRatio, localScore, narrativeHint, flags });
  }

  return candidates
    .sort((a, b) => b.localScore - a.localScore)
    .filter((candidate, index, all) => all.findIndex((other) => Math.abs(other.start - candidate.start) < 4) === index)
    .slice(0, maxCandidates)
    .map((candidate, index) => ({ ...candidate, id: index + 1 }));
}

function overlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  const seconds = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return seconds / Math.max(1, Math.min(a.end - a.start, b.end - b.start));
}

export function chooseBriefingMoments(candidates: BriefCandidate[], ranks: BriefRankedMoment[], maxClips: number) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ranked = ranks.map((rank) => ({ rank, candidate: byId.get(rank.candidateId) })).filter((item): item is { rank: BriefRankedMoment; candidate: BriefCandidate } => Boolean(item.candidate))
    .sort((a, b) => b.rank.score - a.rank.score);
  const chosen: Array<{ start: number; end: number; score: number; title: string; reason: string; narrative: string; flags: string[] }> = [];
  for (const { rank, candidate } of ranked) {
    if (chosen.length >= maxClips) break;
    const combinedFlags = uniq([...candidate.flags, ...rank.flags], 8);
    if (combinedFlags.some((flag) => /(topik terlarang|larangan klaim finansial|target speaker kurang dominan)/i.test(flag))) continue;
    if (chosen.some((item) => overlap(item, candidate) > 0.45)) continue;
    chosen.push({ start: candidate.start, end: candidate.end, score: rank.score / 10, title: rank.title, reason: rank.reason, narrative: rank.narrative, flags: combinedFlags });
  }
  return chosen;
}

export function localRankBriefCandidates(candidates: BriefCandidate[], briefInput: BriefingSpec): BriefRankedMoment[] {
  const brief = normalizeBriefing(briefInput);
  return candidates.map((candidate) => ({
    candidateId: candidate.id,
    score: Math.max(0, Math.min(100, Math.round(candidate.localScore))),
    title: candidate.narrativeHint ? candidate.narrativeHint.slice(0, 72) : candidate.text.slice(0, 72),
    reason: candidate.speakerRatio > 0.55 ? `Target speaker dominan ${Math.round(candidate.speakerRatio * 100)}% • cocok dengan briefing` : candidate.narrativeHint ? "Narasi sesuai briefing" : "Kandidat berdasarkan durasi dan isi transcript",
    narrative: candidate.narrativeHint || brief.requiredNarratives[0] || "Sesuai briefing",
    flags: candidate.flags,
  })).sort((a, b) => b.score - a.score);
}

export function transcriptForRange(segments: TranscriptSegment[], start: number, duration: number) {
  const end = start + duration;
  return segments.filter((segment) => segment.end > start && segment.start < end).map((segment) => segment.text).join(" ").replace(/\s+/g, " ").trim();
}

export function evaluateBriefCompliance(input: {
  brief: BriefingSpec;
  start: number;
  duration: number;
  transcript: string;
  segments: TranscriptSegment[];
  branding: BrandingSettings;
  hashtags?: string[];
}): BriefComplianceCheck[] {
  const brief = normalizeBriefing(input.brief);
  if (!brief.enabled) return [];
  const checks: BriefComplianceCheck[] = [];
  const durationOk = input.duration >= brief.durationMin - 0.05 && input.duration <= brief.durationMax + 0.05;
  checks.push({ key: "duration", label: `Durasi ${brief.durationMin}–${brief.durationMax} detik`, status: durationOk ? "pass" : "fail", detail: `${input.duration.toFixed(1)} detik` });
  if (brief.requireLogo) checks.push({ key: "logo", label: "Logo wajib di semua klip", status: input.branding.enabled && Boolean(input.branding.logoDataUrl) ? "pass" : "fail", detail: input.branding.logoDataUrl ? "Logo siap dirender" : "Upload logo di Branding" });
  if (brief.ctaText) checks.push({ key: "cta", label: "CTA di akhir video", status: "pass", detail: brief.ctaText });
  if (brief.requireTargetSpeaker) {
    if (brief.targetSpeakerIndex === null) checks.push({ key: "speaker", label: `Fokus ${brief.targetSubject || "target speaker"}`, status: "warning", detail: "Tag speaker secara manual setelah diarization." });
    else {
      const end = input.start + input.duration;
      const overlapSeconds = input.segments.filter((segment) => segment.speaker === brief.targetSpeakerIndex && segment.end > input.start && segment.start < end).reduce((sum, segment) => sum + Math.max(0, Math.min(segment.end, end) - Math.max(segment.start, input.start)), 0);
      const ratio = overlapSeconds / Math.max(1, input.duration);
      checks.push({ key: "speaker", label: `Fokus ${brief.targetSubject || `Speaker ${brief.targetSpeakerIndex + 1}`}`, status: ratio >= 0.45 ? "pass" : "fail", detail: `±${Math.round(ratio * 100)}% durasi target speaker` });
    }
  }
  const flags = candidateFlags(input.transcript, brief);
  checks.push({ key: "content", label: "Filter topik/klaim terlarang", status: flags.some((flag) => /^(Topik terlarang|Larangan klaim finansial)/i.test(flag)) ? "fail" : flags.length ? "warning" : "pass", detail: flags.join(" • ") || "Tidak terdeteksi dari transcript" });
  if (brief.hashtags.length) {
    const current = new Set((input.hashtags || []).map((value) => value.toLowerCase()));
    const missing = brief.hashtags.filter((tag) => !current.has(tag.toLowerCase()));
    checks.push({ key: "hashtags", label: "Hashtag briefing", status: missing.length ? "warning" : "pass", detail: missing.length ? `Belum di Publish Pack: ${missing.join(" ")}` : brief.hashtags.join(" ") });
  }
  if (brief.bioLink) checks.push({ key: "bio", label: "Link wajib di bio profile", status: "manual", detail: brief.bioLink });
  for (const item of brief.manualChecks) checks.push({ key: `manual-${checks.length}`, label: item, status: "manual", detail: "Perlu review manusia sebelum posting" });
  return checks;
}
