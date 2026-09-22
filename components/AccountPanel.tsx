"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { CheckCircle2, ExternalLink, KeyRound, Loader2, LogIn, LogOut, MailCheck, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { getFirebaseAuth, getFirebaseIdToken, isFirebaseClientConfigured } from "@/lib/firebaseClient";
import type { AccountState } from "@/lib/accountTypes";

interface Props {
  open: boolean;
  onClose: () => void;
  onAuthChanged?: (user: User | null) => void;
}

interface PaymentConfig {
  configured: boolean;
  environment: "sandbox" | "production";
  plans: {
    pro: { amount: number; days: number | null; currency: string } | null;
    lifetime: { amount: number; days: number | null; currency: string } | null;
  };
}

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function daysLeft(iso: string | null) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function authMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "Proses akun gagal.";
  if (raw.includes("auth/invalid-credential")) return "Email atau password salah.";
  if (raw.includes("auth/email-already-in-use")) return "Email sudah terdaftar. Silakan login.";
  if (raw.includes("auth/weak-password")) return "Password terlalu lemah. Gunakan minimal 6 karakter.";
  if (raw.includes("auth/too-many-requests")) return "Terlalu banyak percobaan. Coba lagi beberapa saat.";
  return raw;
}

export default function AccountPanel({ open, onClose, onAuthChanged }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);

  const refreshAccount = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth?.currentUser) await reload(auth.currentUser);
    const token = await getFirebaseIdToken(true);
    if (!token) { setAccount(null); return; }
    const response = await fetch("/api/account", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json() as { account?: AccountState; error?: string };
    if (!response.ok || !payload.account) throw new Error(payload.error || "Gagal membaca akun.");
    setUser(auth?.currentUser || null);
    setAccount(payload.account);
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      onAuthChanged?.(next);
      if (next) void refreshAccount().catch((error) => setMessage(authMessage(error)));
      else setAccount(null);
    });
  }, [onAuthChanged, refreshAccount]);

  useEffect(() => {
    if (open && user) void refreshAccount().catch(() => undefined);
  }, [open, user, refreshAccount]);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/payments/midtrans/checkout", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setPaymentConfig(payload as PaymentConfig))
      .catch(() => setPaymentConfig(null));
  }, [open]);

  const trialDays = useMemo(() => daysLeft(account?.trialEndsAt || null), [account?.trialEndsAt]);
  if (!open) return null;

  const submitAuth = async () => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    setBusy(true);
    setMessage("");
    try {
      if (!email.trim() || password.length < 6) throw new Error("Email wajib diisi dan password minimal 6 karakter.");
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(credential.user);
        setMessage("Akun dibuat. Link verifikasi sudah dikirim ke email. Trial 7 hari aktif setelah login.");
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        setMessage("Login berhasil.");
      }
      await refreshAccount();
      setPassword("");
    } catch (error) {
      setMessage(authMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const auth = getFirebaseAuth();
    setMessage("");
    if (!auth || !email.trim()) { setMessage("Masukkan email akun terlebih dahulu."); return; }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Link reset password sudah dikirim. Periksa Inbox/Spam email kamu.");
    } catch (error) {
      setMessage(authMessage(error));
    } finally { setBusy(false); }
  };

  const resendVerification = async () => {
    const auth = getFirebaseAuth();
    if (!auth?.currentUser) return;
    setBusy(true); setMessage("");
    try {
      await sendEmailVerification(auth.currentUser);
      setMessage("Email verifikasi dikirim ulang. Setelah klik link, tekan 'Cek status verifikasi'.");
    } catch (error) { setMessage(authMessage(error)); }
    finally { setBusy(false); }
  };

  const activateLicense = async () => {
    setBusy(true); setMessage("");
    try {
      const token = await getFirebaseIdToken(true);
      if (!token) throw new Error("Login terlebih dahulu.");
      const response = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: license.trim() }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Aktivasi lisensi gagal.");
      await refreshAccount();
      setLicense("");
      setMessage("Lisensi berhasil diaktifkan.");
    } catch (error) { setMessage(authMessage(error)); }
    finally { setBusy(false); }
  };

  const startPayment = async (plan: "pro" | "lifetime") => {
    if (!user?.emailVerified) { setMessage("Verifikasi email sebelum melakukan pembayaran."); return; }
    const paymentWindow = window.open("about:blank", "_blank");
    setBusy(true); setMessage("");
    try {
      const token = await getFirebaseIdToken(true);
      if (!token) throw new Error("Login terlebih dahulu.");
      const response = await fetch("/api/payments/midtrans/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      const payload = await response.json() as { redirectUrl?: string; orderId?: string; error?: string };
      if (!response.ok || !payload.redirectUrl) throw new Error(payload.error || "Checkout Midtrans gagal dibuat.");
      if (paymentWindow) {
        paymentWindow.opener = null;
        paymentWindow.location.href = payload.redirectUrl;
      } else {
        window.location.href = payload.redirectUrl;
      }
      setMessage(`Checkout ${plan === "pro" ? "Pro" : "Lifetime"} dibuka. Setelah pembayaran terkonfirmasi, tekan Cek status akun.`);
    } catch (error) {
      paymentWindow?.close();
      setMessage(authMessage(error));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end" onMouseDown={onClose}>
      <aside className="w-full max-w-md h-full bg-zinc-950 border-l border-zinc-800 p-5 overflow-y-auto" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2"><UserRound className="w-5 h-5 text-emerald-400" /> Akun & Lisensi</h2>
            <p className="text-xs text-zinc-500 mt-1">Trial, quota AI, keamanan email, dan lisensi.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800"><X className="w-4 h-4" /></button>
        </div>

        {!isFirebaseClientConfigured ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">Firebase client belum dikonfigurasi. Isi environment `NEXT_PUBLIC_FIREBASE_*` agar login/trial/lisensi aktif. Clipping lokal tetap dapat digunakan.</div>
        ) : !user ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 bg-zinc-900 rounded-lg p-1">
              <button type="button" onClick={() => setMode("login")} className={`rounded-md py-2 text-sm ${mode === "login" ? "bg-emerald-600" : "text-zinc-400"}`}>Login</button>
              <button type="button" onClick={() => setMode("register")} className={`rounded-md py-2 text-sm ${mode === "register" ? "bg-emerald-600" : "text-zinc-400"}`}>Daftar</button>
            </div>
            <label className="block text-xs text-zinc-400">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 text-sm" placeholder="nama@email.com" /></label>
            <label className="block text-xs text-zinc-400">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-3 text-sm" placeholder="Minimal 6 karakter" /></label>
            <button type="button" disabled={busy} onClick={submitAuth} className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg py-3 font-semibold flex items-center justify-center gap-2">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />} {mode === "login" ? "Login" : "Daftar & Mulai Trial"}</button>
            {mode === "login" && <button type="button" disabled={busy} onClick={resetPassword} className="w-full text-sm text-emerald-400 hover:text-emerald-300">Lupa password? Kirim link reset</button>}
            <p className="text-xs text-zinc-600">Akun baru mendapat trial 7 hari. AI membutuhkan email yang sudah diverifikasi.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><div className="font-semibold truncate">{user.email}</div><div className="text-xs text-zinc-500">UID {user.uid.slice(0, 10)}…</div></div>
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div className={`mt-3 flex items-center gap-2 text-xs ${user.emailVerified ? "text-emerald-300" : "text-amber-300"}`}><MailCheck className="w-4 h-4" />{user.emailVerified ? "Email terverifikasi" : "Email belum diverifikasi"}</div>
              {!user.emailVerified && <div className="grid grid-cols-2 gap-2 mt-3"><button type="button" disabled={busy} onClick={resendVerification} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 py-2 text-xs">Kirim ulang</button><button type="button" disabled={busy} onClick={() => void refreshAccount().then(() => setMessage("Status verifikasi diperbarui.")).catch((error) => setMessage(authMessage(error)))} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 py-2 text-xs flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3" /> Cek status</button></div>}
            </div>

            {account && <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Paket</div><div className="font-bold mt-1">{account.planLabel}</div>{account.plan === "trial" && <div className="text-xs text-emerald-400 mt-1">{trialDays} hari tersisa</div>}</div><div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="text-xs text-zinc-500">Quota AI hari ini</div><div className="font-bold mt-1">{account.dailyUsed}/{account.dailyLimit}</div><div className="text-xs text-zinc-500 mt-1">Sisa {account.remaining}</div></div></div>}

            {!user.emailVerified && <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs text-amber-100">Verifikasi email diperlukan sebelum memakai AI atau mengaktifkan lisensi. Render lokal, editor, dan project tetap dapat digunakan.</div>}

            {paymentConfig?.configured && account?.plan !== "lifetime" && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Upgrade via Midtrans</div>
                <p className="text-xs text-zinc-500 mt-1">Checkout aman melalui halaman Midtrans • {paymentConfig.environment === "sandbox" ? "Sandbox/Test" : "Production"}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  {paymentConfig.plans.pro && <button type="button" disabled={busy || !user.emailVerified} onClick={() => void startPayment("pro")} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 p-3 text-left"><span className="block text-sm font-semibold">Pro {paymentConfig.plans.pro.days || 30} hari</span><span className="text-xs text-emerald-100">{rupiah(paymentConfig.plans.pro.amount)}</span></button>}
                  {paymentConfig.plans.lifetime && <button type="button" disabled={busy || !user.emailVerified} onClick={() => void startPayment("lifetime")} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 p-3 text-left"><span className="block text-sm font-semibold">Lifetime</span><span className="text-xs text-zinc-400">{rupiah(paymentConfig.plans.lifetime.amount)}</span></button>}
                </div>
                <button type="button" disabled={busy} onClick={() => void refreshAccount().then(() => setMessage("Status akun diperbarui.")).catch((error) => setMessage(authMessage(error)))} className="mt-3 w-full rounded-lg border border-zinc-700 hover:bg-zinc-800 py-2 text-xs flex items-center justify-center gap-1"><RefreshCw className="w-3 h-3" /> Cek status setelah pembayaran</button>
              </div>
            )}

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="font-semibold flex items-center gap-2 mb-3"><KeyRound className="w-4 h-4 text-emerald-400" /> Aktivasi Lisensi</div>
              <textarea value={license} onChange={(event) => setLicense(event.target.value)} rows={4} placeholder="KAS4...." className="w-full resize-none bg-black border border-zinc-800 rounded-lg p-3 text-xs font-mono" />
              <button type="button" disabled={busy || !license.trim() || !user.emailVerified} onClick={activateLicense} className="mt-3 w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> Aktifkan</button>
            </div>

            {account?.isAdmin && <a href="/admin" className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-lg py-3 text-sm flex items-center justify-center gap-2 font-semibold">Dashboard Admin <ExternalLink className="w-4 h-4" /></a>}
            <button type="button" onClick={async () => { const auth = getFirebaseAuth(); if (auth) await signOut(auth); }} className="w-full border border-zinc-800 hover:bg-zinc-900 rounded-lg py-3 text-sm flex items-center justify-center gap-2 text-zinc-300"><LogOut className="w-4 h-4" /> Logout</button>
          </div>
        )}

        {message && <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-300">{message}</div>}
      </aside>
    </div>
  );
}
