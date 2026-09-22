import { WifiOff } from "lucide-react";

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-zinc-900 flex items-center justify-center mb-5"><WifiOff className="w-7 h-7 text-emerald-400" /></div>
        <h1 className="text-2xl font-bold">Sedang offline</h1>
        <p className="text-zinc-400 mt-3 text-sm leading-6">Project lokal yang sudah tersimpan masih dapat digunakan setelah aplikasi termuat dari cache. Transkripsi AI, login baru, dan dashboard admin membutuhkan internet.</p>
        <a href="/" className="inline-flex mt-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-3 font-semibold">Kembali ke AI Clipper</a>
      </div>
    </main>
  );
}
