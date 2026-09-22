import { extractAudioChunks } from "@/lib/ffmpeg";
import { getFirebaseIdToken } from "@/lib/firebaseClient";

export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
  speaker?: number;
  speakerConfidence?: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  avgLogprob?: number;
  noSpeechProb?: number;
  speaker?: number;
  speakerConfidence?: number;
  words?: TranscriptWord[];
}

interface TranscriptionResponse {
  success: boolean;
  text: string;
  segments: TranscriptSegment[];
  diarized?: boolean;
  speakerCount?: number;
  provider?: string;
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
  diarized: boolean;
  speakerCount: number;
  provider: "groq" | "deepgram";
  fallbackReason?: string;
}

export interface TranscribeOptions {
  speakerDiarization?: boolean;
  language?: string;
}

function newJobId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function transcribeChunks(
  endpoint: "/api/transcribe" | "/api/diarize",
  audioChunks: Awaited<ReturnType<typeof extractAudioChunks>>,
  duration: number,
  jobId: string,
  token: string | null,
  language: string | undefined,
  onProgress?: (progress: TranscribeProgress) => void
): Promise<TranscriptResult> {
  const texts: string[] = [];
  const segments: TranscriptSegment[] = [];
  let speakerOffset = 0;
  let diarized = endpoint === "/api/diarize";
  let provider: "groq" | "deepgram" = endpoint === "/api/diarize" ? "deepgram" : "groq";

  for (let index = 0; index < audioChunks.length; index += 1) {
    const chunk = audioChunks[index];
    onProgress?.({ phase: "transcribe", percent: Math.round((index / audioChunks.length) * 100), current: index + 1, total: audioChunks.length });

    const formData = new FormData();
    formData.append("file", chunk.file);
    if (language) formData.append("language", language);
    const headers: Record<string, string> = { "x-clipper-job-id": jobId };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(endpoint, { method: "POST", headers, body: formData });
    const payload = (await response.json()) as Partial<TranscriptionResponse> & { error?: string; code?: string };
    if (!response.ok || !payload.success) {
      const error = new Error(payload.error || `Transkripsi bagian ${index + 1} gagal`) as Error & { code?: string; status?: number };
      error.code = payload.code;
      error.status = response.status;
      throw error;
    }

    if (payload.text) texts.push(payload.text.trim());
    const chunkSpeakers = new Set<number>();
    for (const segment of payload.segments || []) {
      const start = Math.max(0, Number(segment.start) + chunk.start);
      const end = Math.min(duration, Number(segment.end) + chunk.start);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const rawSpeaker = typeof segment.speaker === "number" && Number.isFinite(segment.speaker) ? segment.speaker : undefined;
      if (typeof rawSpeaker === "number") chunkSpeakers.add(rawSpeaker);
      const words = Array.isArray(segment.words) ? segment.words.map((word) => ({
        ...word,
        start: Math.max(0, Number(word.start) + chunk.start),
        end: Math.min(duration, Number(word.end) + chunk.start),
        text: String(word.text || "").trim(),
        speaker: typeof word.speaker === "number" ? word.speaker + speakerOffset : (typeof rawSpeaker === "number" ? rawSpeaker + speakerOffset : undefined),
      })).filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start && word.text) : undefined;
      segments.push({
        ...segment,
        start,
        end,
        text: String(segment.text || "").trim(),
        speaker: typeof rawSpeaker === "number" ? rawSpeaker + speakerOffset : undefined,
        words,
      });
    }
    if (endpoint === "/api/diarize" && chunkSpeakers.size > 0) {
      speakerOffset += Math.max(...chunkSpeakers) + 1;
    }
    diarized = diarized && payload.diarized !== false;
    if (payload.provider === "groq") provider = "groq";
  }

  onProgress?.({ phase: "transcribe", percent: 100, current: audioChunks.length, total: audioChunks.length });
  segments.sort((a, b) => a.start - b.start);
  const speakerCount = new Set(segments.map((segment) => segment.speaker).filter((value): value is number => typeof value === "number")).size;
  return { text: texts.join(" ").trim(), segments, diarized: diarized && speakerCount > 0, speakerCount, provider };
}

export async function transcribeVideo(
  file: File,
  duration: number,
  onProgress?: (progress: TranscribeProgress) => void,
  options: TranscribeOptions = {}
): Promise<TranscriptResult> {
  const audioChunks = await extractAudioChunks(file, duration, (percent, current, total) => {
    onProgress?.({ phase: "extract", percent, current, total });
  });

  const token = await getFirebaseIdToken();
  const jobId = newJobId();
  if (options.speakerDiarization) {
    try {
      return await transcribeChunks("/api/diarize", audioChunks, duration, jobId, token, options.language, onProgress);
    } catch (error) {
      const typed = error as Error & { code?: string; status?: number };
      if (typed.code !== "DIARIZATION_NOT_CONFIGURED" && typed.status !== 503) throw error;
      const fallback = await transcribeChunks("/api/transcribe", audioChunks, duration, jobId, token, options.language, onProgress);
      return { ...fallback, fallbackReason: typed.message || "Speaker diarization belum dikonfigurasi." };
    }
  }
  return transcribeChunks("/api/transcribe", audioChunks, duration, jobId, token, options.language, onProgress);
}
