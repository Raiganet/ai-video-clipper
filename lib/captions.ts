import type { TranscriptSegment } from "@/lib/transcription";

export type CaptionStyle = "none" | "clean" | "karaoke" | "pili" | "pop";

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

interface RenderedCaption {
  cue: CaptionCue;
  png: Uint8Array;
}

const WORDS_PER_CUE: Record<Exclude<CaptionStyle, "none">, number> = {
  clean: 6,
  karaoke: 3,
  pili: 3,
  pop: 4,
};

function cleanText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitSegment(segment: TranscriptSegment, clipStart: number, clipEnd: number, style: Exclude<CaptionStyle, "none">) {
  const segmentStart = Math.max(segment.start, clipStart);
  const segmentEnd = Math.min(segment.end, clipEnd);
  if (segmentEnd <= segmentStart) return [] as CaptionCue[];

  const words = cleanText(segment.text).split(" ").filter(Boolean);
  if (words.length === 0) return [] as CaptionCue[];

  const groupSize = WORDS_PER_CUE[style];
  const groups: string[][] = [];
  for (let index = 0; index < words.length; index += groupSize) {
    groups.push(words.slice(index, index + groupSize));
  }

  const fullDuration = segmentEnd - segmentStart;
  const totalWords = words.length;
  let consumedWords = 0;

  return groups.map((group, index) => {
    const startRatio = consumedWords / totalWords;
    consumedWords += group.length;
    const endRatio = consumedWords / totalWords;
    const start = segmentStart + fullDuration * startRatio - clipStart;
    const end = segmentStart + fullDuration * endRatio - clipStart;

    return {
      start: Math.max(0, start),
      end: Math.max(start + 0.12, end),
      text: group.join(" "),
    } satisfies CaptionCue;
  });
}

export function buildCaptionCues(
  segments: TranscriptSegment[],
  clipStart: number,
  clipDuration: number,
  style: CaptionStyle
): CaptionCue[] {
  if (style === "none") return [];
  const clipEnd = clipStart + clipDuration;
  const typedStyle = style as Exclude<CaptionStyle, "none">;

  return segments
    .filter((segment) => segment.end > clipStart && segment.start < clipEnd && cleanText(segment.text))
    .flatMap((segment) => splitSegment(segment, clipStart, clipEnd, typedStyle))
    .filter((cue) => cue.end > cue.start && cue.start < clipDuration)
    .map((cue) => ({ ...cue, end: Math.min(clipDuration, cue.end) }))
    .slice(0, 80);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitFontSize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, initialSize: number, weight = 900) {
  let size = initialSize;
  while (size > 24) {
    ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Gagal membuat layer caption"));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

async function renderCueToPng(cue: CaptionCue, style: Exclude<CaptionStyle, "none">, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas caption tidak tersedia di browser ini");

  const text = style === "pop" || style === "pili" ? cue.text.toUpperCase() : cue.text;
  const baseSize = Math.max(34, Math.round(width * (style === "karaoke" ? 0.075 : 0.066)));
  const maxTextWidth = width * 0.82;
  const fontSize = fitFontSize(ctx, text, maxTextWidth, baseSize, style === "clean" ? 800 : 900);
  ctx.font = `${style === "clean" ? 800 : 900} ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  const textWidth = Math.min(maxTextWidth, ctx.measureText(text).width);
  const padX = Math.round(fontSize * 0.42);
  const padY = Math.round(fontSize * 0.25);
  const boxWidth = Math.min(width * 0.92, textWidth + padX * 2);
  const boxHeight = fontSize + padY * 2;
  const x = width / 2;
  const y = Math.round(height * (style === "pop" ? 0.72 : 0.79));

  ctx.save();
  if (style === "clean") {
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    roundRect(ctx, x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, Math.round(fontSize * 0.25));
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
  } else if (style === "karaoke") {
    ctx.strokeStyle = "rgba(0,0,0,0.95)";
    ctx.lineWidth = Math.max(5, Math.round(fontSize * 0.14));
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#fde047";
    ctx.fillText(text, x, y);
  } else if (style === "pili") {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = Math.round(fontSize * 0.18);
    ctx.shadowOffsetY = Math.round(fontSize * 0.08);
    ctx.fillStyle = "#facc15";
    roundRect(ctx, x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight, Math.round(fontSize * 0.18));
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#09090b";
    ctx.fillText(text, x, y);
  } else {
    ctx.strokeStyle = "rgba(0,0,0,0.98)";
    ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.16));
    ctx.strokeText(text, x, y);
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = Math.round(fontSize * 0.18);
    ctx.shadowOffsetY = Math.round(fontSize * 0.08);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, x, y);
  }
  ctx.restore();

  return canvasToPng(canvas);
}

export async function renderCaptionLayers(
  cues: CaptionCue[],
  style: CaptionStyle,
  width: number,
  height: number,
  onProgress?: (percent: number) => void
): Promise<RenderedCaption[]> {
  if (style === "none" || cues.length === 0) return [];
  const typedStyle = style as Exclude<CaptionStyle, "none">;
  const rendered: RenderedCaption[] = [];

  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    rendered.push({ cue, png: await renderCueToPng(cue, typedStyle, width, height) });
    onProgress?.(Math.round(((index + 1) / cues.length) * 100));
  }

  return rendered;
}
