// lib/viralDetector.ts

/** Deteksi momen viral berdasarkan transkripsi */
export function detectViralMoments(
  transcript: string,
  videoDuration: number,
  options: {
    maxClips?: number;
    minClipDuration?: number;
    maxClipDuration?: number;
  } = {}
): { start: number; end: number; score: number }[] {
  const { maxClips = 5, minClipDuration = 20, maxClipDuration = 60 } = options;
  
  const words = transcript.split(/\s+/).filter(Boolean);
  const wordsPerSecond = words.length / videoDuration;
  
  // Deteksi momen berdasarkan pola kalimat
  const viralMoments: { start: number; end: number; score: number }[] = [];
  
  // 1. Deteksi kalimat yang mengandung emosi kuat
  const emotionalKeywords = ["wow", "keren", "hebat", "luar biasa", "mengagumkan", "kagum", "terkesan"];
  const emotionalMoments = detectKeywordMoments(transcript, emotionalKeywords);
  
  // 2. Deteksi jeda diam yang menandakan pergantian topik
  const silenceMoments = detectSilenceMoments(videoDuration);
  
  // 3. Kombinasikan dan beri skor
  const allMoments = [...emotionalMoments, ...silenceMoments];
  allMoments.sort((a, b) => b.score - a.score);
  
  // Ambil N momen terbaik
  return allMoments.slice(0, maxClips)
    .map(m => ({
      start: Math.max(0, m.start),
      end: Math.min(videoDuration, m.end),
      score: m.score
    }))
    .filter(m => m.end - m.start >= minClipDuration && m.end - m.start <= maxClipDuration);
}

/** Deteksi momen berdasarkan kata kunci */
function detectKeywordMoments(
  transcript: string,
  keywords: string[],
  windowSize = 5
): { start: number; end: number; score: number }[] {
  const moments: { start: number; end: number; score: number }[] = [];
  const words = transcript.split(/\s+/).filter(Boolean);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    if (keywords.some(kw => word.includes(kw))) {
      // Hitung skor berdasarkan kata kunci
      const score = 1 + keywords.filter(kw => word.includes(kw)).length * 0.5;
      
      // Hitung posisi dalam video (asumsi 2 kata/detik)
      const position = i / 2;
      moments.push({
        start: Math.max(0, position - windowSize),
        end: position + windowSize,
        score: score
      });
    }
  }
  
  return moments;
}

/** Deteksi momen berdasarkan jeda diam (simulasi) */
function detectSilenceMoments(
  videoDuration: number,
  minSilence = 1.5
): { start: number; end: number; score: number }[] {
  // Simulasi deteksi jeda diam (dalam implementasi nyata, gunakan analisis audio)
  const moments: { start: number; end: number; score: number }[] = [];
  
  // Cari jeda 1.5-3 detik di seluruh video
  for (let i = 0; i < videoDuration; i += 5) {
    if (i + minSilence < videoDuration) {
      moments.push({
        start: i,
        end: i + minSilence,
        score: 0.8
      });
    }
  }
  
  return moments;
}
