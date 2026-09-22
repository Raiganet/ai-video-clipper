"use client";

import { useState } from "react";
import { ImagePlus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { compressLogo, DEFAULT_BRANDING, type BrandingSettings, type WatermarkPosition } from "@/lib/branding";

interface Props {
  value: BrandingSettings;
  onChange: (value: BrandingSettings) => void;
  disabled?: boolean;
}

const positions: Array<{ id: WatermarkPosition; label: string }> = [
  { id: "top-left", label: "Kiri atas" },
  { id: "top-right", label: "Kanan atas" },
  { id: "bottom-left", label: "Kiri bawah" },
  { id: "bottom-right", label: "Kanan bawah" },
];

export default function BrandingPanel({ value, onChange, disabled }: Props) {
  const [message, setMessage] = useState("");
  const update = <K extends keyof BrandingSettings>(key: K, next: BrandingSettings[K]) => onChange({ ...value, [key]: next });

  const chooseLogo = async (file: File | null) => {
    if (!file) return;
    setMessage("");
    try {
      const data = await compressLogo(file);
      onChange({ ...value, logoDataUrl: data, logoName: file.name, enabled: true });
      setMessage("Logo disiapkan sebagai preset watermark lokal/cloud draft.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logo gagal diproses.");
    }
  };

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Branding & Watermark</h3>
          <p className="text-xs text-zinc-500 mt-1">Logo/text dibakar langsung ke semua hasil render.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={value.enabled} disabled={disabled} onChange={(event) => update("enabled", event.target.checked)} className="accent-emerald-500" />
          Aktif
        </label>
      </div>

      <div className={`mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 ${!value.enabled ? "opacity-55" : ""}`}>
        <label className="text-xs text-zinc-400">Nama brand
          <input disabled={disabled || !value.enabled} maxLength={50} value={value.name} onChange={(event) => update("name", event.target.value)} className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-400">Handle / subteks
          <input disabled={disabled || !value.enabled} maxLength={60} value={value.handle} onChange={(event) => update("handle", event.target.value)} className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-white" />
        </label>

        <div>
          <div className="text-xs text-zinc-400 mb-2">Logo</div>
          <div className="flex gap-2">
            <label className={`flex-1 rounded-lg border border-dashed border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm flex items-center justify-center gap-2 ${disabled || !value.enabled ? "pointer-events-none opacity-50" : "cursor-pointer hover:border-emerald-500"}`}>
              <ImagePlus className="w-4 h-4" /> {value.logoName || "Pilih PNG/WebP"}
              <input hidden type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => void chooseLogo(event.target.files?.[0] || null)} />
            </label>
            {value.logoDataUrl && <button type="button" disabled={disabled} onClick={() => onChange({ ...value, logoDataUrl: null, logoName: null })} className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400"><Trash2 className="w-4 h-4" /></button>}
          </div>
        </div>

        <label className="text-xs text-zinc-400">Posisi
          <select disabled={disabled || !value.enabled} value={value.position} onChange={(event) => update("position", event.target.value as WatermarkPosition)} className="mt-1 w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-white">
            {positions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>

        <label className="text-xs text-zinc-400">Opacity {Math.round(value.opacity * 100)}%
          <input disabled={disabled || !value.enabled} type="range" min={0.2} max={1} step={0.05} value={value.opacity} onChange={(event) => update("opacity", Number(event.target.value))} className="mt-2 w-full accent-emerald-500" />
        </label>
        <label className="text-xs text-zinc-400">Ukuran {Math.round(value.scale * 100)}%
          <input disabled={disabled || !value.enabled} type="range" min={0.65} max={1.5} step={0.05} value={value.scale} onChange={(event) => update("scale", Number(event.target.value))} className="mt-2 w-full accent-emerald-500" />
        </label>

        <label className="text-xs text-zinc-400 flex items-center gap-2"><input disabled={disabled || !value.enabled} type="checkbox" checked={value.background} onChange={(event) => update("background", event.target.checked)} className="accent-emerald-500" /> Latar transparan gelap agar watermark terbaca</label>
        <button type="button" disabled={disabled} onClick={() => onChange({ ...DEFAULT_BRANDING })} className="rounded-lg bg-zinc-800 hover:bg-zinc-700 py-2.5 text-sm flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Reset preset</button>
      </div>
      {message && <p className="text-xs text-zinc-500 mt-3">{message}</p>}
    </section>
  );
}
