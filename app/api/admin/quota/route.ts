import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { writeAdminAudit } from "@/lib/serverAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi." }, { status: 503 });
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { uid?: string; action?: "reset" };
    const uid = String(body.uid || "").trim();
    if (!uid || body.action !== "reset") return NextResponse.json({ error: "Permintaan quota tidak valid." }, { status: 400 });
    await getAdminDb().collection("clipperUsers").doc(uid).collection("usage").doc(dateKey()).set({
      date: dateKey(), count: 0, jobs: [], resetBy: admin.uid, resetAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAdminAudit({ actorUid: admin.uid, actorEmail: admin.email || null, action: "quota.reset", targetType: "user", targetId: uid, details: { date: dateKey() } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) return NextResponse.json({ error: "Login admin terverifikasi diperlukan." }, { status: 401 });
    if (code === "ADMIN_REQUIRED") return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    return NextResponse.json({ error: "Gagal mereset quota." }, { status: 500 });
  }
}
