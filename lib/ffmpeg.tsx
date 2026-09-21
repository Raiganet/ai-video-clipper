// FFmpeg.wasm dimuat on-demand di browser. Semua operasi diserialkan agar
// satu instance FFmpeg tidak menulis file virtual dengan nama yang bentrok.

import { buildCaptionCues, renderCaptionLayers, type CaptionCue, type CaptionStyle } from "@/lib/captions";
import type { TranscriptSegment } from "@/lib/transcription";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFFmpeg = any;

const nativeImport = new Function("url", "return import(url)") as (
  url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

const FFMPEG_VERSION = "0.12.15";
const UTIL_VERSION = "0.12.2";
const CORE_VERSION = "0.12.10";
const AUDIO_CHUNK_SECONDS = 12 * 60;

let ffmpeg: AnyFFmpeg | null = null;
let loadPromise: Promise<AnyFFmpeg> | null = null;
let libsPromise: Promise<{
  FFmpeg: any;
  fetchFile: (f: File) => Promise<Uint8Array>;
}> | null = null;
let progressCb: ((p: number) => void) | null = null;
let operationQueue: Promise<unknown> = Promise.resolve();

export interface AudioChunk {
  file: File;
  start: number;
  duration: number;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
}

export type OutputRatio = "auto" | "9:16" | "1:1" | "16:9" | "original";

export interface RenderClipOptions {
  start: number;
  duration: number;
  ratio: OutputRatio;
  captionStyle: CaptionStyle;
  transcriptSegments: TranscriptSegment[];
  sourceWidth: number;
  sourceHeight: number;
  cropFocus?: { x: number; y: number };
  captionCues?: CaptionCue[];
  onProgress?: (percent: number, phase: "captions" | "render") => void;
}

function loadLibs() {
  if (!libsPromise) {
    libsPromise = (async () => {
      const [ffmpegMod, utilMod] = await Promise.all([
        nativeImport(`https://esm.sh/@ffmpeg/ffmpeg@${FFMPEG_VERSION}`),
        nativeImport(`https://esm.sh/@ffmpeg/util@${UTIL_VERSION}`),
      ]);
      return { FFmpeg: ffmpegMod.FFmpeg, fetchFile: utilMod.fetchFile };
    })();
  }
  return libsPromise;
}

function makeWorkerBlobURL(): string {
  const workerEntry = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`;
  const src = `import ${JSON.stringify(workerEntry)};`;
  return URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
}

function uniqueName(prefix: string, ext: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
}

async function safeDelete(instance: AnyFFmpeg, name: string) {
  try {
    await instance.deleteFile(name);
  } catch {
    // File mungkin belum sempat dibuat. Cleanup tetap dilanjutkan.
  }
}

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = operationQueue.then(task, task);
  operationQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function even(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function resolveOutputRatio(ratio: OutputRatio, sourceWidth: number, sourceHeight: number): Exclude<OutputRatio, "auto"> {
  if (ratio !== "auto") return ratio;
  const sourceRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 16 / 9;
  if (sourceRatio > 0.9 && sourceRatio < 1.1) return "1:1";
  return "9:16";
}

export function getOutputSize(ratio: OutputRatio, sourceWidth: number, sourceHeight: number) {
  const resolvedRatio = resolveOutputRatio(ratio, sourceWidth, sourceHeight);

  if (resolvedRatio === "9:16") return { width: 720, height: 1280, ratio: resolvedRatio };
  if (resolvedRatio === "1:1") return { width: 720, height: 720, ratio: resolvedRatio };
  if (resolvedRatio === "16:9") return { width: 1280, height: 720, ratio: resolvedRatio };

  const width = Math.max(2, sourceWidth || 1280);
  const height = Math.max(2, sourceHeight || 720);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: even(width * scale),
    height: even(height * scale),
    ratio: resolvedRatio,
  };
}

/** Muat mesin FFmpeg sekali saja, on-demand. */
export async function getFFmpeg(): Promise<AnyFFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = await loadLibs();
    const instance = new FFmpeg();

    instance.on("progress", ({ progress }: { progress: number }) => {
      progressCb?.(Math.min(100, Math.max(0, Math.round(progress * 100))));
    });

    const classWorkerURL = makeWorkerBlobURL();
    const coreURL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`;
    const wasmURL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`;

    try {
      await instance.load({ classWorkerURL, coreURL, wasmURL });
    } finally {
      URL.revokeObjectURL(classWorkerURL);
    }

    ffmpeg = instance;
    return instance;
  })();

  try {
    return await loadPromise;
  } catch (error) {
    loadPromise = null;
    libsPromise = null;
    throw error;
  }
}

/**
 * Render klip dengan crop/scale dan caption sungguhan. Caption diraster di Canvas
 * menjadi PNG transparan, sehingga tidak bergantung pada font/filter drawtext FFmpeg.
 */
export async function renderVideoClip(file: File, options: RenderClipOptions): Promise<Blob> {
  return runExclusive(async () => {
    const { fetchFile } = await loadLibs();
    const instance = await getFFmpeg();
    const inputExt = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
    const inputName = uniqueName("video-source", inputExt);
    const outputName = uniqueName("clip-rendered", "mp4");
    const captionNames: string[] = [];
    const size = getOutputSize(options.ratio, options.sourceWidth, options.sourceHeight);
    const cues = options.captionCues ?? buildCaptionCues(options.transcriptSegments, options.start, options.duration, options.captionStyle);

    try {
      const captionLayers = await renderCaptionLayers(
        cues,
        options.captionStyle,
        size.width,
        size.height,
        (percent) => options.onProgress?.(percent, "captions")
      );

      await instance.writeFile(inputName, await fetchFile(file));
      for (let index = 0; index < captionLayers.length; index += 1) {
        const name = uniqueName(`caption-${index + 1}`, "png");
        captionNames.push(name);
        await instance.writeFile(name, captionLayers[index].png);
      }

      const args: string[] = [
        "-ss", String(Math.max(0, options.start)),
        "-t", String(Math.max(0.1, options.duration)),
        "-i", inputName,
      ];
      captionNames.forEach((name) => {
        args.push("-loop", "1", "-i", name);
      });

      const filterParts: string[] = [];
      let baseScale: string;
      if (size.ratio === "original") {
        baseScale = `scale=${size.width}:${size.height},setsar=1`;
      } else {
        const sourceWidth = Math.max(2, options.sourceWidth || size.width);
        const sourceHeight = Math.max(2, options.sourceHeight || size.height);
        const scaleFactor = Math.max(size.width / sourceWidth, size.height / sourceHeight);
        const scaledWidth = even(sourceWidth * scaleFactor);
        const scaledHeight = even(sourceHeight * scaleFactor);
        const focusX = Math.min(0.95, Math.max(0.05, options.cropFocus?.x ?? 0.5));
        const focusY = Math.min(0.95, Math.max(0.05, options.cropFocus?.y ?? 0.5));
        const cropX = Math.max(0, Math.min(scaledWidth - size.width, Math.round(scaledWidth * focusX - size.width / 2)));
        const cropY = Math.max(0, Math.min(scaledHeight - size.height, Math.round(scaledHeight * focusY - size.height / 2)));
        baseScale = `scale=${scaledWidth}:${scaledHeight},crop=${size.width}:${size.height}:${cropX}:${cropY},setsar=1`;
      }

      filterParts.push(`[0:v]${baseScale},setpts=PTS-STARTPTS[v0]`);
      let lastVideo = "v0";

      captionLayers.forEach((layer, index) => {
        const imageIndex = index + 1;
        const overlayOut = `v${index + 1}`;
        const start = Math.max(0, layer.cue.start).toFixed(3);
        const end = Math.max(layer.cue.start + 0.05, layer.cue.end).toFixed(3);
        filterParts.push(
          `[${imageIndex}:v]format=rgba[cap${index}];` +
          `[${lastVideo}][cap${index}]overlay=0:0:enable='between(t,${start},${end})'[${overlayOut}]`
        );
        lastVideo = overlayOut;
      });

      progressCb = (percent) => options.onProgress?.(percent, "render");

      args.push(
        "-filter_complex", filterParts.join(";"),
        "-map", `[${lastVideo}]`,
        "-map", "0:a:0?",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        "-shortest",
        outputName
      );

      await instance.exec(args);
      const data = await instance.readFile(outputName);
      return new Blob([data], { type: "video/mp4" });
    } finally {
      await safeDelete(instance, inputName);
      await safeDelete(instance, outputName);
      for (const name of captionNames) await safeDelete(instance, name);
      progressCb = null;
    }
  });
}

/** Potong cepat tanpa re-encode. Dipakai hanya sebagai fallback internal. */
export async function trimVideo(
  file: File,
  startSec: number,
  durationSec: number,
  onProgress?: (p: number) => void
): Promise<Blob> {
  return runExclusive(async () => {
    progressCb = onProgress ?? null;
    const inputName = uniqueName("video-source", "mp4");
    const outputName = uniqueName("clip", "mp4");
    const instance = await getFFmpeg();

    try {
      const { fetchFile } = await loadLibs();
      await instance.writeFile(inputName, await fetchFile(file));

      await instance.exec([
        "-i", inputName,
        "-ss", String(Math.max(0, startSec)),
        "-t", String(Math.max(0.1, durationSec)),
        "-map", "0:v:0?",
        "-map", "0:a:0?",
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        outputName,
      ]);

      const data = await instance.readFile(outputName);
      return new Blob([data], { type: "video/mp4" });
    } finally {
      await safeDelete(instance, inputName);
      await safeDelete(instance, outputName);
      progressCb = null;
    }
  });
}

/**
 * Ekstrak audio 16 kHz mono ke M4A kecil, lalu pecah per 12 menit.
 * Dengan bitrate 32 kbps, tiap chunk jauh di bawah limit transkripsi umum.
 */
export async function extractAudioChunks(
  file: File,
  videoDuration: number,
  onProgress?: (percent: number, chunkIndex: number, totalChunks: number) => void
): Promise<AudioChunk[]> {
  return runExclusive(async () => {
    const { fetchFile } = await loadLibs();
    const instance = await getFFmpeg();
    const inputExt = file.name.split(".").pop()?.toLowerCase() || "mp4";
    const inputName = uniqueName("audio-source", inputExt.replace(/[^a-z0-9]/g, "") || "mp4");
    const totalChunks = Math.max(1, Math.ceil(videoDuration / AUDIO_CHUNK_SECONDS));
    const chunks: AudioChunk[] = [];

    try {
      await instance.writeFile(inputName, await fetchFile(file));

      for (let index = 0; index < totalChunks; index += 1) {
        const start = index * AUDIO_CHUNK_SECONDS;
        const duration = Math.min(AUDIO_CHUNK_SECONDS, Math.max(0.1, videoDuration - start));
        const outputName = uniqueName(`audio-${index + 1}`, "m4a");

        try {
          progressCb = (p) => {
            const overall = ((index + p / 100) / totalChunks) * 100;
            onProgress?.(Math.round(overall), index + 1, totalChunks);
          };

          await instance.exec([
            "-ss", String(start),
            "-i", inputName,
            "-t", String(duration),
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "aac",
            "-b:a", "32k",
            outputName,
          ]);

          const data = await instance.readFile(outputName);
          const blob = new Blob([data], { type: "audio/mp4" });
          chunks.push({
            file: new File([blob], `audio-part-${index + 1}.m4a`, { type: "audio/mp4" }),
            start,
            duration,
          });
        } finally {
          await safeDelete(instance, outputName);
        }
      }

      return chunks;
    } finally {
      await safeDelete(instance, inputName);
      progressCb = null;
    }
  });
}

/** Ambil metadata video yang diperlukan oleh crop/render. */
export function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca metadata video"));
    };
    video.src = url;
  });
}

export async function getVideoDuration(file: File): Promise<number> {
  return (await getVideoMetadata(file)).duration;
}
