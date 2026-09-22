import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { createLicenseCode, type LicensePlan } from "@/lib/license";
import { writeAdminAudit } from "@/lib/serverAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi." }, { status: 503 });
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { plan?: LicensePlan; days?: number | null; email?: string };
    const plan = body.plan === "lifetime" ? "lifetime" : "pro";
    const days = plan === "pro" ? Number(body.days || 365) : undefined;
    if (plan === "pro" && (!Number.isFinite(days) || !days || days <= 0 || days > 3650)) return NextResponse.json({ error: "Durasi Pro harus 1–3650 hari." }, { status: 400 });
    const email = String(body.email || "").trim().toLowerCase();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Format email lisensi tidak valid." }, { status: 400 });
    const generated = createLicenseCode({ plan, days, email: email || undefined });
    await getAdminDb().collection("clipperLicenses").doc(generated.claims.id).set({
      licenseId: generated.claims.id,
      plan,
      boundEmail: email || null,
      issuedBy: admin.uid,
      issuedByEmail: admin.email || null,
      issuedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: generated.claims.expiresAt ? Timestamp.fromMillis(generated.claims.expiresAt) : null,
      activatedBy: null,
      activatedEmail: null,
    }, { merge: true });
    await writeAdminAudit({ actorUid: admin.uid, actorEmail: admin.email || null, action: "license.create", targetType: "license", targetId: generated.claims.id, details: { plan, days: days || null, boundEmail: email || null } });
    return NextResponse.json({ success: true, code: generated.code, claims: generated.claims });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) return NextResponse.json({ error: "Login admin terverifikasi diperlukan." }, { status: 401 });
    if (code === "ADMIN_REQUIRED") return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    return NextResponse.json({ error: code || "Gagal membuat lisensi." }, { status: 400 });
  }
}
