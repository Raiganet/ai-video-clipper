import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { verifyRequestUser } from "@/lib/entitlements";
import { verifyLicenseCode } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Firebase belum dikonfigurasi." }, { status: 503 });
  }

  try {
    const user = await verifyRequestUser(request, { requireVerified: true });
    if (!user) return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    const body = await request.json() as { code?: string };
    const code = String(body.code || "").trim();
    if (!code) return NextResponse.json({ error: "Kode lisensi wajib diisi." }, { status: 400 });

    const claims = verifyLicenseCode(code);
    const email = (user.email || "").toLowerCase();
    if (claims.email && claims.email.toLowerCase() !== email) {
      return NextResponse.json({ error: "Lisensi ini dibuat untuk email lain." }, { status: 403 });
    }

    const db = getAdminDb();
    const userRef = db.collection("clipperUsers").doc(user.uid);
    const licenseRef = db.collection("clipperLicenses").doc(claims.id);

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(licenseRef);
      const activatedBy = existing.data()?.activatedBy;
      if (activatedBy && activatedBy !== user.uid) {
        throw new Error("LICENSE_ALREADY_USED");
      }
      tx.set(licenseRef, {
        licenseId: claims.id,
        plan: claims.plan,
        boundEmail: claims.email || null,
        activatedBy: user.uid,
        activatedEmail: user.email || null,
        activatedAt: existing.exists ? existing.data()?.activatedAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: claims.expiresAt ? Timestamp.fromMillis(claims.expiresAt) : null,
      }, { merge: true });
      tx.set(userRef, {
        email: user.email || null,
        plan: claims.plan,
        licenseId: claims.id,
        licenseExpiresAt: claims.expiresAt ? Timestamp.fromMillis(claims.expiresAt) : null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return NextResponse.json({ success: true, plan: claims.plan });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "AUTH_REQUIRED" || code === "AUTH_INVALID") {
      return NextResponse.json({ error: "Login diperlukan." }, { status: 401 });
    }
    if (code === "EMAIL_NOT_VERIFIED") {
      return NextResponse.json({ error: "Verifikasi email terlebih dahulu sebelum mengaktifkan lisensi." }, { status: 403 });
    }
    if (code === "LICENSE_ALREADY_USED") {
      return NextResponse.json({ error: "Lisensi sudah diaktifkan oleh akun lain." }, { status: 409 });
    }
    console.error("License activation error", error);
    return NextResponse.json({ error: code || "Aktivasi lisensi gagal." }, { status: 400 });
  }
}
