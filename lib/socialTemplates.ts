import type { CaptionStyle } from "@/lib/captions";
import type { BrandingSettings } from "@/lib/branding";
import type { ClipperSettings } from "@/components/SettingsPanel";

export type SocialTemplateId = "shorts-viral" | "podcast-duo" | "edu-clean" | "sales-pop" | "youtube-landscape" | "square-promo";

export interface SocialTemplate {
  id: SocialTemplateId;
  name: string;
  description: string;
  badge: string;
  captionStyle: CaptionStyle;
  settings: Partial<ClipperSettings>;
  branding: Partial<BrandingSettings>;
}

export const SOCIAL_TEMPLATES: SocialTemplate[] = [
  {
    id: "shorts-viral",
    name: "Shorts Viral",
    description: "9:16, hook cepat, karaoke, active subject.",
    badge: "TikTok • Reels • Shorts",
    captionStyle: "karaoke",
    settings: { crop: "9:16", smartCrop: "dynamic", vibe: "viral", aiMode: "transcript", speakerMode: "off", renderMode: "auto" },
    branding: { position: "top-right", scale: 0.9 },
  },
  {
    id: "podcast-duo",
    name: "Podcast Duo",
    description: "Diarization speaker + caption bersih untuk percakapan.",
    badge: "Podcast • Interview",
    captionStyle: "clean",
    settings: { crop: "9:16", smartCrop: "dynamic", vibe: "ringkas", aiMode: "transcript", speakerMode: "diarize", renderMode: "auto" },
    branding: { position: "top-right", scale: 0.85 },
  },
  {
    id: "edu-clean",
    name: "Edu Clean",
    description: "Fokus isi, caption clean, framing stabil.",
    badge: "Tutorial • Edukasi",
    captionStyle: "clean",
    settings: { crop: "9:16", smartCrop: "face", vibe: "edukasi", aiMode: "transcript", speakerMode: "off", renderMode: "auto" },
    branding: { position: "bottom-right", scale: 0.85 },
  },
  {
    id: "sales-pop",
    name: "Sales Pop",
    description: "CTA kuat dengan caption pop dan branding aktif.",
    badge: "Affiliate • Produk",
    captionStyle: "pop",
    settings: { crop: "9:16", smartCrop: "dynamic", vibe: "jualan", aiMode: "transcript", speakerMode: "off", renderMode: "auto" },
    branding: { enabled: true, position: "top-right", scale: 0.95, background: true },
  },
  {
    id: "youtube-landscape",
    name: "YouTube Landscape",
    description: "16:9 untuk highlight dan video YouTube biasa.",
    badge: "YouTube",
    captionStyle: "clean",
    settings: { crop: "16:9", smartCrop: "face", vibe: "ringkas", aiMode: "transcript", speakerMode: "off", renderMode: "auto" },
    branding: { position: "top-right", scale: 0.9 },
  },
  {
    id: "square-promo",
    name: "Square Promo",
    description: "1:1 untuk feed dan promo produk.",
    badge: "Feed • Marketplace",
    captionStyle: "pili",
    settings: { crop: "1:1", smartCrop: "face", vibe: "jualan", aiMode: "transcript", speakerMode: "off", renderMode: "auto" },
    branding: { enabled: true, position: "bottom-right", scale: 0.9 },
  },
];
