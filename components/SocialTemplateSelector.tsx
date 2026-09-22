"use client";

import { LayoutTemplate, Sparkles } from "lucide-react";
import { SOCIAL_TEMPLATES, type SocialTemplate, type SocialTemplateId } from "@/lib/socialTemplates";

interface Props {
  selected: SocialTemplateId | null;
  disabled?: boolean;
  onApply: (template: SocialTemplate) => void;
}

export default function SocialTemplateSelector({ selected, disabled, onApply }: Props) {
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <LayoutTemplate className="w-4 h-4 text-emerald-400" />
        <div>
          <div className="font-semibold">Template Social Media</div>
          <div className="text-xs text-zinc-500">Satu klik mengatur rasio, vibe, caption, framing, speaker mode, dan posisi branding.</div>
        </div>
        <span className="ml-auto text-[10px] rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-1">STAGE 8</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SOCIAL_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            disabled={disabled}
            onClick={() => onApply(template)}
            className={`text-left rounded-xl border p-4 transition-all disabled:opacity-50 ${selected === template.id ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm">{template.name}</span>
              {selected === template.id && <Sparkles className="w-4 h-4 text-emerald-400" />}
            </div>
            <div className="text-[10px] text-emerald-300 mt-1">{template.badge}</div>
            <div className="text-xs text-zinc-500 mt-2 leading-relaxed">{template.description}</div>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-600 mt-3">Setelah memilih template, semua parameter tetap bisa diubah manual.</p>
    </section>
  );
}
