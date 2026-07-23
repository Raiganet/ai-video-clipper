// lib/viralDetector.ts
export interface ViralMoment {
  start: number;
  end: number;
  score: number;
  title: string;
}

export function detectViralMoments(
  transcript: string,
  videoDuration: number,
  maxClips: number = 5
): ViralMoment[] {
  const words = transcript.split(/\s+/).filter(Boolean);
  const wordsPerSecond = words.length / Math.max(1, videoDuration);
  
  // Kata kunci yang sering menandakan momen viral/penarik perhatian
  const emotionalKeywords = [
    "wow", "keren", "hebat", "luar biasa", "mengagumkan", "kagum", 
    "terkesan", "penting", "rahasia", "tips", "hack", "jangan", "pernah", "terbaik"
  ];
  
  const moments: ViralMoment[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    const isKeyword = emotionalKeywords.some(kw => word.includes(kw));
    
    if (isKeyword) {
      const position = i / wordsPerSecond;
      const start = Math.max(0, position - 3); // 3 detik sebelum kata kunci
      const end = Math.min(videoDuration, position + 15); // 15 detik setelahnya
      
      // Hindari overlap yang terlalu banyak
      const overlaps = moments.some(m => (start < m.end && end > m.start));
      if (!overlaps) {
        const snippet = words.slice(Math.max(0, i - 2), Math.min(words.length, i + 6)).join(" ");
        moments.push({
          start,
          end,
          score: 1 + (word.length / 10),
          title: `"${snippet}..."`
        });
      }
    }
  }

  // Jika tidak ada kata kunci yang terdeteksi, fallback bagi video secara merata
  if (moments.length === 0) {
    const clipLen = Math.min(30, videoDuration / maxClips);
    for (let i = 0; i < maxClips; i++) {
      moments.push({
        start: i * clipLen,
        end: Math.min(videoDuration, (i + 1) * clipLen),
        score: 0.5,
        title: `Bagian ${i + 1}`
      });
    }
  }

  // Urutkan berdasarkan skor tertinggi dan ambil sesuai maxClips
  return moments
    .sort((a, b) => b.score - a.score)
    .slice(0, maxClips)
    .map((m, idx) => ({ ...m, title: m.title || `Klip ${idx + 1}` }));
}
