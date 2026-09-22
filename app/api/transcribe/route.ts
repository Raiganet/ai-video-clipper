import { NextRequest, NextResponse } from "next/server";
import { consumeAiJob, firebaseAccessIsEnabled, verifyRequestUser } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 24 * 1024 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

interface RateEntry {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __clipperRateLimit?: Map<string, RateEntry>;
};

const rateStore = globalForRateLimit.__clipperRateLimit ?? new Map<string, RateEntry>();
globalForRateLimit.__clipperRateLimit = rateStore;

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

function isRateLimited(key: string) {
  const now = Date.now();
  const existing = rateStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_REQUESTS_PER_WINDOW;
}

const allowedTypes = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm",
  "audio/mp4", "audio/ogg", "audio/flac", "video/mp4", "video/webm", "video/quicktime",
]);

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi beberapa menit." }, { status: 429, headers: { "Retry-After": "600" } });
  }

  try {
    let authenticatedUser: Awaited<ReturnType<typeof verifyRequestUser>> = null;
    let jobId = "";
    if (firebaseAccessIsEnabled()) {
      authenticatedUser = await verifyRequestUser(request, { requireVerified: true });
      if (!authenticatedUser) return NextResponse.json({ error: "Login diperlukan untuk menggunakan AI." }, { status: 401 });
      jobId = (request.headers.get("x-clipper-job-id") || "").trim();
      if (!jobId || jobId.length > 120) return NextResponse.json({ error: "Job ID AI tidak valid." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY belum dikonfigurasi." }, { status: 500 });

    const formData = await request.formData();
    const file = formData.get("file");
    const languageValue = String(formData.get("language") || "").trim().toLowerCase();
    const language = /^[a-z]{2}$/.test(languageValue) ? languageValue : null;

    if (!(file instanceof File)) return NextResponse.json({ error: "File audio tidak ditemukan." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "File audio kosong." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: `Audio ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas aman 24 MB per bagian.` }, { status: 413 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: `Format ${file.type || "tidak dikenal"} tidak didukung.` }, { status: 400 });

    if (authenticatedUser) {
      await consumeAiJob(authenticatedUser.uid, authenticatedUser.email || null, jobId);
    }

    const groqForm = new FormData();
    groqForm.append("file", file, file.name || "audio.m4a");
    groqForm.append("model", process.env.GROQ_WHISPER_MODEL || "whisper-large-v3");
    groqForm.append("response_format", "verbose_json");
    groqForm.append("timestamp_granularities[]", "segment");
    groqForm.append("timestamp_granularities[]", "word");
    if (language) groqForm.append("language", language);
    groqForm.append("temperature", "0");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: groqForm,
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        let message = raw || "Transkripsi gagal.";
        try {
          const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
          message = parsed.error?.message || parsed.message || message;
        } catch { /* bukan JSON */ }
        return NextResponse.json({ error: message }, { status: response.status });
      }

      const result = JSON.parse(raw) as {
        text?: string;
        words?: Array<{ start?: number; end?: number; word?: string }>;
        segments?: Array<{ start?: number; end?: number; text?: string; avg_logprob?: number; no_speech_prob?: number }>;
      };
      const words = (result.words || []).map((word) => ({
        start: Number(word.start),
        end: Number(word.end),
        text: String(word.word || "").trim(),
      })).filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start && word.text);
      const segments = (result.segments || []).map((segment) => {
        const start = Number(segment.start);
        const end = Number(segment.end);
        return {
          start, end,
          text: String(segment.text || "").trim(),
          avgLogprob: typeof segment.avg_logprob === "number" ? segment.avg_logprob : undefined,
          noSpeechProb: typeof segment.no_speech_prob === "number" ? segment.no_speech_prob : undefined,
          words: words.filter((word) => word.end > start && word.start < end),
        };
      }).filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start);

      return NextResponse.json({ success: true, text: String(result.text || "").trim(), segments });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("Transcription Error:", error);
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "AUTH_REQUIRED" || code === "AUTH_INVALID") return NextResponse.json({ error: "Login diperlukan untuk menggunakan AI." }, { status: 401 });
    if (code === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "Verifikasi email terlebih dahulu sebelum menggunakan AI." }, { status: 403 });
    if (code === "TRIAL_EXPIRED") return NextResponse.json({ error: "Trial 7 hari sudah berakhir. Aktifkan lisensi untuk melanjutkan AI." }, { status: 402 });
    if (code === "QUOTA_EXCEEDED") return NextResponse.json({ error: "Quota AI harian sudah habis. Coba lagi besok atau gunakan paket yang lebih tinggi." }, { status: 429 });
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "Timeout saat menghubungi layanan transkripsi." }, { status: 504 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
