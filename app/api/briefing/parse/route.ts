import { NextRequest, NextResponse } from "next/server";
import { firebaseAccessIsEnabled, verifyRequestUser } from "@/lib/entitlements";
import { normalizeBriefing, parseBriefingLocally } from "@/lib/briefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store = new Map<string, { count: number; resetAt: number }>();
function key(request: NextRequest, uid?: string) { return uid || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"; }
function limited(k: string) { const now = Date.now(); const item = store.get(k); if (!item || item.resetAt <= now) { store.set(k, { count: 1, resetAt: now + 10 * 60_000 }); return false; } item.count += 1; return item.count > 20; }

export async function POST(request: NextRequest) {
  try {
    let uid: string | undefined;
    if (firebaseAccessIsEnabled()) { const user = await verifyRequestUser(request, { requireVerified: true }); if (!user) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 }); uid = user.uid; }
    if (limited(key(request, uid))) return NextResponse.json({ error: "Terlalu banyak analisis briefing. Coba lagi beberapa menit." }, { status: 429 });
    const body = await request.json() as { raw?: string };
    const raw = String(body.raw || "").trim().slice(0, 30_000);
    if (raw.length < 20) return NextResponse.json({ error: "Briefing terlalu pendek." }, { status: 400 });
    const local = parseBriefingLocally(raw);
    const apiKey = String(process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) return NextResponse.json(local, { headers: { "Cache-Control": "no-store" } });
    const model = String(process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile").trim();
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, temperature: 0.1, max_completion_tokens: 1300, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Ekstrak briefing campaign video menjadi JSON. Jangan mengarang aturan. Field WAJIB: campaignName(string), objective(string), targetSubject(string), durationMin(number), durationMax(number), ctaText(string), ctaDuration(number), bioLink(string), requireLogo(boolean), requireTargetSpeaker(boolean), requiredNarratives(string[]), requiredRules(string[]), forbiddenRules(string[]), forbiddenTopics(string[]), hashtags(string[]), materials(array {title,url,kind}), manualChecks(string[]). materials hanya URL materi sumber, bukan bioLink. manualChecks untuk aturan yang tidak bisa diverifikasi dari transcript seperti screenshot/repost/ads/bot. forbiddenTopics isi topik eksplisit yang dilarang. Balas JSON valid saja." },
            { role: "user", content: raw },
          ],
        }),
      });
      if (!response.ok) return NextResponse.json(local, { headers: { "Cache-Control": "no-store" } });
      const rawResponse = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = rawResponse.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const normalized = normalizeBriefing({ ...local, ...parsed, raw, enabled: true, source: "ai", analyzedAt: Date.now(), targetSpeakerIndex: null });
      return NextResponse.json(normalized, { headers: { "Cache-Control": "no-store" } });
    } finally { clearTimeout(timeout); }
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    if (code === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "Verifikasi email terlebih dahulu." }, { status: 403 });
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "AI briefing timeout." }, { status: 504 });
    console.error("Briefing parse error", error);
    return NextResponse.json({ error: "Gagal menganalisis briefing." }, { status: 500 });
  }
}
