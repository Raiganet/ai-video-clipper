"use client";

import { getFirebaseIdToken } from "@/lib/firebaseClient";

export interface ClipSocialMetadata {
  title: string;
  description: string;
  hashtags: string[];
  hook: string;
  cta: string;
  generatedAt: number;
}

export async function generateClipSocialMetadata(input: {
  clipTitle: string;
  reason?: string;
  transcript: string;
  vibe: string;
  durationSec: number;
  briefing?: { campaignName?: string; ctaText?: string; bioLink?: string; hashtags?: string[]; requiredNarratives?: string[]; forbiddenRules?: string[] };
}): Promise<ClipSocialMetadata> {
  const token = await getFirebaseIdToken();
  const response = await fetch("/api/clip-metadata", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const payload = await response.json() as Partial<ClipSocialMetadata> & { error?: string };
  if (!response.ok || !payload.title || !payload.description) throw new Error(payload.error || "AI metadata gagal dibuat.");
  return {
    title: String(payload.title).slice(0, 140),
    description: String(payload.description).slice(0, 1200),
    hashtags: Array.isArray(payload.hashtags) ? payload.hashtags.map(String).slice(0, 12) : [],
    hook: String(payload.hook || "").slice(0, 220),
    cta: String(payload.cta || "").slice(0, 220),
    generatedAt: Date.now(),
  };
}
