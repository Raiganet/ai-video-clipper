import { NextRequest, NextResponse } from "next/server";
import { consumeAiJob, firebaseAccessIsEnabled, verifyRequestUser } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 48 * 1024 * 1024;
const allowedTypes = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm",
  "audio/mp4", "audio/ogg", "audio/flac", "video/mp4", "video/webm", "video/quicktime",
]);

export async function POST(request: NextRequest) {
  try {
    let authenticatedUser: Awaited<ReturnType<typeof verifyRequestUser>> = null;
    let jobId = "";
    if (firebaseAccessIsEnabled()) {
      authenticatedUser = await verifyRequestUser(request, { requireVerified: true });
      if (!authenticatedUser) return NextResponse.json({ error: "Login diperlukan untuk menggunakan AI." }, { status: 401 });
      jobId = (request.headers.get("x-clipper-job-id") || "").trim();
      if (!jobId || jobId.length > 120) return NextResponse.json({ error: "Job ID AI tidak valid." }, { status: 400 });
    }

    const apiKey = String(process.env.DEEPGRAM_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Speaker diarization belum dikonfigurasi.", code: "DIARIZATION_NOT_CONFIGURED" }, { status: 503 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const languageValue = String(formData.get("language") || "").trim().toLowerCase();
    const language = /^[a-z]{2}(-[a-z]{2})?$/.test(languageValue) ? languageValue : "id";

    if (!(file instanceof File)) return NextResponse.json({ error: "File audio tidak ditemukan." }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: "File audio kosong." }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: `Audio ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas diarization 48 MB per bagian.` }, { status: 413 });
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: `Format ${file.type || "tidak dikenal"} tidak didukung.` }, { status: 400 });

    if (authenticatedUser) await consumeAiJob(authenticatedUser.uid, authenticatedUser.email || null, jobId);

    const params = new URLSearchParams({
      diarize_model: "latest",
      punctuate: "true",
      smart_format: "true",
      utterances: "true",
      language,
      model: String(process.env.DEEPGRAM_MODEL || "nova-3"),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": file.type || "audio/mp4",
        },
        body: file,
        signal: controller.signal,
        cache: "no-store",
      });
      const raw = await response.text();
      if (!response.ok) {
        let message = raw || "Speaker diarization gagal.";
        try {
          const parsed = JSON.parse(raw) as { err_msg?: string; message?: string; error?: string };
          message = parsed.err_msg || parsed.message || parsed.error || message;
        } catch { /* response bukan JSON */ }
        return NextResponse.json({ error: message, code: "DIARIZATION_PROVIDER_ERROR" }, { status: response.status });
      }

      const result = JSON.parse(raw) as {
        results?: {
          utterances?: Array<{ start?: number; end?: number; transcript?: string; speaker?: number; confidence?: number; words?: Array<{ start?: number; end?: number; word?: string; punctuated_word?: string; speaker?: number; speaker_confidence?: number }> }>;
          channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: Array<{ start?: number; end?: number; word?: string; punctuated_word?: string; speaker?: number; speaker_confidence?: number }> }> }>;
        };
      };

      const utterances = Array.isArray(result.results?.utterances) ? result.results!.utterances! : [];
      let segments = utterances.map((item) => {
        const speaker = Number.isFinite(Number(item.speaker)) ? Number(item.speaker) : undefined;
        return {
          start: Number(item.start),
          end: Number(item.end),
          text: String(item.transcript || "").trim(),
          speaker,
          speakerConfidence: typeof item.confidence === "number" ? item.confidence : undefined,
          words: (item.words || []).map((word) => ({
            start: Number(word.start),
            end: Number(word.end),
            text: String(word.punctuated_word || word.word || "").trim(),
            speaker: Number.isFinite(Number(word.speaker)) ? Number(word.speaker) : speaker,
            speakerConfidence: typeof word.speaker_confidence === "number" ? word.speaker_confidence : undefined,
          })).filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start && word.text),
        };
      }).filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start && segment.text);

      if (segments.length === 0) {
        const alternative = result.results?.channels?.[0]?.alternatives?.[0];
        const words = Array.isArray(alternative?.words) ? alternative!.words! : [];
        const grouped: typeof segments = [];
        for (const word of words) {
          const start = Number(word.start);
          const end = Number(word.end);
          const speaker = Number.isFinite(Number(word.speaker)) ? Number(word.speaker) : undefined;
          const text = String(word.punctuated_word || word.word || "").trim();
          if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
          const previous = grouped[grouped.length - 1];
          if (previous && previous.speaker === speaker && start - previous.end < 1.2) {
            previous.end = end;
            previous.text = `${previous.text} ${text}`.trim();
            previous.words = [...(previous.words || []), { start, end, text, speaker, speakerConfidence: typeof word.speaker_confidence === "number" ? word.speaker_confidence : undefined }];
          } else {
            grouped.push({ start, end, text, speaker, speakerConfidence: typeof word.speaker_confidence === "number" ? word.speaker_confidence : undefined, words: [{ start, end, text, speaker, speakerConfidence: typeof word.speaker_confidence === "number" ? word.speaker_confidence : undefined }] });
          }
        }
        segments = grouped;
      }

      const text = segments.map((segment) => segment.text).join(" ").trim();
      const speakers = [...new Set(segments.map((segment) => segment.speaker).filter((value): value is number => typeof value === "number"))];
      return NextResponse.json({ success: true, text, segments, diarized: true, speakerCount: speakers.length, provider: "deepgram" });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("Diarization Error:", error);
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "AUTH_REQUIRED" || code === "AUTH_INVALID") return NextResponse.json({ error: "Login diperlukan untuk menggunakan AI." }, { status: 401 });
    if (code === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "Verifikasi email terlebih dahulu sebelum menggunakan AI." }, { status: 403 });
    if (code === "TRIAL_EXPIRED") return NextResponse.json({ error: "Trial 7 hari sudah berakhir. Aktifkan lisensi untuk melanjutkan AI." }, { status: 402 });
    if (code === "QUOTA_EXCEEDED") return NextResponse.json({ error: "Quota AI harian sudah habis. Coba lagi besok atau gunakan paket yang lebih tinggi." }, { status: 429 });
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "Timeout saat menjalankan speaker diarization." }, { status: 504 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
  }
}
