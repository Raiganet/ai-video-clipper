// lib/viralDetector.ts
export interface ViralMoment {
  start: number;
  end: number;
  score: number;
  title: string;
  isAiDetected: boolean;
}

// Kata kunci emosional & menarik perhatian (Bahasa Indonesia + Inggris umum)
const EMOTIONAL_KEYWORDS = [
  // Emosi kuat
  "wow", "keren", "hebat", "luar biasa", "mengagumkan", "kagum", "terkesan",
  "gila", "amazing", "incredible", "fantastic", "awesome",
  // Konten menarik
  "rahasia", "tips", "hack", "trik", "cara", "panduan", "tutorial",
  "penting", "krusial", "vital", "esensial",
  // Larangan/peringatan
  "jangan", "hindari", "bahaya", "warning", "alert",
  // Pengalaman personal
  "pernah", "tidak pernah", "selalu", "sering", "jarang",
  // Superlatif
  "terbaik", "terburuk", "paling", "nomor satu", "first", "top",
  // Pertanyaan retoris
  "mengapa", "kenapa", "bagaimana", "how", "why", "what",
  // Kata seru
  "ya", "benar", "betul", "tepat", "exact", "right"
];

// Kata umum yang harus diabaikan dalam analisis frekuensi
const STOP_WORDS = new Set([
  "yang", "dan", "atau", "di", "ke", "dari", "untuk", "dengan", "pada",
  "ini", "itu", "juga", "sudah", "akan", "bisa", "ada", "tidak", "ada",
  "the", "and", "or", "in", "to", "from", "for", "with", "on", "is", "are",
  "a", "an", "of", "at", "by", "as"
]);

export function detectViralMoments(
  transcript: string,
  videoDuration: number,
  maxClips: number = 5
): ViralMoment[] {
  console.log("[ViralDetector] Input:", {
    transcriptLength: transcript.length,
    videoDuration,
    maxClips
  });

  const words = transcript.split(/\s+/).filter(Boolean);
  const wordsPerSecond = words.length / Math.max(1, videoDuration);

  console.log("[ViralDetector] Stats:", {
    totalWords: words.length,
    wordsPerSecond: wordsPerSecond.toFixed(2)
  });

  const moments: ViralMoment[] = [];

  // STRATEGI 1: Deteksi kata kunci emosional
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase().replace(/[.,!?;:"'()]/g, '');
    const isKeyword = EMOTIONAL_KEYWORDS.some(kw => word === kw || word.includes(kw));

    if (isKeyword) {
      const position = i / wordsPerSecond;
      const start = Math.max(0, position - 3);
      const end = Math.min(videoDuration, position + 15);

      // Cek overlap dengan momen yang sudah ada
      const overlaps = moments.some(m => (start < m.end && end > m.start));
      if (!overlaps) {
        const snippet = words.slice(
          Math.max(0, i - 3),
          Math.min(words.length, i + 8)
        ).join(" ");

        moments.push({
          start,
          end,
          score: 1.5 + (EMOTIONAL_KEYWORDS.filter(kw => word.includes(kw)).length * 0.3),
          title: `"${snippet}..."`,
          isAiDetected: true
        });
      }
    }
  }

  // STRATEGI 2: Analisis frekuensi kata (jika strategi 1 tidak cukup)
  if (moments.length < maxClips) {
    const wordFreq = new Map<string, { count: number; positions: number[] }>();

    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase().replace(/[.,!?;:"'()]/g, '');
      if (word.length < 4 || STOP_WORDS.has(word)) continue;

      if (!wordFreq.has(word)) {
        wordFreq.set(word, { count: 0, positions: [] });
      }
      const entry = wordFreq.get(word)!;
      entry.count++;
      entry.positions.push(i);
    }

    // Ambil kata yang paling sering muncul (minimal 2x)
    const frequentWords = Array.from(wordFreq.entries())
      .filter(([_, data]) => data.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    console.log("[ViralDetector] Frequent words:", frequentWords.slice(0, 5));

    for (const [word, data] of frequentWords) {
      if (moments.length >= maxClips) break;

      // Gunakan posisi pertama kemunculan
      const firstPos = data.positions[0];
      const position = firstPos / wordsPerSecond;
      const start = Math.max(0, position - 2);
      const end = Math.min(videoDuration, position + 12);

      const overlaps = moments.some(m => (start < m.end && end > m.start));
      if (!overlaps) {
        const snippet = words.slice(
          Math.max(0, firstPos - 2),
          Math.min(words.length, firstPos + 6)
        ).join(" ");

        moments.push({
          start,
          end,
          score: 1.0 + (data.count * 0.2),
          title: `"${snippet}..."`,
          isAiDetected: true
        });
      }
    }
  }

  // STRATEGI 3: Fallback - bagi video secara merata jika tidak ada deteksi
  if (moments.length === 0) {
    console.log("[ViralDetector] No viral moments detected, using basic split");
    const clipLen = Math.min(30, videoDuration / maxClips);
    for (let i = 0; i < maxClips; i++) {
      moments.push({
        start: i * clipLen,
        end: Math.min(videoDuration, (i + 1) * clipLen),
        score: 0.5,
        title: `Bagian ${i + 1}`,
        isAiDetected: false
      });
    }
  }

  // Urutkan berdasarkan waktu mulai
  moments.sort((a, b) => a.start - b.start);

  console.log("[ViralDetector] Final moments:", moments.length);

  return moments.slice(0, maxClips);
}
