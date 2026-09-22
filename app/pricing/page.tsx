"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Check, Crown, Loader2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { getFirebaseAuth, getFirebaseIdToken, isFirebaseClientConfigured } from "@/lib/firebaseClient";
import type { AccountState } from "@/lib/accountTypes";

type PaymentConfig = {
  configured: boolean;
  environment: "sandbox" | "production";
  plans: {
    pro: { amount: number; days: number | null; currency: string } | null;
    lifetime: { amount: number; days: null; currency: string } | null;
  };
};

function rupiah(value: number) { return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value); }

export default function PricingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountState | null>(null);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [busy, setBusy] = useState<"pro" | "lifetime" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/payments/midtrans/checkout", { cache: "no-store" }).then((r) => r.json()).then(setConfig).catch(() => setMessage("Konfigurasi harga belum dapat dimuat."));
    if (!isFirebaseClientConfigured) return;
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (!next) { setAccount(null); return; }
      void getFirebaseIdToken(true).then(async (token) => {
        if (!token) return;
        const response = await fetch("/api/account", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { account?: AccountState };
          setAccount(payload.account || null);
        }
      }).catch(() => undefined);
    });
  }, []);

  const checkout = async (plan: "pro" | "lifetime") => {
    if (!user) { setMessage("Login dari halaman aplikasi terlebih dahulu sebelum membeli paket."); return; }
    if (!user.emailVerified) { setMessage("Verifikasi email terlebih dahulu sebelum checkout."); return; }
    const paymentWindow = window.open("about:blank", "_blank");
    setBusy(plan); setMessage("");
    try {
      const token = await getFirebaseIdToken(true);
      if (!token) throw new Error("Sesi login tidak tersedia.");
      const response = await fetch("/api/payments/midtrans/checkout", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ plan }) });
      const payload = await response.json() as { redirectUrl?: string; error?: string };
      if (!response.ok || !payload.redirectUrl) throw new Error(payload.error || "Checkout gagal dibuat.");
      if (paymentWindow) { paymentWindow.opener = null; paymentWindow.location.href = payload.redirectUrl; } else window.location.href = payload.redirectUrl;
      setMessage("Checkout Midtrans dibuka. Paket aktif otomatis setelah pembayaran terkonfirmasi.");
    } catch (error) { paymentWindow?.close(); setMessage(error instanceof Error ? error.message : "Checkout gagal."); }
    finally { setBusy(null); }
  };

  const pro = config?.plans.pro;
  const lifetime = config?.plans.lifetime;
  const features = ["AI timestamp + viral moment", "Caption karaoke word-level", "Smart / Dynamic framing", "Batch render & ZIP/Drive export", "Cloud draft sync", "Server render queue untuk video besar"];

  return (
    <main className="min-h-screen bg-black text-white px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-12"><Link href="/" className="flex items-center gap-2 font-bold text-xl"><span className="w-9 h-9 bg-emerald-600 rounded-xl grid place-items-center"><Sparkles className="w-5 h-5" /></span>AI Clipper</Link><Link href="/" className="text-sm bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 hover:bg-zinc-800">Kembali ke aplikasi</Link></div>
        <div className="text-center max-w-2xl mx-auto mb-10"><div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 text-xs mb-4"><ShieldCheck className="w-4 h-4" /> Harga ditentukan server • checkout Midtrans</div><h1 className="text-4xl md:text-5xl font-bold">Pilih paket yang sesuai</h1><p className="text-zinc-400 mt-4">Trial tetap tersedia. Upgrade menambah quota AI dan membuka masa akses sesuai paket tanpa mengubah project lokal kamu.</p></div>

        <div className="grid md:grid-cols-3 gap-5">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"><div className="text-zinc-400 text-sm">Trial</div><div className="text-3xl font-bold mt-2">Gratis</div><div className="text-xs text-zinc-500 mt-1">7 hari • quota terbatas</div><ul className="mt-6 space-y-3 text-sm text-zinc-300">{features.slice(0,4).map(x => <li key={x} className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" />{x}</li>)}</ul><Link href="/" className="mt-8 block text-center rounded-xl border border-zinc-700 py-3 hover:bg-zinc-900">Mulai trial</Link></section>

          <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 relative"><span className="absolute right-4 top-4 text-[10px] font-bold bg-emerald-500 text-black px-2 py-1 rounded-full">POPULER</span><div className="flex items-center gap-2 text-emerald-300 text-sm"><Zap className="w-4 h-4" />Pro</div><div className="text-3xl font-bold mt-2">{pro ? rupiah(pro.amount) : "Belum diset"}</div><div className="text-xs text-zinc-500 mt-1">{pro?.days || 30} hari</div><ul className="mt-6 space-y-3 text-sm text-zinc-300">{features.map(x => <li key={x} className="flex gap-2"><Check className="w-4 h-4 text-emerald-400 shrink-0" />{x}</li>)}</ul><button type="button" disabled={!config?.configured || !pro || busy !== null || account?.plan === "lifetime"} onClick={() => void checkout("pro")} className="mt-8 w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-600 py-3 font-semibold flex justify-center items-center gap-2">{busy === "pro" && <Loader2 className="w-4 h-4 animate-spin" />} {account?.plan === "lifetime" ? "Sudah Lifetime" : "Pilih Pro"}</button></section>

          <section className="rounded-2xl border border-zinc-700 bg-zinc-950 p-6"><div className="flex items-center gap-2 text-amber-300 text-sm"><Crown className="w-4 h-4" />Lifetime</div><div className="text-3xl font-bold mt-2">{lifetime ? rupiah(lifetime.amount) : "Belum diset"}</div><div className="text-xs text-zinc-500 mt-1">Sekali bayar • masa akses tanpa tanggal expiry</div><ul className="mt-6 space-y-3 text-sm text-zinc-300">{features.map(x => <li key={x} className="flex gap-2"><Check className="w-4 h-4 text-amber-400 shrink-0" />{x}</li>)}</ul><button type="button" disabled={!config?.configured || !lifetime || busy !== null || account?.plan === "lifetime"} onClick={() => void checkout("lifetime")} className="mt-8 w-full rounded-xl bg-zinc-100 text-black hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-600 py-3 font-semibold flex justify-center items-center gap-2">{busy === "lifetime" && <Loader2 className="w-4 h-4 animate-spin" />} {account?.plan === "lifetime" ? "Lifetime aktif" : "Pilih Lifetime"}</button></section>
        </div>
        <div className="mt-6 text-center text-xs text-zinc-500">{user ? `Login sebagai ${user.email || "akun Firebase"}${account ? ` • Paket saat ini: ${account.planLabel}` : ""}` : "Belum login."} {config?.environment === "sandbox" ? "• Midtrans Sandbox/Test" : config?.environment === "production" ? "• Midtrans Production" : ""}</div>
        {message && <div className="mt-5 max-w-xl mx-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-center text-zinc-300">{message}</div>}
      </div>
    </main>
  );
}
