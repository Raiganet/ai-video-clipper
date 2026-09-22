import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { applyPaymentEvent, type PaymentStatus } from "@/lib/paymentEntitlements";
import { writeAdminAudit } from "@/lib/serverAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  try {
    const left = Buffer.from(a.toLowerCase(), "hex");
    const right = Buffer.from(b.toLowerCase(), "hex");
    return left.length === right.length && timingSafeEqual(left, right);
  } catch { return false; }
}

function mapStatus(transactionStatus: string, fraudStatus: string, statusCode: string): PaymentStatus {
  const status = transactionStatus.toLowerCase();
  const fraud = fraudStatus.toLowerCase();
  if (status === "settlement") return statusCode === "200" ? "paid" : "pending";
  if (status === "capture") return statusCode === "200" && (!fraud || fraud === "accept") ? "paid" : fraud === "deny" ? "failed" : "pending";
  if (["refund", "partial_refund"].includes(status)) return "refunded";
  if (status === "expire") return "expired";
  if (["deny", "cancel", "failure"].includes(status)) return "failed";
  return "pending";
}

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi." }, { status: 503 });
  const serverKey = String(process.env.MIDTRANS_SERVER_KEY || "").trim();
  if (!serverKey) return NextResponse.json({ error: "Midtrans belum dikonfigurasi." }, { status: 503 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const orderId = String(body.order_id || "").trim();
    const statusCode = String(body.status_code || "").trim();
    const grossAmountRaw = String(body.gross_amount || "").trim();
    const signature = String(body.signature_key || "").trim();
    const transactionStatus = String(body.transaction_status || "").trim();
    const fraudStatus = String(body.fraud_status || "").trim();
    if (!orderId || !statusCode || !grossAmountRaw || !signature || !transactionStatus) {
      return NextResponse.json({ error: "Payload Midtrans tidak lengkap." }, { status: 400 });
    }

    const expected = createHash("sha512").update(`${orderId}${statusCode}${grossAmountRaw}${serverKey}`).digest("hex");
    if (!safeEqual(expected, signature)) return NextResponse.json({ error: "Signature Midtrans tidak valid." }, { status: 401 });

    const paymentRef = getAdminDb().collection("clipperPayments").doc(orderId);
    const existing = await paymentRef.get();
    if (!existing.exists) return NextResponse.json({ error: "Order Midtrans tidak dikenal." }, { status: 404 });
    const stored = existing.data() || {};
    if (String(stored.provider || "") !== "midtrans") return NextResponse.json({ error: "Provider order tidak sesuai." }, { status: 409 });
    const grossAmount = Number(grossAmountRaw);
    if (!Number.isFinite(grossAmount) || Math.round(grossAmount) !== Math.round(Number(stored.amount || 0))) {
      return NextResponse.json({ error: "Nominal pembayaran tidak sesuai order." }, { status: 409 });
    }

    const status = mapStatus(transactionStatus, fraudStatus, statusCode);
    const result = await applyPaymentEvent({
      transactionId: orderId,
      provider: "midtrans",
      status,
      email: String(stored.email || "").toLowerCase(),
      plan: stored.plan === "lifetime" ? "lifetime" : "pro",
      days: stored.days == null ? null : Number(stored.days),
      amount: Number(stored.amount),
      currency: "IDR",
    });

    await paymentRef.set({
      midtransTransactionId: String(body.transaction_id || "").slice(0, 150) || null,
      paymentType: String(body.payment_type || "").slice(0, 80) || null,
      transactionStatus,
      fraudStatus: fraudStatus || null,
      statusCode,
      notificationReceivedAt: new Date(),
    }, { merge: true });

    await writeAdminAudit({
      actorUid: "midtrans-webhook",
      actorEmail: null,
      action: `payment.midtrans_${status}`,
      targetType: "payment",
      targetId: orderId,
      details: { transactionStatus, fraudStatus, entitlementApplied: result.entitlementApplied },
    });
    return NextResponse.json({ success: true, status, ...result });
  } catch (error) {
    console.error("Midtrans notification failed", error);
    return NextResponse.json({ error: "Notification Midtrans gagal diproses." }, { status: 500 });
  }
}
