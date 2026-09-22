import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/entitlements";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import { writeAdminAudit } from "@/lib/serverAudit";
import type { PaymentPlan } from "@/lib/paymentEntitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MidtransPlanConfig = { plan: PaymentPlan; amount: number; days: number | null; label: string };

function envInt(name: string, fallback = 0) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

function planConfig(plan: PaymentPlan): MidtransPlanConfig | null {
  if (plan === "pro") {
    const amount = envInt("MIDTRANS_PRO_PRICE_IDR");
    if (amount < 1000) return null;
    return { plan, amount, days: Math.max(1, Math.min(3650, envInt("MIDTRANS_PRO_DAYS", 30))), label: "AI Clipper Pro" };
  }
  const amount = envInt("MIDTRANS_LIFETIME_PRICE_IDR");
  if (amount < 1000) return null;
  return { plan, amount, days: null, label: "AI Clipper Lifetime" };
}

function environment() {
  const production = String(process.env.MIDTRANS_IS_PRODUCTION || "false").toLowerCase() === "true";
  return {
    production,
    endpoint: production
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions",
  };
}

export async function GET() {
  const pro = planConfig("pro");
  const lifetime = planConfig("lifetime");
  const serverKey = String(process.env.MIDTRANS_SERVER_KEY || "");
  const env = environment();
  return NextResponse.json({
    configured: Boolean(serverKey && (pro || lifetime) && isFirebaseAdminConfigured()),
    environment: env.production ? "production" : "sandbox",
    plans: {
      pro: pro ? { amount: pro.amount, days: pro.days, currency: "IDR" } : null,
      lifetime: lifetime ? { amount: lifetime.amount, days: null, currency: "IDR" } : null,
    },
  });
}

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi." }, { status: 503 });
  const serverKey = String(process.env.MIDTRANS_SERVER_KEY || "").trim();
  if (!serverKey) return NextResponse.json({ error: "Midtrans belum dikonfigurasi." }, { status: 503 });

  try {
    const user = await verifyRequestUser(request, { requireVerified: true });
    if (!user?.email) throw new Error("AUTH_REQUIRED");
    const body = await request.json() as { plan?: string };
    const plan = String(body.plan || "").toLowerCase() as PaymentPlan;
    if (plan !== "pro" && plan !== "lifetime") return NextResponse.json({ error: "Paket tidak valid." }, { status: 400 });
    const config = planConfig(plan);
    if (!config) return NextResponse.json({ error: `Harga ${plan} belum dikonfigurasi.` }, { status: 503 });

    const orderId = `KVC-${Date.now().toString(36)}-${user.uid.slice(0, 8)}-${plan === "pro" ? "P" : "L"}`.slice(0, 50);
    const email = user.email.toLowerCase();
    const db = getAdminDb();
    const rateRef = db.collection("clipperPaymentCheckoutRate").doc(user.uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(rateRef);
      const lastAt = snap.data()?.lastAt;
      const lastMs = lastAt && typeof lastAt.toMillis === "function" ? lastAt.toMillis() : 0;
      if (Date.now() - lastMs < 15_000) throw new Error("PAYMENT_RATE_LIMIT");
      tx.set(rateRef, { lastAt: FieldValue.serverTimestamp(), email }, { merge: true });
    });
    const paymentRef = db.collection("clipperPayments").doc(orderId);
    await paymentRef.set({
      transactionId: orderId,
      provider: "midtrans",
      status: "pending",
      email,
      uid: user.uid,
      plan,
      days: config.days,
      amount: config.amount,
      currency: "IDR",
      entitlementApplied: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const env = environment();
    const response = await fetch(env.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        transaction_details: { order_id: orderId, gross_amount: config.amount },
        item_details: [{ id: plan, price: config.amount, quantity: 1, name: config.label }],
        customer_details: { email },
      }),
      cache: "no-store",
    });
    const payload = await response.json() as { token?: string; redirect_url?: string; error_messages?: string[]; status_message?: string };
    if (!response.ok || !payload.token || !payload.redirect_url) {
      await paymentRef.set({ status: "failed", midtransCreateError: payload.error_messages?.join("; ") || payload.status_message || `HTTP ${response.status}`, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ error: "Midtrans gagal membuat transaksi." }, { status: 502 });
    }

    await paymentRef.set({ snapToken: payload.token, redirectUrl: payload.redirect_url, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAdminAudit({
      actorUid: user.uid,
      actorEmail: email,
      action: "payment.midtrans_checkout_created",
      targetType: "payment",
      targetId: orderId,
      details: { plan, amount: config.amount, environment: env.production ? "production" : "sandbox" },
    });
    return NextResponse.json({ success: true, orderId, redirectUrl: payload.redirect_url, plan, amount: config.amount, currency: "IDR" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) {
      return NextResponse.json({ error: code === "EMAIL_NOT_VERIFIED" ? "Verifikasi email sebelum membeli paket." : "Login diperlukan." }, { status: 401 });
    }
    if (code === "PAYMENT_RATE_LIMIT") return NextResponse.json({ error: "Tunggu beberapa detik sebelum membuat checkout baru." }, { status: 429 });
    console.error("Midtrans checkout failed", error);
    return NextResponse.json({ error: "Checkout Midtrans gagal dibuat." }, { status: 500 });
  }
}
