"use client";

import { getFirebaseIdToken } from "@/lib/firebaseClient";

export type AnalyticsEventName =
  | "render_success"
  | "render_error"
  | "transcribe_error"
  | "cloud_sync_success"
  | "cloud_sync_error"
  | "batch_render_complete"
  | "campaign_batch_complete";

export async function trackAnalytics(
  event: AnalyticsEventName,
  data: Record<string, string | number | boolean | null | undefined> = {}
) {
  try {
    const token = await getFirebaseIdToken();
    if (!token) return;
    const clean = Object.fromEntries(
      Object.entries(data)
        .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value === null)
        .slice(0, 20)
    );
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ event, data: clean }),
      keepalive: true,
    });
  } catch {
    // Analytics must never block the editor.
  }
}
