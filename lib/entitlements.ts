import type { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import type { AccountPlan, AccountState } from "@/lib/accountTypes";

const TRIAL_DAYS = 7;
const PLAN_LIMITS: Record<Exclude<AccountPlan, "expired">, number> = {
  trial: 5,
  pro: 100,
  lifetime: 250,
};

function authHeader(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function asMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

export async function verifyRequestUser(
  request: NextRequest,
  options: { requireVerified?: boolean } = {}
) {
  if (!isFirebaseAdminConfigured()) return null;
  const token = authHeader(request);
  if (!token) throw new Error("AUTH_REQUIRED");
  try {
    const user = await getAdminAuth().verifyIdToken(token, true);
    if (options.requireVerified && user.email && !user.email_verified) {
      throw new Error("EMAIL_NOT_VERIFIED");
    }
    return user;
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_NOT_VERIFIED") throw error;
    throw new Error("AUTH_INVALID");
  }
}

async function ensureProfile(uid: string, email: string | null) {
  const db = getAdminDb();
  const ref = db.collection("clipperUsers").doc(uid);
  const snap = await ref.get();
  if (snap.exists) return snap.data() || {};

  const now = Date.now();
  const trialEndsAt = now + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const profile = {
    email,
    createdAt: FieldValue.serverTimestamp(),
    trialStartedAt: Timestamp.fromMillis(now),
    trialEndsAt: Timestamp.fromMillis(trialEndsAt),
    plan: "trial",
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(profile, { merge: true });
  const created = await ref.get();
  return created.data() || profile;
}

function resolvePlan(profile: Record<string, unknown>): { plan: AccountPlan; trialEndsMs: number | null; licenseEndsMs: number | null } {
  const now = Date.now();
  const storedPlan = String(profile.plan || "trial");
  const trialEndsMs = asMillis(profile.trialEndsAt);
  const licenseEndsMs = asMillis(profile.licenseExpiresAt);

  if (storedPlan === "lifetime") return { plan: "lifetime", trialEndsMs, licenseEndsMs };
  if (storedPlan === "pro" && (!licenseEndsMs || licenseEndsMs > now)) return { plan: "pro", trialEndsMs, licenseEndsMs };
  if (trialEndsMs && trialEndsMs > now) return { plan: "trial", trialEndsMs, licenseEndsMs };
  return { plan: "expired", trialEndsMs, licenseEndsMs };
}

export async function getAccountState(uid: string, email: string | null): Promise<AccountState> {
  const db = getAdminDb();
  const profile = await ensureProfile(uid, email);
  const resolved = resolvePlan(profile);
  const limit = resolved.plan === "expired" ? 0 : PLAN_LIMITS[resolved.plan];
  const usageSnap = await db.collection("clipperUsers").doc(uid).collection("usage").doc(dateKey()).get();
  const used = Number(usageSnap.data()?.count || 0);

  return {
    uid,
    email,
    plan: resolved.plan,
    planLabel: resolved.plan === "trial" ? "Trial 7 Hari" : resolved.plan === "pro" ? "Pro" : resolved.plan === "lifetime" ? "Lifetime" : "Trial Berakhir",
    trialEndsAt: resolved.trialEndsMs ? new Date(resolved.trialEndsMs).toISOString() : null,
    licenseExpiresAt: resolved.licenseEndsMs ? new Date(resolved.licenseEndsMs).toISOString() : null,
    dailyUsed: used,
    dailyLimit: limit,
    remaining: Math.max(0, limit - used),
  };
}

export async function consumeAiJob(uid: string, email: string | null, jobId: string) {
  const db = getAdminDb();
  const profile = await ensureProfile(uid, email);
  const resolved = resolvePlan(profile);
  if (resolved.plan === "expired") {
    throw new Error("TRIAL_EXPIRED");
  }

  const limit = PLAN_LIMITS[resolved.plan];
  const usageRef = db.collection("clipperUsers").doc(uid).collection("usage").doc(dateKey());

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const data = snap.data() || {};
    const count = Number(data.count || 0);
    const jobs = Array.isArray(data.jobs) ? data.jobs.filter((item): item is string => typeof item === "string") : [];
    if (jobs.includes(jobId)) return;
    if (count >= limit) throw new Error("QUOTA_EXCEEDED");
    const nextJobs = [...jobs.slice(-299), jobId];
    tx.set(usageRef, {
      date: dateKey(),
      count: count + 1,
      jobs: nextJobs,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export function firebaseAccessIsEnabled() {
  return isFirebaseAdminConfigured();
}
