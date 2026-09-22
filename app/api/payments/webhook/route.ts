import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyPaymentEvent, type CanonicalPaymentEvent, type PaymentPlan, type PaymentStatus } from "@/lib/paymentEntitlements";
import { isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { writeAdminAudit } from "@/lib/serverAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set<PaymentStatus>(["pending", "paid", "failed", "expired", "refunded"]);
const PLANS = new Set<PaymentPlan>(["pro", "lifetime"]);

function verifySignature(raw: string, incoming: string, secret: string) {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(incoming.trim().toLowerCase(), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

function validate(input: unknown): CanonicalPaymentEvent | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const transactionId = String(value.transactionId || "").trim();
  const provider = String(value.provider || "").trim().slice(0, 60);
  const status = String(value.status || "").trim().toLowerCase() as PaymentStatus;
  const email = String(value.email || "").trim().toLowerCase();
  const plan = String(value.plan || "").trim().toLowerCase() as PaymentPlan;
  const days = value.days == null ? null : Number(value.days);
  const amount = value.amount == null ? null : Number(value.amount);
  const currency = value.currency == null ? null : String(value.currency).slice(0, 10).toUpperCase();
  if (!transactionId || transactionId.length > 150 || !provider || !STATUSES.has(status) || !PLANS.has(plan)) return null;
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;
  if (plan === "pro" && days != null && (!Number.isFinite(days) || days < 1 || days > 3650)) return null;
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return null;
  return { transactionId, provider, status, email, plan, days, amount, currency };
}

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi." }, { status: 503 });
  const secret = String(process.env.PAYMENT_WEBHOOK_SECRET || "");
  if (secret.length < 32) return NextResponse.json({ error: "Payment webhook belum dikonfigurasi." }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-kastriva-signature") || "";
  if (!verifySignature(raw, signature, secret)) return NextResponse.json({ error: "Signature pembayaran tidak valid." }, { status: 401 });

  try {
    const event = validate(JSON.parse(raw));
    if (!event) return NextResponse.json({ error: "Payload pembayaran tidak valid." }, { status: 400 });
    const result = await applyPaymentEvent(event);
    await writeAdminAudit({
      actorUid: "payment-webhook",
      actorEmail: null,
      action: `payment.${event.status}`,
      targetType: "payment",
      targetId: event.transactionId,
      details: { provider: event.provider, plan: event.plan, email: event.email, entitlementApplied: result.entitlementApplied },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Payment webhook failed", error);
    return NextResponse.json({ error: "Webhook pembayaran gagal diproses." }, { status: 500 });
  }
}
