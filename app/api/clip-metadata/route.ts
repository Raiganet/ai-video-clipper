import { NextRequest, NextResponse } from "next/server";
import { firebaseAccessIsEnabled, verifyRequestUser } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const META_WINDOW_MS = 10 * 60 * 1000;
const META_MAX_REQUESTS = 30;
type MetaRateEntry = { count: number; resetAt: number };
const globalForMetaRate = globalThis as typeof globalThis & { __clipperMetaRate?: Map<string, MetaRateEntry> };
const metaRate = globalForMetaRate.__clipperMetaRate ?? new Map<string, MetaRateEntry>();
globalForMetaRate.__clipperMetaRate = metaRate;

function rateKey(request: NextRequest, uid?: string) {
  if (uid) return `uid:${uid}`;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  return `ip:${ip}`;
}

function metaRateLimited(key: string) {
  const now = Date.now();
  const current = metaRate.get(key);
  if (!current || current.resetAt <= now) { metaRate.set(key, { count: 1, resetAt: now + META_WINDOW_MS }); return false; }
  current.count += 1;
  return current.count > META_MAX_REQUESTS;
}

function cleanHashtags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean).map((item) => item.startsWith("#") ? item : `#${item.replace(/^#+/, "")}`).slice(0, 12);
}

export async function POST(request: NextRequest) {
  try {
    let uid: string | undefined;
    if (firebaseAccessIsEnabled()) {
      const user = await verifyRequestUser(request, { requireVerified: true });
      if (!user) return NextResponse.json({ error: "Login diperlukan untuk metadata AI." }, { status: 401 });
      uid = user.uid;
    }
    if (metaRateLimited(rateKey(request, uid))) {
      return NextResponse.json({ error: "Terlalu banyak permintaan Publish Pack. Coba lagi beberapa menit." }, { status: 429, headers: { "Retry-After": "600" } });
    }
    const apiKey = String(process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) return NextResponse.json({ error: "GROQ_API_KEY belum dikonfigurasi." }, { status: 503 });
    const body = await request.json() as { clipTitle?: string; reason?: string; transcript?: string; vibe?: string; durationSec?: number; briefing?: { campaignName?: string; ctaText?: string; bioLink?: string; hashtags?: string[]; requiredNarratives?: string[]; forbiddenRules?: string[] } };
    const transcript = String(body.transcript || "").trim().slice(0, 8000);
    if (!transcript) return NextResponse.json({ error: "Transcript klip kosong." }, { status: 400 });

    const model = String(process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile").trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.4,
          max_completion_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: "Kamu adalah copywriter video pendek berbahasa Indonesia. Balas HANYA JSON valid dengan field title, description, hashtags(array), hook, cta. Jangan membuat klaim fakta yang tidak ada di transcript. Jika briefing diberikan, patuhi CTA dan hashtag wajib serta jangan melanggar forbiddenRules. BioLink berarti link harus ditempatkan di bio profile; CTA boleh mengatakan link di bio tanpa mengarang klaim. Judul <= 90 karakter, deskripsi <= 500 karakter, 5-12 hashtag relevan.",
            },
            {
              role: "user",
              content: JSON.stringify({ clipTitle: body.clipTitle || "", reason: body.reason || "", vibe: body.vibe || "viral", durationSec: Number(body.durationSec || 0), transcript, briefing: body.briefing || null }),
            },
          ],
        }),
      });
      const raw = await response.text();
      if (!response.ok) return NextResponse.json({ error: `Groq metadata gagal (HTTP ${response.status}).` }, { status: 502 });
      const parsed = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
      const content = parsed.choices?.[0]?.message?.content || "{}";
      const result = JSON.parse(content) as Record<string, unknown>;
      const requiredTags = cleanHashtags(body.briefing?.hashtags || []);
      const aiTags = cleanHashtags(result.hashtags);
      const hashtags = [...new Set([...requiredTags, ...aiTags])].slice(0, 12);
      const briefingCta = String(body.briefing?.ctaText || "").trim();
      const bioLink = String(body.briefing?.bioLink || "").trim();
      let description = String(result.description || "").slice(0, 1200);
      if (bioLink && !/link di bio/i.test(description)) description = `${description}${description ? "\n\n" : ""}Cek info lengkap melalui link di bio.`.slice(0, 1200);
      return NextResponse.json({
        title: String(result.title || body.clipTitle || "Klip AI").slice(0, 140),
        description,
        hashtags,
        hook: String(result.hook || "").slice(0, 220),
        cta: (briefingCta || String(result.cta || "")).slice(0, 220),
      }, { headers: { "Cache-Control": "no-store" } });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    if (code === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "Verifikasi email terlebih dahulu." }, { status: 403 });
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "AI metadata timeout." }, { status: 504 });
    console.error("Clip metadata error", error);
    return NextResponse.json({ error: "Gagal membuat metadata AI." }, { status: 500 });
  }
}
