"use client";

export interface BriefCtaOverlay {
  enabled: boolean;
  text: string;
  link?: string;
  duration: number;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => canvas.toBlob(async (blob) => blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error("Gagal membuat CTA layer")), "image/png"));
}

export async function renderBriefCtaLayer(cta: BriefCtaOverlay | undefined, width: number, height: number) {
  if (!cta?.enabled || !cta.text.trim()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas CTA tidak tersedia.");
  const boxW = Math.round(width * 0.86), boxH = Math.round(height * 0.19), x = Math.round((width - boxW) / 2), y = Math.round(height * 0.54);
  const radius = Math.round(Math.min(width, height) * 0.025);
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.beginPath(); ctx.roundRect(x, y, boxW, boxH, radius); ctx.fill();
  const mainSize = Math.max(28, Math.round(width * 0.055));
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `900 ${mainSize}px Arial, sans-serif`; ctx.fillStyle = "#ffffff";
  const words = cta.text.trim().split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > boxW * 0.82 && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); const shown = lines.slice(0, 2); const center = y + boxH * (cta.link ? 0.40 : 0.5);
  shown.forEach((value, index) => ctx.fillText(value, width / 2, center + (index - (shown.length - 1) / 2) * mainSize * 1.18));
  if (cta.link) { ctx.font = `700 ${Math.max(18, Math.round(mainSize * 0.48))}px Arial, sans-serif`; ctx.fillStyle = "#6ee7b7"; ctx.fillText(cta.link.replace(/^https?:\/\//, ""), width / 2, y + boxH * 0.80); }
  return canvasToPng(canvas);
}
