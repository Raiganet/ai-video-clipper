import type { TranscriptSegment } from "@/lib/transcription";

export interface ViralMoment {
  start: number;
  end: number;
  score: number;
  title: string;
  isAiDetected: boolean;
  reason?: string;
}

export type Vibe = "viral" | "edukasi" | "jualan" | "ringkas";

const KEYWORDS: Record<Vibe, string[]> = {
  viral: [
    "wow", "gila", "keren", "hebat", "luar biasa", "rahasia", "jangan", "ternyata",
    "kenapa", "mengapa", "bagaimana", "paling", "terbaik", "buruk", "bahaya", "viral",
    "amazing", "incredible", "secret", "why", "how", "never", "best", "worst",
  ],
  edukasi: [
    "cara", "tips", "trik", "langkah", "contoh", "artinya", "penyebab", "solusi", "belajar",
    "penting", "perhatikan", "jadi", "karena", "hasilnya", "tutorial", "panduan", "how", "why",
  ],
  jualan: [
    "harga", "promo", "diskon", "murah", "hemat", "bonus", "gratis", "beli", "order", "pesan",
    "manfaat", "keuntungan", "solusi", "cocok", "produk", "fitur", "sekarang", "terbatas",
  ],
  ringkas: [
    "inti", "kesimpulan", "singkat", "jadi", "poin", "utama", "penting", "akhirnya", "hasil",
  ],
};

const MIN_CLIP = 12;
const TARGET_CLIP = 26;
const MAX_CLIP = 42;

function normalize(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s?!]/gu, " ");
}

function titleFromText(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Momen menarik";
  return clean.length > 64 ? `${clean.slice(0, 61)}...` : clean;
}

function scoreText(text: string, vibe: Vibe, index: number, total: number) {
  const normalized = normalize(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const keywordHits = KEYWORDS[vibe].reduce(
    (count, keyword) => count + (normalized.includes(keyword) ? 1 : 0),
    0
  );

  let score = keywordHits * 2.2;
  const reasons: string[] = [];

  if (keywordHits > 0) reasons.push(`${keywordHits} kata pemicu ${vibe}`);
  if (/[?!]/.test(text)) {
    score += 1.3;
    reasons.push("hook/pertanyaan");
  }
  if (/\b(\d+|satu|dua|tiga|empat|lima)\b/i.test(text)) score += 0.5;
  if (words.length >= 8) score += 0.5;
  if (words.length >= 16) score += 0.4;

  // Sedikit bonus untuk bagian awal karena hook awal sering lebih bernilai,
  // tetapi tidak cukup besar untuk menutupi isi yang lebih kuat di tengah.
  if (total > 1 && index / total < 0.18) score += 0.35;

  return { score, reason: reasons.join(" • ") || "kepadatan percakapan" };
}

function buildCandidates(segments: TranscriptSegment[], vibe: Vibe) {
  return segments.map((segment, index) => {
    let endIndex = index;
    let end = segment.end;
    const texts = [segment.text];

    while (endIndex + 1 < segments.length && end - segment.start < TARGET_CLIP) {
      const next = segments[endIndex + 1];
      if (next.start - end > 4) break;
      if (next.end - segment.start > MAX_CLIP) break;
      endIndex += 1;
      end = next.end;
      texts.push(next.text);
    }

    if (end - segment.start < MIN_CLIP && endIndex + 1 < segments.length) {
      const next = segments[endIndex + 1];
      if (next.end - segment.start <= MAX_CLIP) {
        end = next.end;
        texts.push(next.text);
      }
    }

    const text = texts.join(" ").trim();
    const scoring = scoreText(text, vibe, index, segments.length);
    const speechSeconds = Math.max(1, end - segment.start);
    const densityBonus = Math.min(1.2, text.split(/\s+/).length / speechSeconds / 2.8);

    return {
      start: Math.max(0, segment.start - 1.5),
      end: end + 1.5,
      score: scoring.score + densityBonus,
      title: titleFromText(text),
      reason: scoring.reason,
    };
  });
}

function overlapRatio(a: { start: number; end: number }, b: { start: number; end: number }) {
  const overlap = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return shorter > 0 ? overlap / shorter : 0;
}

function fallbackMoments(videoDuration: number, maxClips: number): ViralMoment[] {
  const count = Math.max(1, Math.min(maxClips, Math.ceil(videoDuration / 15)));
  const spacing = videoDuration / count;
  return Array.from({ length: count }, (_, index) => {
    const start = index * spacing;
    const end = Math.min(videoDuration, start + Math.min(30, spacing));
    return {
      start,
      end: Math.max(start + Math.min(5, videoDuration - start), end),
      score: 0.5,
      title: `Bagian ${index + 1}`,
      isAiDetected: false,
      reason: "pembagian otomatis",
    };
  });
}

export function detectViralMoments(
  segments: TranscriptSegment[],
  videoDuration: number,
  maxClips = 5,
  vibe: Vibe = "viral"
): ViralMoment[] {
  const validSegments = segments
    .filter((segment) => segment.text.trim() && segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  if (validSegments.length === 0) return fallbackMoments(videoDuration, maxClips);

  const candidates = buildCandidates(validSegments, vibe)
    .map((candidate) => ({
      ...candidate,
      end: Math.min(videoDuration, candidate.end),
    }))
    .filter((candidate) => candidate.end - candidate.start >= 4)
    .sort((a, b) => b.score - a.score);

  const chosen: ViralMoment[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= maxClips) break;
    if (chosen.some((existing) => overlapRatio(existing, candidate) > 0.4)) continue;
    chosen.push({ ...candidate, isAiDetected: true });
  }

  if (chosen.length === 0) return fallbackMoments(videoDuration, maxClips);

  // Isi slot yang tersisa dengan bagian merata, tanpa menimpa hasil AI.
  if (chosen.length < maxClips) {
    for (const fallback of fallbackMoments(videoDuration, maxClips)) {
      if (chosen.length >= maxClips) break;
      if (chosen.some((existing) => overlapRatio(existing, fallback) > 0.45)) continue;
      chosen.push(fallback);
    }
  }

  return chosen
    .slice(0, maxClips)
    .sort((a, b) => a.start - b.start);
}
