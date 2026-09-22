import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { requireAdmin } from "@/lib/adminAuth";
import { getAdminAuth, getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dateKey(date = new Date()) { return date.toISOString().slice(0, 10); }
function iso(value: unknown) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

async function readRenderWorkerHealth() {
  const base = String(process.env.RENDER_WORKER_URL || "").trim().replace(/\/+$/, "");
  if (!base) return { configured: false, ok: false, mode: "none", error: null as string | null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${base}/health`, { cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    return { configured: true, ok: response.ok && payload.ok !== false, ...payload, error: response.ok ? null : String(payload.error || `HTTP ${response.status}`) };
  } catch (error) {
    return { configured: true, ok: false, mode: "unknown", error: error instanceof Error ? error.message : "Worker tidak dapat dihubungi" };
  } finally { clearTimeout(timeout); }
}

function resolvedPlan(profile: Record<string, unknown>) {
  const stored = String(profile.plan || "trial");
  const now = Date.now();
  const trial = profile.trialEndsAt instanceof Timestamp ? profile.trialEndsAt.toMillis() : 0;
  const expires = profile.licenseExpiresAt instanceof Timestamp ? profile.licenseExpiresAt.toMillis() : 0;
  if (stored === "lifetime") return "lifetime";
  if (stored === "pro" && (!expires || expires > now)) return "pro";
  if (trial > now) return "trial";
  return "expired";
}

export async function GET(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi." }, { status: 503 });
  try {
    await requireAdmin(request);
    const auth = getAdminAuth();
    const db = getAdminDb();
    const listed = await auth.listUsers(100);
    const uids = listed.users.map((item) => item.uid);
    const profileRefs = uids.map((uid) => db.collection("clipperUsers").doc(uid));
    const usageRefs = uids.map((uid) => db.collection("clipperUsers").doc(uid).collection("usage").doc(dateKey()));
    const [profileSnaps, usageSnaps, licenseSnap, analyticsSnap, auditSnap, paymentsSnap, renderWorker] = await Promise.all([
      profileRefs.length ? db.getAll(...profileRefs) : Promise.resolve([]),
      usageRefs.length ? db.getAll(...usageRefs) : Promise.resolve([]),
      db.collection("clipperLicenses").orderBy("updatedAt", "desc").limit(100).get(),
      db.collection("clipperAnalytics").orderBy("createdAt", "desc").limit(250).get(),
      db.collection("clipperAuditLogs").orderBy("createdAt", "desc").limit(40).get(),
      db.collection("clipperPayments").orderBy("updatedAt", "desc").limit(50).get(),
      readRenderWorkerHealth(),
    ]);
    const profileMap = new Map(profileSnaps.map((snap) => [snap.id, snap.data() || {}]));
    const usageMap = new Map(usageSnaps.map((snap) => [snap.ref.parent.parent?.id || "", Number(snap.data()?.count || 0)]));
    const users = listed.users.map((authUser) => {
      const profile = profileMap.get(authUser.uid) || {};
      return {
        uid: authUser.uid,
        email: authUser.email || null,
        emailVerified: authUser.emailVerified,
        disabled: authUser.disabled,
        plan: resolvedPlan(profile),
        trialEndsAt: iso(profile.trialEndsAt),
        licenseExpiresAt: iso(profile.licenseExpiresAt),
        licenseId: profile.licenseId || null,
        usageToday: usageMap.get(authUser.uid) || 0,
        createdAt: authUser.metadata.creationTime || null,
        lastSignInAt: authUser.metadata.lastSignInTime || null,
      };
    });
    const licenses = licenseSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        plan: data.plan || "pro",
        boundEmail: data.boundEmail || null,
        activatedBy: data.activatedBy || null,
        activatedEmail: data.activatedEmail || null,
        expiresAt: iso(data.expiresAt),
        issuedAt: iso(data.issuedAt),
        activatedAt: iso(data.activatedAt),
      };
    });
    const counts = users.reduce((acc, user) => {
      acc[user.plan] = (acc[user.plan] || 0) + 1;
      acc.aiJobsToday += user.usageToday;
      return acc;
    }, { trial: 0, pro: 0, lifetime: 0, expired: 0, aiJobsToday: 0 } as Record<string, number>);

    const analyticsCounts = { renderSuccess: 0, renderError: 0, transcribeError: 0, cloudSyncSuccess: 0, cloudSyncError: 0 };
    const analytics = analyticsSnap.docs.map((doc) => {
      const data = doc.data();
      const event = String(data.event || "");
      if (event === "render_success") analyticsCounts.renderSuccess += 1;
      else if (event === "render_error") analyticsCounts.renderError += 1;
      else if (event === "transcribe_error") analyticsCounts.transcribeError += 1;
      else if (event === "cloud_sync_success") analyticsCounts.cloudSyncSuccess += 1;
      else if (event === "cloud_sync_error") analyticsCounts.cloudSyncError += 1;
      return { id: doc.id, uid: data.uid || null, event, data: data.data || {}, createdAt: iso(data.createdAt) };
    });
    const audits = auditSnap.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, actorEmail: data.actorEmail || null, actorUid: data.actorUid || null, action: data.action || "", targetType: data.targetType || "", targetId: data.targetId || null, details: data.details || {}, createdAt: iso(data.createdAt) };
    });
    const payments = paymentsSnap.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, provider: data.provider || "", status: data.status || "", email: data.email || "", plan: data.plan || "", amount: data.amount ?? null, currency: data.currency || null, entitlementApplied: Boolean(data.entitlementApplied), entitlementError: data.entitlementError || null, updatedAt: iso(data.updatedAt) };
    });

    return NextResponse.json({
      summary: { totalUsers: users.length, ...counts, licenses: licenses.length, activatedLicenses: licenses.filter((item) => item.activatedBy).length, ...analyticsCounts, payments: payments.length },
      users,
      licenses,
      analytics,
      audits,
      payments,
      renderWorker,
      truncated: listed.pageToken ? true : false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) return NextResponse.json({ error: code === "EMAIL_NOT_VERIFIED" ? "Verifikasi email admin terlebih dahulu." : "Login diperlukan." }, { status: 401 });
    if (code === "ADMIN_REQUIRED") return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    console.error("Admin dashboard error", error);
    return NextResponse.json({ error: "Gagal membaca dashboard admin." }, { status: 500 });
  }
}
