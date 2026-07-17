"use client";

interface CaptionStyle {
  id: string;
  name: string;
  label: string;
  subtitle?: string;
  featured?: boolean;
  highlight?: boolean;
}

const styles: CaptionStyle[] = [
  { id: "none", name: "Tanpa", label: "Tanpa" },
  { id: "clean", name: "WAJIB NONTON", label: "Clean", subtitle: "Saran" },
  { id: "karaoke", name: "WAJIB NONTON", label: "Karaoke", subtitle: "✓", featured: true },
  { id: "pili", name: "WAJIB", label: "Pili", highlight: true },
  { id: "pop", name: "NONTON", label: "Pop" },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function CaptionStyleSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {styles.map((style) => (
        <button
          key={style.id}
          onClick={() => onChange(style.id)}
          className={`relative p-4 rounded-lg border transition-all ${
            value === style.id
              ? style.featured
                ? "border-emerald-500 bg-emerald-500/20"
                : "border-emerald-500 bg-emerald-600"
              : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
          }`}
        >
          {style.featured && value === style.id && (
            <div className="absolute -top-2 -right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          <div className={`font-bold ${style.highlight ? "bg-yellow-400 text-black px-2 py-1 rounded inline-block" : ""}`}>
            {style.name}
          </div>
          <div className="text-white font-semibold mt-1">{style.label}</div>
          {style.subtitle && (
            <div className="text-xs text-zinc-400 mt-1">{style.subtitle}</div>
          )}
        </button>
      ))}
    </div>
  );
}