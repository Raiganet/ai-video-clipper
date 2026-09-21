"use client";

import { Check, Captions } from "lucide-react";
import type { CaptionStyle } from "@/lib/captions";

interface CaptionStyleOption {
  id: CaptionStyle;
  name: string;
  label: string;
  description: string;
  previewClass?: string;
}

const styles: CaptionStyleOption[] = [
  { id: "none", name: "Aa", label: "Tanpa", description: "Video bersih" },
  { id: "clean", name: "WAJIB NONTON", label: "Clean", description: "Putih + box gelap" },
  { id: "karaoke", name: "WAJIB NONTON", label: "Karaoke", description: "Kuning cepat", previewClass: "text-yellow-300" },
  { id: "pili", name: "WAJIB", label: "Pili", description: "Block kuning", previewClass: "bg-yellow-400 text-black px-2 py-1 rounded inline-block" },
  { id: "pop", name: "NONTON!", label: "Pop", description: "Bold + outline" },
];

interface Props {
  value: CaptionStyle;
  onChange: (value: CaptionStyle) => void;
  available?: boolean;
}

export default function CaptionStyleSelector({ value, onChange, available = true }: Props) {
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {styles.map((style) => (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange(style.id)}
            className={`relative p-4 rounded-lg border transition-all text-left ${value === style.id ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"}`}
          >
            {value === style.id && <Check className="absolute right-2 top-2 w-3.5 h-3.5 text-emerald-400" />}
            <div className={`font-black text-sm truncate ${style.previewClass || "text-white"}`}>{style.name}</div>
            <div className="text-white font-semibold mt-2 text-sm">{style.label}</div>
            <div className="text-[10px] text-zinc-500 mt-1">{style.description}</div>
          </button>
        ))}
      </div>
      <div className={`mt-3 flex items-center gap-2 text-xs ${available ? "text-emerald-300" : "text-amber-300"}`}>
        <Captions className="w-3.5 h-3.5" />
        {available
          ? "Caption akan dibakar langsung ke MP4 saat preview/export dirender."
          : "Caption otomatis membutuhkan AI + Timestamp, tetapi caption manual tetap bisa ditambah dari editor klip."}
      </div>
    </div>
  );
}
