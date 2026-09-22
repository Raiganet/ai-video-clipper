import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";

export type PaymentPlan = "pro" | "lifetime";
export type PaymentStatus = "pending" | "paid" | "failed" | "expired" | "refunded";

export interface CanonicalPaymentEvent {
  transactionId: string;
  provider: string;
  status: PaymentStatus;
  email: string;
  plan: PaymentPlan;
  days?: number | null;
  amount?: number | null;
  currency?: string | null;
}

export async function applyPaymentEvent(event: CanonicalPaymentEvent) {
  const db = getAdminDb();
  const paymentRef = db.collection("clipperPayments").doc(event.transactionId);
  const current = await paymentRef.get();
  if (current.exists && current.data()?.status === "paid" && event.status === "paid") {
    return { idempotent: true, entitlementApplied: Boolean(current.data()?.entitlementApplied), uid: current.data()?.uid || null };
  }

  const email = event.email.trim().toLowerCase();
  let uid: string | null = typeof current.data()?.uid === "string" ? current.data()!.uid : null;
  let entitlementApplied = Boolean(current.data()?.entitlementApplied);
  let entitlementError: string | null = typeof current.data()?.entitlementError === "string" ? current.data()!.entitlementError : null;

  if (event.status === "paid") {
    try {
      const authUser = await getAdminAuth().getUserByEmail(email);
      uid = authUser.uid;
      const userRef = db.collection("clipperUsers").doc(uid);
      const userSnap = await userRef.get();
      const currentProfile = userSnap.data() || {};
      const currentPlan = String(currentProfile.plan || "trial");
      const currentExpiry = currentProfile.licenseExpiresAt instanceof Timestamp ? currentProfile.licenseExpiresAt.toMillis() : 0;
      const patch: Record<string, unknown> = {
        email,
        paymentTransactionId: event.transactionId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (event.plan === "lifetime") {
        patch.plan = "lifetime";
        patch.licenseExpiresAt = null;
      } else if (currentPlan === "lifetime") {
        // Never downgrade a lifetime account because a later Pro invoice was paid.
        patch.plan = "lifetime";
      } else {
        const days = Math.max(1, Math.min(3650, Number(event.days || 30)));
        const base = Math.max(Date.now(), currentExpiry || 0);
        patch.plan = "pro";
        patch.licenseExpiresAt = Timestamp.fromMillis(base + days * 24 * 60 * 60 * 1000);
      }
      await userRef.set(patch, { merge: true });
      entitlementApplied = true;
    } catch (error) {
      const code = (error as { code?: string })?.code || "";
      if (code.includes("user-not-found")) entitlementError = "USER_NOT_FOUND";
      else throw error;
    }
  }

  await paymentRef.set({
    ...event,
    email,
    uid,
    entitlementApplied,
    entitlementError,
    updatedAt: FieldValue.serverTimestamp(),
    ...(current.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  return { idempotent: false, entitlementApplied, uid, entitlementError };
}
