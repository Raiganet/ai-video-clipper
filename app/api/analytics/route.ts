import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/entitlements";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["render_success", "render_error", "transcribe_error", "cloud_sync_success", "cloud_sync_error", "batch_render_complete"]);

function cleanData(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key)) continue;
    if (typeof value === "string") output[key] = value.slice(0, 160);
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = value;
    else if (typeof value === "boolean" || value === null) output[key] = value;
  }
  return output;
}

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ success: true, skipped: true });
  try {
    const user = await verifyRequestUser(request, { requireVerified: true });
    if (!user) throw new Error("AUTH_REQUIRED");
    const body = await request.json() as { event?: string; data?: unknown };
    const event = String(body.event || "");
    if (!ALLOWED.has(event)) return NextResponse.json({ error: "Event analytics tidak valid." }, { status: 400 });
    const db = getAdminDb();
    const day = new Date().toISOString().slice(0, 10);
    const usageRef = db.collection("clipperAnalyticsUsage").doc(`${user.uid}_${day}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const count = Number(snap.data()?.count || 0);
      if (count >= 500) throw new Error("ANALYTICS_LIMIT");
      tx.set(usageRef, { uid: user.uid, day, count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    await db.collection("clipperAnalytics").add({
      uid: user.uid,
      event,
      data: cleanData(body.data),
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) return NextResponse.json({ error: "Login terverifikasi diperlukan." }, { status: 401 });
    if (code === "ANALYTICS_LIMIT") return NextResponse.json({ success: true, skipped: true });
    return NextResponse.json({ error: "Analytics gagal dicatat." }, { status: 500 });
  }
}
