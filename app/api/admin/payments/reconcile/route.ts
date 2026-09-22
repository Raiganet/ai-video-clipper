import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { applyPaymentEvent } from "@/lib/paymentEntitlements";
import { writeAdminAudit } from "@/lib/serverAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapStatus(transactionStatus: string, fraudStatus: string, statusCode: string) {
  const status = transactionStatus.toLowerCase();
  const fraud = fraudStatus.toLowerCase();
  if (status === "settlement") return "paid" as const;
  if (status === "capture") return statusCode === "200" && (!fraud || fraud === "accept") ? "paid" as const : fraud === "deny" ? "failed" as const : "pending" as const;
  if (["refund", "partial_refund"].includes(status)) return "refunded" as const;
  if (status === "expire") return "expired" as const;
  if (["deny", "cancel", "failure"].includes(status)) return "failed" as const;
  return "pending" as const;
}

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi." }, { status: 503 });
  const serverKey = String(process.env.MIDTRANS_SERVER_KEY || "").trim();
  if (!serverKey) return NextResponse.json({ error: "MIDTRANS_SERVER_KEY belum dikonfigurasi." }, { status: 503 });
  try {
    const admin = await requireAdmin(request);
    const body = await request.json() as { orderId?: string };
    const orderId = String(body.orderId || "").trim();
    if (!/^[A-Za-z0-9._:-]{6,100}$/.test(orderId)) return NextResponse.json({ error: "Order ID tidak valid." }, { status: 400 });

    const ref = getAdminDb().collection("clipperPayments").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Order tidak ditemukan." }, { status: 404 });
    const stored = snap.data() || {};
    if (String(stored.provider || "") !== "midtrans") return NextResponse.json({ error: "Rekonsiliasi ini hanya untuk Midtrans." }, { status: 400 });

    const production = String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true";
    const base = production ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
    const response = await fetch(`${base}/v2/${encodeURIComponent(orderId)}/status`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}` },
      cache: "no-store",
    });
    const remote = await response.json() as Record<string, unknown>;
    if (!response.ok) return NextResponse.json({ error: String(remote.status_message || `Midtrans HTTP ${response.status}`) }, { status: 502 });

    const grossAmount = Number(remote.gross_amount || 0);
    if (!Number.isFinite(grossAmount) || Math.round(grossAmount) !== Math.round(Number(stored.amount || 0))) {
      return NextResponse.json({ error: "Nominal Midtrans tidak cocok dengan order lokal." }, { status: 409 });
    }
    const transactionStatus = String(remote.transaction_status || "");
    const fraudStatus = String(remote.fraud_status || "");
    const statusCode = String(remote.status_code || "");
    const status = mapStatus(transactionStatus, fraudStatus, statusCode);
    const result = await applyPaymentEvent({
      transactionId: orderId,
      provider: "midtrans",
      status,
      email: String(stored.email || "").toLowerCase(),
      plan: stored.plan === "lifetime" ? "lifetime" : "pro",
      days: stored.days == null ? null : Number(stored.days),
      amount: Number(stored.amount || 0),
      currency: "IDR",
    });

    await ref.set({
      transactionStatus,
      fraudStatus: fraudStatus || null,
      statusCode,
      paymentType: String(remote.payment_type || "").slice(0, 80) || null,
      midtransTransactionId: String(remote.transaction_id || "").slice(0, 150) || null,
      reconciledAt: FieldValue.serverTimestamp(),
      reconciliationSource: "get-status-api",
    }, { merge: true });
    await writeAdminAudit({
      actorUid: admin.uid,
      actorEmail: admin.email || null,
      action: `payment.midtrans_reconcile_${status}`,
      targetType: "payment",
      targetId: orderId,
      details: { transactionStatus, fraudStatus, entitlementApplied: result.entitlementApplied },
    });
    return NextResponse.json({ success: true, orderId, status, transactionStatus, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) return NextResponse.json({ error: "Login admin diperlukan." }, { status: 401 });
    if (code === "ADMIN_REQUIRED") return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    console.error("Midtrans reconcile failed", error);
    return NextResponse.json({ error: "Rekonsiliasi Midtrans gagal." }, { status: 500 });
  }
}
