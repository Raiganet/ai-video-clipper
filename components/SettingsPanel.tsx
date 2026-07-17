"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Settings {
  previewCount: number;
  vibe: string;
  crop: string;
  aiMode: string;
}

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export default function SettingsPanel({ settings, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const vibes = [
    { id: "viral", label: "Viral" },
    { id: "edukasi", label: "Edukasi" },
    { id: "jualan", label: "Jualan" },
    { id: "ringkas", label: "Ringkas" },
  ];

  const crops = [
    { id: "auto", label: "Auto" },
    { id: "1:1", label: "1:1" },
    { id: "utuh", label: "Utuh" },
  ];

  const aiModes = [
    { id: "transcript", label: "Transkrip cepat" },
    { id: "visual", label: "Visual lengkap" },
  ];

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="card-dark">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-zinc-400 hover:text-white transition-colors"
      >
        <span className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          Atur sendiri (opsional)
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Jumlah Preview */}
          <div>
            <label className="text-sm text-zinc-400 mb-3 block">JUMLAH PREVIEW</label>
            <div className="flex gap-2">
              {[3, 5, 8, 10].map((num) => (
                <button
                  key={num}
                  onClick={() => updateSetting("previewCount", num)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    settings.previewCount === num
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Vibe */}
          <div>
            <label className="text-sm text-zinc-400 mb-3 block">VIBE</label>
            <div className="flex flex-wrap gap-2">
              {vibes.map((vibe) => (
                <button
                  key={vibe.id}
                  onClick={() => updateSetting("vibe", vibe.id)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    settings.vibe === vibe.id
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {vibe.label}
                </button>
              ))}
            </div>
          </div>

          {/* Crop */}
          <div>
            <label className="text-sm text-zinc-400 mb-3 block">CROP</label>
            <div className="flex gap-2">
              {crops.map((crop) => (
                <button
                  key={crop.id}
                  onClick={() => updateSetting("crop", crop.id)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    settings.crop === crop.id
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {crop.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mode AI */}
          <div>
            <label className="text-sm text-zinc-400 mb-3 block">MODE AI</label>
            <div className="flex gap-2">
              {aiModes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => updateSetting("aiMode", mode.id)}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    settings.aiMode === mode.id
                      ? "bg-emerald-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}