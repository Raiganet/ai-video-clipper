"use client";

import { getFirebaseIdToken } from "@/lib/firebaseClient";
import { normalizeBriefing, parseBriefingLocally, type BriefCandidate, type BriefingSpec, type BriefRankedMoment } from "@/lib/briefing";

export async function analyzeBriefing(raw: string): Promise<BriefingSpec> {
  const fallback = parseBriefingLocally(raw);
  const token = await getFirebaseIdToken();
  try {
    const response = await fetch("/api/briefing/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      cache: "no-store",
      body: JSON.stringify({ raw }),
    });
    const payload = await response.json() as Partial<BriefingSpec> & { error?: string };
    if (!response.ok) throw new Error(payload.error || "AI briefing gagal.");
    return normalizeBriefing({ ...fallback, ...payload, raw, enabled: true, source: "ai", analyzedAt: Date.now(), targetSpeakerIndex: fallback.targetSpeakerIndex });
  } catch (error) {
    console.warn("Briefing AI unavailable, using local parser", error);
    return fallback;
  }
}

export async function rankBriefCandidates(brief: BriefingSpec, candidates: BriefCandidate[]): Promise<BriefRankedMoment[]> {
  const token = await getFirebaseIdToken();
  const response = await fetch("/api/briefing/rank", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
    body: JSON.stringify({ brief, candidates: candidates.slice(0, 28) }),
  });
  const payload = await response.json() as { rankings?: BriefRankedMoment[]; error?: string };
  if (!response.ok || !Array.isArray(payload.rankings)) throw new Error(payload.error || "AI ranking briefing gagal.");
  return payload.rankings;
}
