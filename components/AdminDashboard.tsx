"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowLeft, Check, Clipboard, KeyRound, Loader2, RefreshCw, ShieldCheck, Users, WandSparkles } from "lucide-react";
import { getFirebaseAuth, getFirebaseIdToken, isFirebaseClientConfigured } from "@/lib/firebaseClient";

type AdminUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  plan: "trial" | "pro" | "lifetime" | "expired";
  trialEndsAt: string | null;
  licenseExpiresAt: string | null;
  licenseId: string | null;
  usageToday: number;
  createdAt: string | null;
  lastSignInAt: string | null;
};
type AdminLicense = {
  id: string;
  plan: string;
  boundEmail: string | null;
  activatedBy: string | null;
  activatedEmail: string | null;
  expiresAt: string | null;
  issuedAt: string | null;
  activatedAt: string | null;
};
type AnalyticsRow = { id: string; uid: string | null; event: string; data: Record<string, unknown>; createdAt: string | null };
type AuditRow = { id: string; actorEmail: string | null; actorUid: string | null; action: string; targetType: string; targetId: string | null; details: Record<string, unknown>; createdAt: string | null };
type PaymentRow = { id: string; provider: string; status: string; email: string; plan: string; amount: number | null; currency: string | null; entitlementApplied: boolean; entitlementError: string | null; updatedAt: string | null };
type DashboardPayload = {
  summary: { totalUsers: number; trial: number; pro: number; lifetime: number; expired: number; aiJobsToday: number; licenses: number; activatedLicenses: number; renderSuccess: number; renderError: number; transcribeError: number; cloudSyncSuccess: number; cloudSyncError: number; payments: number };
  users: AdminUser[];
  licenses: AdminLicense[];
  analytics: AnalyticsRow[];
  audits: AuditRow[];
  payments: PaymentRow[];
  renderWorker?: { configured?: boolean; ok?: boolean; mode?: string; storage?: string; activeRenders?: number; queued?: number; jobs?: number; maxConcurrent?: number; counts?: Record<string, number>; error?: string | null };
  truncated?: boolean;
};

function compactDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function planLimit(plan: AdminUser["plan"]) {
  return plan === "trial" ? 5 : plan === "pro" ? 100 : plan === "lifetime" ? 250 : 0;
}

function planClass(plan: AdminUser["plan"]) {
  if (plan === "lifetime") return "text-violet-300 bg-violet-500/10 border-violet-500/20";
  if (plan === "pro") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (plan === "trial") return "text-sky-300 bg-sky-500/10 border-sky-500/20";
  return "text-zinc-400 bg-zinc-800 border-zinc-700";
}

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<"pro" | "lifetime">("pro");
  const [days, setDays] = useState(365);
  const [licenseEmail, setLicenseEmail] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [copied, setCopied] = useState(false);

  const authedFetch = useCallback(async (path: string, init?: RequestInit) => {
    const token = await getFirebaseIdToken(true);
    if (!token) throw new Error("Login terlebih dahulu dari menu Akun.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(path, { ...init, headers, cache: "no-store" });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(String(payload.error || "Permintaan admin gagal."));
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const payload = await authedFetch("/api/admin/dashboard") as unknown as DashboardPayload;
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Gagal membuka dashboard admin.");
    } finally { setLoading(false); }
  }, [authedFetch]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) { setLoading(false); setError("Firebase client belum dikonfigurasi."); return; }
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (next) void load(); else { setLoading(false); setData(null); }
    });
  }, [load]);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return data?.users || [];
    return (data?.users || []).filter((item) => `${item.email || ""} ${item.uid} ${item.plan}`.toLowerCase().includes(keyword));
  }, [data?.users, query]);

  const generateLicense = async () => {
    setActionBusy("license"); setError(""); setGeneratedCode("");
    try {
      const payload = await authedFetch("/api/admin/licenses", { method: "POST", body: JSON.stringify({ plan, days: plan === "pro" ? days : null, email: licenseEmail.trim() || null }) });
      setGeneratedCode(String(payload.code || ""));
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal membuat lisensi."); }
    finally { setActionBusy(""); }
  };

  const resetQuota = async (uid: string) => {
    if (!window.confirm("Reset pemakaian AI user ini menjadi 0 untuk hari ini?")) return;
    setActionBusy(uid); setError("");
    try {
      await authedFetch("/api/admin/quota", { method: "POST", body: JSON.stringify({ uid, action: "reset" }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Reset quota gagal."); }
    finally { setActionBusy(""); }
  };

  const reconcilePayment = async (orderId: string) => {
    setActionBusy(`pay:${orderId}`); setError("");
    try {
      await authedFetch("/api/admin/payments/reconcile", { method: "POST", body: JSON.stringify({ orderId }) });
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Rekonsiliasi pembayaran gagal."); }
    finally { setActionBusy(""); }
  };

  if (!isFirebaseClientConfigured) {
    return <main className="min-h-screen bg-black text-white p-6"><div className="max-w-xl mx-auto mt-20 rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">Firebase client belum dikonfigurasi.</div></main>;
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-black/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/" className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800" title="Kembali"><ArrowLeft className="w-4 h-4" /></a>
          <div><div className="font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-400" /> Dashboard Admin</div><div className="text-[11px] text-zinc-500">Pelanggan, lisensi, quota, analytics, audit, dan pembayaran</div></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="ml-auto px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-sm flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {!user && !loading && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">Login menggunakan akun admin dari halaman utama terlebih dahulu.</div>}
        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        {loading && <div className="py-24 flex items-center justify-center gap-3 text-zinc-400"><Loader2 className="w-5 h-5 animate-spin" /> Membaca data admin...</div>}

        {data && !loading && (
          <>
            <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              {[
                ["User", data.summary.totalUsers], ["Trial", data.summary.trial], ["Pro", data.summary.pro], ["Lifetime", data.summary.lifetime],
                ["AI Hari Ini", data.summary.aiJobsToday], ["Render OK", data.summary.renderSuccess], ["Render Error", data.summary.renderError], ["Pembayaran", data.summary.payments],
              ].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="text-xs text-zinc-500">{label}</div><div className="text-2xl font-bold mt-1">{value}</div></div>)}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex items-center gap-2 font-bold mb-4"><KeyRound className="w-5 h-5 text-emerald-400" /> Generator Lisensi</div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select value={plan} onChange={(e) => setPlan(e.target.value as "pro" | "lifetime")} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 text-sm"><option value="pro">Pro</option><option value="lifetime">Lifetime</option></select>
                <input disabled={plan === "lifetime"} type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 text-sm disabled:opacity-40" placeholder="Hari" />
                <input type="email" value={licenseEmail} onChange={(e) => setLicenseEmail(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 text-sm" placeholder="Email pelanggan (opsional)" />
                <button type="button" disabled={actionBusy === "license"} onClick={generateLicense} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2"><WandSparkles className="w-4 h-4" /> Buat Lisensi</button>
              </div>
              {generatedCode && <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3"><div className="text-xs text-emerald-300 mb-2">Kode lisensi baru — simpan/kirim ke pelanggan:</div><div className="flex gap-2"><textarea readOnly value={generatedCode} rows={3} className="flex-1 resize-none bg-black border border-zinc-800 rounded-lg p-3 text-xs font-mono" /><button type="button" onClick={async () => { await navigator.clipboard.writeText(generatedCode); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }} className="self-stretch px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700">{copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}</button></div></div>}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
              <div className="p-5 border-b border-zinc-800 flex flex-wrap items-center gap-3"><div className="font-bold flex items-center gap-2"><Users className="w-5 h-5 text-emerald-400" /> Pelanggan</div><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari email / UID / plan" className="ml-auto w-full sm:w-72 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" /></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="text-left text-xs text-zinc-500 bg-zinc-900/60"><tr><th className="p-3">Pelanggan</th><th className="p-3">Status</th><th className="p-3">Plan</th><th className="p-3">AI hari ini</th><th className="p-3">Trial/Lisensi</th><th className="p-3">Login terakhir</th><th className="p-3">Aksi</th></tr></thead><tbody>{filteredUsers.map((item) => <tr key={item.uid} className="border-t border-zinc-900"><td className="p-3"><div>{item.email || "Tanpa email"}</div><div className="text-[11px] text-zinc-600 font-mono">{item.uid.slice(0, 16)}…</div></td><td className="p-3"><span className={item.emailVerified ? "text-emerald-400" : "text-amber-300"}>{item.emailVerified ? "Verified" : "Belum verifikasi"}</span>{item.disabled && <div className="text-red-400 text-xs">Disabled</div>}</td><td className="p-3"><span className={`inline-flex border rounded-full px-2.5 py-1 text-xs ${planClass(item.plan)}`}>{item.plan}</span></td><td className="p-3 font-semibold">{item.usageToday}/{planLimit(item.plan)}</td><td className="p-3 text-xs text-zinc-400">{item.plan === "trial" ? compactDate(item.trialEndsAt) : compactDate(item.licenseExpiresAt)}</td><td className="p-3 text-xs text-zinc-400">{compactDate(item.lastSignInAt)}</td><td className="p-3"><button type="button" disabled={actionBusy === item.uid} onClick={() => void resetQuota(item.uid)} className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs disabled:opacity-50">{actionBusy === item.uid ? "Reset..." : "Reset quota"}</button></td></tr>)}</tbody></table></div>
              {data.truncated && <div className="p-3 text-xs text-amber-300 border-t border-zinc-800">Menampilkan maksimal 100 akun. Pagination dapat ditambahkan saat jumlah pelanggan bertambah.</div>}
            </section>



            <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="p-4 border-b border-zinc-800 font-bold">Analytics Terbaru</div>
                <div className="max-h-80 overflow-y-auto divide-y divide-zinc-900">
                  {data.analytics.slice(0, 20).map((item) => <div key={item.id} className="p-3 text-xs"><div className="flex justify-between gap-2"><span className={item.event.includes("error") ? "text-red-300" : "text-emerald-300"}>{item.event}</span><span className="text-zinc-600">{compactDate(item.createdAt)}</span></div><div className="text-zinc-500 mt-1 font-mono truncate">{item.uid || "—"}</div></div>)}
                  {data.analytics.length === 0 && <div className="p-6 text-sm text-zinc-500">Belum ada event analytics.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="p-4 border-b border-zinc-800 font-bold">Audit Admin</div>
                <div className="max-h-80 overflow-y-auto divide-y divide-zinc-900">
                  {data.audits.slice(0, 20).map((item) => <div key={item.id} className="p-3 text-xs"><div className="flex justify-between gap-2"><span className="text-sky-300">{item.action}</span><span className="text-zinc-600">{compactDate(item.createdAt)}</span></div><div className="text-zinc-500 mt-1 truncate">{item.actorEmail || item.actorUid || "system"} → {item.targetType}{item.targetId ? `/${item.targetId.slice(0, 18)}` : ""}</div></div>)}
                  {data.audits.length === 0 && <div className="p-6 text-sm text-zinc-500">Belum ada audit log.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
                <div className="p-4 border-b border-zinc-800 font-bold">Pembayaran / Entitlement</div>
                <div className="max-h-80 overflow-y-auto divide-y divide-zinc-900">
                  {data.payments.slice(0, 20).map((item) => <div key={item.id} className="p-3 text-xs"><div className="flex justify-between gap-2"><span className={item.status === "paid" ? "text-emerald-300" : "text-zinc-300"}>{item.provider} • {item.status}</span><span className="text-zinc-600">{compactDate(item.updatedAt)}</span></div><div className="text-zinc-500 mt-1 truncate">{item.email} • {item.plan}{item.amount != null ? ` • ${item.currency || ""} ${item.amount}` : ""}</div><div className={item.entitlementApplied ? "text-emerald-400 mt-1" : "text-amber-300 mt-1"}>{item.entitlementApplied ? "Entitlement aktif" : item.entitlementError || "Belum diterapkan"}</div>{item.provider === "midtrans" && <button type="button" disabled={actionBusy === `pay:${item.id}`} onClick={() => void reconcilePayment(item.id)} className="mt-2 px-2.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-[11px] flex items-center gap-1.5">{actionBusy === `pay:${item.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Cek status Midtrans</button>}</div>)}
                  {data.payments.length === 0 && <div className="p-6 text-sm text-zinc-500">Belum ada transaksi webhook.</div>}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div><div className="font-bold">Render Infrastructure</div><div className="text-xs text-zinc-500 mt-1">Health worker, queue, dan mode deployment.</div></div>
                <button type="button" onClick={() => void load()} className="ml-auto px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm">
                <div className="rounded-lg bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Status</div><div className={data.renderWorker?.ok ? "text-emerald-400 font-semibold mt-1" : "text-red-300 font-semibold mt-1"}>{!data.renderWorker?.configured ? "Belum dikonfigurasi" : data.renderWorker?.ok ? "Online" : "Offline"}</div></div>
                <div className="rounded-lg bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Mode</div><div className="font-semibold mt-1">{data.renderWorker?.mode || "local"}</div></div>
                <div className="rounded-lg bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Active</div><div className="font-semibold mt-1">{data.renderWorker?.counts?.active ?? data.renderWorker?.activeRenders ?? 0}</div></div>
                <div className="rounded-lg bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Queued</div><div className="font-semibold mt-1">{data.renderWorker?.counts?.waiting ?? data.renderWorker?.queued ?? 0}</div></div>
                <div className="rounded-lg bg-zinc-900 p-3"><div className="text-xs text-zinc-500">Storage</div><div className="font-semibold mt-1">{data.renderWorker?.storage || (data.renderWorker?.mode === "bullmq" ? "S3/R2" : "temp local")}</div></div>
              </div>
              {data.renderWorker?.error && <div className="mt-3 text-xs text-red-300">{data.renderWorker.error}</div>}
            </section>

            <section className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
              <div className="p-5 border-b border-zinc-800 font-bold">Lisensi Terbit</div>
              <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead className="text-left text-xs text-zinc-500 bg-zinc-900/60"><tr><th className="p-3">ID</th><th className="p-3">Plan</th><th className="p-3">Untuk</th><th className="p-3">Status</th><th className="p-3">Expired</th></tr></thead><tbody>{data.licenses.map((item) => <tr key={item.id} className="border-t border-zinc-900"><td className="p-3 font-mono text-xs">{item.id.slice(0, 16)}…</td><td className="p-3 capitalize">{item.plan}</td><td className="p-3 text-zinc-400">{item.boundEmail || "Semua email"}</td><td className="p-3">{item.activatedBy ? <span className="text-emerald-400">Aktif • {item.activatedEmail || "user"}</span> : <span className="text-amber-300">Belum digunakan</span>}</td><td className="p-3 text-xs text-zinc-400">{compactDate(item.expiresAt)}</td></tr>)}</tbody></table></div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
