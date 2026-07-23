// lib/ffmpeg.ts
// FFmpeg.wasm dimuat 100% di browser via CDN (esm.sh) agar Turbopack/webpack
// TIDAK mem-bundle dynamic import internal library — ini penyebab error
// "Cannot find module as expression is too dynamic".

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFFmpeg = any;

// Dynamic import yang TIDAK terlihat bundler (tak ada `import(` di source).
const nativeImport = new Function("url", "return import(url)") as (
  url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

let ffmpeg: AnyFFmpeg | null = null;
let loadPromise: Promise<AnyFFmpeg> | null = null;
let libsPromise: Promise<{
  FFmpeg: any;
  fetchFile: (f: File) => Promise<Uint8Array>;
  toBlobURL: (url: string, mime: string) => Promise<string>;
}> | null = null;
let progressCb: ((p: number) => void) | null = null;

function loadLibs() {
  if (!libsPromise) {
    libsPromise = (async () => {
      const [ffmpegMod, utilMod] = await Promise.all([
        nativeImport("https://esm.sh/@ffmpeg/ffmpeg@0.12.10"),
        nativeImport("https://esm.sh/@ffmpeg/util@0.13.0"),
      ]);
      return {
        FFmpeg: ffmpegMod.FFmpeg,
        fetchFile: utilMod.fetchFile,
        toBlobURL: utilMod.toBlobURL,
      };
    })();
  }
  return libsPromise;
}

/** Muat mesin FFmpeg sekali saja (on-demand, BUKAN saat halaman dibuka). */
export async function getFFmpeg(): Promise<AnyFFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg, toBlobURL } = await loadLibs();
    const instance = new FFmpeg();

    instance.on("progress", ({ progress }: { progress: number }) => {
      const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
      progressCb?.(pct);
    });

    // ESM core via blob same-origin → browser native import (bukan bundler)
    const base = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
    await instance.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpeg = instance;
    return instance;
  })();

  try {
    return await loadPromise;
  } catch (e) {
    loadPromise = null;
    libsPromise = null;
    throw e;
  }
}

/** Potong video dari startSec selama durationSec (tanpa re-encode = cepat). */
export async function trimVideo(
  file: File,
  startSec: number,
  durationSec: number,
  onProgress?: (p: number) => void
): Promise<Blob> {
  progressCb = onProgress ?? null;
  try {
    const { fetchFile } = await loadLibs();
    const instance = await getFFmpeg();

    const inputName = "input.mp4";
    const outputName = "output.mp4";

    await instance.writeFile(inputName, await fetchFile(file));
    await instance.exec([
      "-i", inputName,
      "-ss", String(startSec),
      "-t", String(durationSec),
      "-c", "copy",
      outputName,
    ]);

    const data = await instance.readFile(outputName);
    await instance.deleteFile(inputName);
    await instance.deleteFile(outputName);

    return new Blob([data], { type: "video/mp4" });
  } finally {
    progressCb = null;
  }
}

/** Ambil durasi video (detik) untuk membuat rentang klip yang masuk akal. */
export function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca metadata video"));
    };
    v.src = url;
  });
}