import { extractAudioChunks } from "@/lib/ffmpeg";

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number;
  noSpeechProb?: number;
}

interface TranscriptionResponse {
  success: boolean;
  text: string;
  segments: TranscriptSegment[];
}

interface TranscribeProgress {
  phase: "extract" | "transcribe";
  percent: number;
  current: number;
  total: number;
}

export interface TranscriptResult {
  text: string;
  segments: TranscriptSegment[];
}

export async function transcribeVideo(
  file: File,
  duration: number,
  onProgress?: (progress: TranscribeProgress) => void
): Promise<TranscriptResult> {
  const audioChunks = await extractAudioChunks(file, duration, (percent, current, total) => {
    onProgress?.({ phase: "extract", percent, current, total });
  });

  const texts: string[] = [];
  const segments: TranscriptSegment[] = [];

  for (let index = 0; index < audioChunks.length; index += 1) {
    const chunk = audioChunks[index];
    onProgress?.({
      phase: "transcribe",
      percent: Math.round((index / audioChunks.length) * 100),
      current: index + 1,
      total: audioChunks.length,
    });

    const formData = new FormData();
    formData.append("file", chunk.file);
    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as Partial<TranscriptionResponse> & { error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || `Transkripsi bagian ${index + 1} gagal`);
    }

    if (payload.text) texts.push(payload.text.trim());

    for (const segment of payload.segments || []) {
      const start = Math.max(0, Number(segment.start) + chunk.start);
      const end = Math.min(duration, Number(segment.end) + chunk.start);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      segments.push({
        ...segment,
        start,
        end,
        text: String(segment.text || "").trim(),
      });
    }
  }

  onProgress?.({
    phase: "transcribe",
    percent: 100,
    current: audioChunks.length,
    total: audioChunks.length,
  });

  segments.sort((a, b) => a.start - b.start);
  return { text: texts.join(" ").trim(), segments };
}
