// lib/ffmpeg.ts
// FFmpeg.wasm dimuat 100% di browser via CDN agar Turbopack TIDAK mem-bundle
// dynamic import internal library (penyebab "too dynamic").

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFFmpeg = any;

// Dynamic import yang TIDAK terlihat bundler (tak ada tulisan `import(` di source).
const nativeImport = new Function("url", "return import(url)") as (
  url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

const FFMPEG_VERSION = "0.12.15";
const UTIL_VERSION = "0.12.2";
const CORE_VERSION = "0.12.10";

let ffmpeg: AnyFFmpeg | null = null;
let loadPromise: Promise<AnyFFmpeg> | null = null;
let libsPromise: Promise<{
  FFmpeg: any;
  fetchFile: (f: File) => Promise<Uint8Array>;
}> | null = null;
let progressCb: ((p: number) => void) | null = null;

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

/**
 * Worker WAJIB same-origin saat `new Worker(...)`. Kita buat blob same-origin
 * yang meng-import worker ESM asli dari CDN sebagai ES module. Import relatif
 * di dalam worker.js ("./const.js", "./errors.js") akan resolve ke CDN
 * (bukan ke blob), sehingga rantai modul utuh & CORS terpenuhi.
 */
function makeWorkerBlobURL(): string {
  const workerEntry = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`;
  const src = `import ${JSON.stringify(workerEntry)};`;
  return URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
}

/** Muat mesin FFmpeg sekali saja, ON-DEMAND. */
export async function getFFmpeg(): Promise<AnyFFmpeg> {
  if (ffmpeg) return ffmpeg;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const { FFmpeg } = await loadLibs();
    const instance = new FFmpeg();

    instance.on("progress", ({ progress }: { progress: number }) => {
      progressCb?.(Math.min(100, Math.max(0, Math.round(progress * 100))));
    });

    // ✅ KUNCI: nama opsinya `classWorkerURL` (BUKAN `workerURL`).
    const classWorkerURL = makeWorkerBlobURL();
    // core & wasm pakai URL CDN langsung (jangan di-blob) agar import.meta.url
    // di dalam core tetap menunjuk CDN -> file .wasm tidak 404.
    const coreURL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.js`;
    const wasmURL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm/ffmpeg-core.wasm`;

    // Penanda versi -> lihat di Console untuk memastikan kode terbaru aktif.
    // eslint-disable-next-line no-console
    console.log("[ffmpeg] v6 load", { classWorkerURL, coreURL });

    await instance.load({ classWorkerURL, coreURL, wasmURL });

    // eslint-disable-next-line no-console
    console.log("[ffmpeg] v6 ready");
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

    await instance.writeFile("input.mp4", await fetchFile(file));
    await instance.exec([
      "-i", "input.mp4",
      "-ss", String(startSec),
      "-t", String(durationSec),
      "-c", "copy",
      "output.mp4",
    ]);

    const data = await instance.readFile("output.mp4");
    await instance.deleteFile("input.mp4");
    await instance.deleteFile("output.mp4");

    return new Blob([data], { type: "video/mp4" });
  } finally {
    progressCb = null;
  }
}

/** Ambil durasi video (detik). */
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
