"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Crop, ScanFace, Smartphone } from "lucide-react";

export interface ClipperSettings {
  previewCount: number;
  vibe: "viral" | "edukasi" | "jualan" | "ringkas";
  crop: "auto" | "9:16" | "1:1" | "16:9" | "original";
  smartCrop: "face" | "center";
  aiMode: "transcript" | "split";
}

interface Props {
  settings: ClipperSettings;
  onChange: (settings: ClipperSettings) => void;
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const vibes: Array<{ id: ClipperSettings["vibe"]; label: string }> = [
    { id: "viral", label: "Viral" },
    { id: "edukasi", label: "Edukasi" },
    { id: "jualan", label: "Jualan" },
    { id: "ringkas", label: "Ringkas" },
  ];
  const crops: Array<{ id: ClipperSettings["crop"]; label: string; hint: string }> = [
    { id: "auto", label: "Auto", hint: "Sosial" },
    { id: "9:16", label: "9:16", hint: "TikTok/Reels" },
    { id: "1:1", label: "1:1", hint: "Square" },
    { id: "16:9", label: "16:9", hint: "YouTube" },
    { id: "original", label: "Original", hint: "Tanpa crop" },
  ];
  const aiModes: Array<{ id: ClipperSettings["aiMode"]; label: string; hint: string }> = [
    { id: "transcript", label: "AI + Timestamp", hint: "Momen + caption" },
    { id: "split", label: "Pembagian cepat", hint: "Tanpa AI/caption" },
  ];

  const updateSetting = <K extends keyof ClipperSettings>(key: K, value: ClipperSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-zinc-400 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Pengaturan klip & export
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-sm text-zinc-400 mb-3 block">JUMLAH PREVIEW</label>
            <div className="flex flex-wrap gap-2">
              {[3, 5, 8, 10].map((num) => (
                <button key={num} type="button" onClick={() => updateSetting("previewCount", num)} className={`px-4 py-2 rounded-lg transition-all ${settings.previewCount === num ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-3 block">VIBE ANALISIS</label>
            <div className="flex flex-wrap gap-2">
              {vibes.map((vibe) => (
                <button key={vibe.id} type="button" onClick={() => updateSetting("vibe", vibe.id)} className={`px-4 py-2 rounded-lg transition-all ${settings.vibe === vibe.id ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                  {vibe.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-zinc-400">RASIO OUTPUT</label>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full"><Crop className="w-3 h-3" /> Aktif</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {crops.map((crop) => (
                <button key={crop.id} type="button" onClick={() => updateSetting("crop", crop.id)} className={`px-3 py-2 rounded-lg transition-all text-left ${settings.crop === crop.id ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                  <span className="block text-sm font-semibold">{crop.label}</span>
                  <span className={`block text-[10px] ${settings.crop === crop.id ? "text-emerald-100" : "text-zinc-600"}`}>{crop.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-600 mt-2 flex items-center gap-1"><Smartphone className="w-3 h-3" /> Auto memilih format sosial berdasarkan video sumber.</p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-zinc-400">SMART FRAMING</label>
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full"><ScanFace className="w-3 h-3" /> Stage 3</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => updateSetting("smartCrop", "face")} className={`px-3 py-2 rounded-lg text-left transition-all ${settings.smartCrop === "face" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                <span className="block text-sm font-semibold">Smart Face</span>
                <span className={`block text-[10px] ${settings.smartCrop === "face" ? "text-emerald-100" : "text-zinc-600"}`}>Sampling wajah lokal</span>
              </button>
              <button type="button" onClick={() => updateSetting("smartCrop", "center")} className={`px-3 py-2 rounded-lg text-left transition-all ${settings.smartCrop === "center" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                <span className="block text-sm font-semibold">Center</span>
                <span className={`block text-[10px] ${settings.smartCrop === "center" ? "text-emerald-100" : "text-zinc-600"}`}>Crop tengah klasik</span>
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2">Smart Face mengambil beberapa sampel frame untuk menjaga subjek tetap berada di area crop. Jika wajah tidak ditemukan, otomatis kembali ke center.</p>
          </div>

          <div>
            <label className="text-sm text-zinc-400 mb-3 block">MODE ANALISIS</label>
            <div className="flex flex-wrap gap-2">
              {aiModes.map((mode) => (
                <button key={mode.id} type="button" onClick={() => updateSetting("aiMode", mode.id)} className={`px-4 py-2 rounded-lg transition-all text-left ${settings.aiMode === mode.id ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}>
                  <span className="block">{mode.label}</span>
                  <span className={`block text-[10px] mt-0.5 ${settings.aiMode === mode.id ? "text-emerald-100" : "text-zinc-600"}`}>{mode.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
