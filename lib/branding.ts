"use client";

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface BrandingSettings {
  enabled: boolean;
  name: string;
  handle: string;
  position: WatermarkPosition;
  opacity: number;
  scale: number;
  background: boolean;
  logoDataUrl: string | null;
  logoName: string | null;
}

export const DEFAULT_BRANDING: BrandingSettings = {
  enabled: false,
  name: "Kastriva",
  handle: "@kastriva",
  position: "top-right",
  opacity: 0.9,
  scale: 1,
  background: true,
  logoDataUrl: null,
  logoName: null,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeBranding(input?: Partial<BrandingSettings> | null): BrandingSettings {
  return {
    enabled: Boolean(input?.enabled),
    name: String(input?.name ?? DEFAULT_BRANDING.name).slice(0, 50),
    handle: String(input?.handle ?? DEFAULT_BRANDING.handle).slice(0, 60),
    position: (["top-left", "top-right", "bottom-left", "bottom-right"] as WatermarkPosition[]).includes(input?.position as WatermarkPosition)
      ? input!.position as WatermarkPosition
      : DEFAULT_BRANDING.position,
    opacity: clamp(Number(input?.opacity ?? DEFAULT_BRANDING.opacity), 0.2, 1),
    scale: clamp(Number(input?.scale ?? DEFAULT_BRANDING.scale), 0.65, 1.5),
    background: input?.background !== false,
    logoDataUrl: typeof input?.logoDataUrl === "string" && input.logoDataUrl.startsWith("data:image/") ? input.logoDataUrl : null,
    logoName: typeof input?.logoName === "string" ? input.logoName.slice(0, 100) : null,
  };
}

export function brandingKey(settings: BrandingSettings) {
  const normalized = normalizeBranding(settings);
  let logoHash = "no-logo";
  if (normalized.logoDataUrl) {
    let hash = 2166136261;
    const sample = normalized.logoDataUrl.slice(0, 1200) + normalized.logoDataUrl.slice(-1200);
    for (let i = 0; i < sample.length; i += 1) {
      hash ^= sample.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    logoHash = (hash >>> 0).toString(36);
  }
  return [
    normalized.enabled ? "1" : "0",
    normalized.name,
    normalized.handle,
    normalized.position,
    normalized.opacity.toFixed(2),
    normalized.scale.toFixed(2),
    normalized.background ? "bg" : "clear",
    logoHash,
  ].join("|");
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Logo tidak dapat dibaca."));
    img.src = src;
  });
}

export async function compressLogo(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Logo harus berupa file gambar.");
  if (file.size > 4 * 1024 * 1024) throw new Error("Logo maksimal 4 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = await loadImage(source);
    const maxSide = 256;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas logo tidak tersedia.");
    ctx.drawImage(image, 0, 0, width, height);
    const data = canvas.toDataURL("image/png");
    if (data.length > 260_000) throw new Error("Logo terlalu kompleks. Gunakan PNG/WebP yang lebih sederhana.");
    return data;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function renderBrandingLayer(settings: BrandingSettings, width: number, height: number): Promise<Uint8Array | null> {
  const brand = normalizeBranding(settings);
  if (!brand.enabled) return null;
  const hasText = Boolean(brand.name.trim() || brand.handle.trim());
  if (!hasText && !brand.logoDataUrl) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas branding tidak tersedia.");

  const base = Math.max(16, Math.round(Math.min(width, height) * 0.025 * brand.scale));
  const logoSize = Math.round(base * 2.35);
  const pad = Math.round(base * 0.7);
  const gap = Math.round(base * 0.45);
  const safe = Math.round(Math.min(width, height) * 0.035);
  ctx.font = `700 ${base}px system-ui, -apple-system, sans-serif`;
  const nameW = brand.name ? ctx.measureText(brand.name).width : 0;
  ctx.font = `500 ${Math.round(base * 0.7)}px system-ui, -apple-system, sans-serif`;
  const handleW = brand.handle ? ctx.measureText(brand.handle).width : 0;
  const textW = Math.max(nameW, handleW);
  const contentW = (brand.logoDataUrl ? logoSize + gap : 0) + textW;
  const contentH = Math.max(logoSize, Math.round(base * 1.85));
  const boxW = Math.round(contentW + pad * 2);
  const boxH = Math.round(contentH + pad * 1.5);

  const left = brand.position.includes("right") ? width - safe - boxW : safe;
  const top = brand.position.startsWith("bottom") ? height - safe - boxH : safe;
  ctx.globalAlpha = brand.opacity;

  if (brand.background) {
    const radius = Math.max(10, Math.round(base * 0.75));
    ctx.fillStyle = "rgba(0,0,0,0.52)";
    ctx.beginPath();
    ctx.roundRect(left, top, boxW, boxH, radius);
    ctx.fill();
  }

  let textX = left + pad;
  if (brand.logoDataUrl) {
    try {
      const logo = await loadImage(brand.logoDataUrl);
      const ratio = Math.min(logoSize / logo.naturalWidth, logoSize / logo.naturalHeight);
      const drawW = Math.max(1, Math.round(logo.naturalWidth * ratio));
      const drawH = Math.max(1, Math.round(logo.naturalHeight * ratio));
      const logoX = left + pad + Math.round((logoSize - drawW) / 2);
      const logoY = top + Math.round((boxH - drawH) / 2);
      ctx.drawImage(logo, logoX, logoY, drawW, drawH);
      textX += logoSize + gap;
    } catch {
      // Text branding tetap dirender jika logo gagal didecode.
    }
  }

  const centerY = top + boxH / 2;
  if (brand.name) {
    ctx.font = `700 ${base}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(brand.name, textX, centerY - (brand.handle ? base * 0.08 : -base * 0.34));
  }
  if (brand.handle) {
    ctx.font = `500 ${Math.round(base * 0.7)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.fillText(brand.handle, textX, centerY + base * 0.72);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Gagal membuat layer branding.")), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}
