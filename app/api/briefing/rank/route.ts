import { NextRequest, NextResponse } from "next/server";
import { firebaseAccessIsEnabled, verifyRequestUser } from "@/lib/entitlements";
import { localRankBriefCandidates, normalizeBriefing, type BriefCandidate, type BriefingSpec, type BriefRankedMoment } from "@/lib/briefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const store = new Map<string, { count: number; resetAt: number }>();
function requestKey(request: NextRequest, uid?: string) { return uid || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"; }
function limited(k: string) { const now = Date.now(); const item = store.get(k); if (!item || item.resetAt <= now) { store.set(k, { count: 1, resetAt: now + 10 * 60_000 }); return false; } item.count += 1; return item.count > 24; }

export async function POST(request: NextRequest) {
  try {
    let uid: string | undefined;
    if (firebaseAccessIsEnabled()) { const user = await verifyRequestUser(request, { requireVerified: true }); if (!user) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 }); uid = user.uid; }
    if (limited(requestKey(request, uid))) return NextResponse.json({ error: "Terlalu banyak ranking briefing." }, { status: 429 });
    const body = await request.json() as { brief?: BriefingSpec; candidates?: BriefCandidate[] };
    const brief = normalizeBriefing(body.brief);
    const candidates = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 28).map((item, index) => ({
      id: Number(item.id || index + 1), start: Number(item.start || 0), end: Number(item.end || 0), duration: Number(item.duration || 0), text: String(item.text || "").slice(0, 4500), speakerRatio: Number(item.speakerRatio || 0), localScore: Number(item.localScore || 0), narrativeHint: String(item.narrativeHint || "").slice(0, 300), flags: Array.isArray(item.flags) ? item.flags.map(String).slice(0, 8) : [],
    })).filter((item) => item.end > item.start && item.text);
    if (!brief.enabled || candidates.length === 0) return NextResponse.json({ rankings: localRankBriefCandidates(candidates, brief) });
    const apiKey = String(process.env.GROQ_API_KEY || "").trim();
    if (!apiKey) return NextResponse.json({ rankings: localRankBriefCandidates(candidates, brief) });
    const model = String(process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile").trim();
    const promptBrief = {
      objective: brief.objective, targetSubject: brief.targetSubject, durationMin: brief.durationMin, durationMax: brief.durationMax,
      requiredNarratives: brief.requiredNarratives, requiredRules: brief.requiredRules, forbiddenRules: brief.forbiddenRules,
      forbiddenTopics: brief.forbiddenTopics, targetSpeakerTagged: brief.targetSpeakerIndex !== null,
    };
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 50_000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, temperature: 0.15, max_completion_tokens: 2200, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Kamu adalah editor campaign short-video. Pilih kandidat yang PALING sesuai briefing hanya dari transcript yang diberikan. Jangan menambah klaim/fakta. Patuhi larangan briefing. Kandidat dengan topik terlarang harus score sangat rendah dan diberi flag. Jika briefing finansial melarang janji keuntungan/rekomendasi saham, flag kandidat yang mengandung janji pasti untung/auto cuan/rekomendasi beli. Balas JSON {rankings:[{candidateId,score(0-100),title<=90,reason<=220,narrative<=180,flags:string[]}]} untuk semua kandidat, urut skor tertinggi." },
            { role: "user", content: JSON.stringify({ brief: promptBrief, candidates }) },
          ],
        }),
      });
      if (!response.ok) return NextResponse.json({ rankings: localRankBriefCandidates(candidates, brief) });
      const raw = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const parsed = JSON.parse(raw.choices?.[0]?.message?.content || "{}") as { rankings?: BriefRankedMoment[] };
      const validIds = new Set(candidates.map((item) => item.id));
      const rankings = (Array.isArray(parsed.rankings) ? parsed.rankings : []).filter((item) => validIds.has(Number(item.candidateId))).map((item) => ({
        candidateId: Number(item.candidateId), score: Math.max(0, Math.min(100, Number(item.score) || 0)), title: String(item.title || "Klip sesuai briefing").slice(0, 100), reason: String(item.reason || "Sesuai briefing").slice(0, 260), narrative: String(item.narrative || "").slice(0, 220), flags: Array.isArray(item.flags) ? item.flags.map(String).slice(0, 8) : [],
      }));
      return NextResponse.json({ rankings: rankings.length ? rankings : localRankBriefCandidates(candidates, brief) }, { headers: { "Cache-Control": "no-store" } });
    } finally { clearTimeout(timeout); }
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID"].includes(code)) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    if (code === "EMAIL_NOT_VERIFIED") return NextResponse.json({ error: "Verifikasi email terlebih dahulu." }, { status: 403 });
    if (error instanceof Error && error.name === "AbortError") return NextResponse.json({ error: "AI ranking timeout." }, { status: 504 });
    console.error("Brief ranking error", error);
    return NextResponse.json({ error: "Gagal memilih klip sesuai briefing." }, { status: 500 });
  }
}
