// lib/ffmpeg.ts
// FFmpeg.wasm dimuat 100% di browser via CDN agar Turbopack/webpack TIDAK
// mem-bundle dynamic import internal library (penyebab "too dynamic").

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
  toBlobURL: (url: string, mime: string) => Promise<string>;
}> | null = null;
let progressCb: ((p: number) => void) | null = null;

function loadLibs() {
  if (!libsPromise) {
    libsPromise = (async () => {
      const [ffmpegMod, utilMod] = await Promise.all([
        nativeImport(`https://esm.sh/@ffmpeg/ffmpeg@${FFMPEG_VERSION}`),
        nativeImport(`https://esm.sh/@ffmpeg/util@${UTIL_VERSION}`),
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

/**
 * Worker komunikasi WAJIB same-origin. Kita buat blob same-origin yang
 * meng-import worker ESM dari CDN sebagai ES module. Import relatif di dalam
 * worker.js (./const.js, ./errors.js) akan resolve ke CDN (bukan ke blob),
 * sehingga rantai modul tetap utuh & CORS terpenuhi.
 */
function makeSameOriginWorkerURL(): string {
  const workerEntry = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`;
  const source = `import ${JSON.stringify(workerEntry)};`;
  const blob = new Blob([source], { type: "text/javascript" });
  return URL.createObjectURL(blob);
}

/** Muat mesin FFmpeg sekali saja, ON-DEMAND (bukan saat halaman dibuka). */
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

    // Core (ESM) via blob same-origin -> dipakai worker lewat dynamic import().
    const coreBase = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
    const coreURL = await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm");

    // ✅ KUNCI PERBAIKAN: worker same-origin (menghilangkan SecurityError).
    const workerURL = makeSameOriginWorkerURL();

    await instance.load({ coreURL, wasmURL, workerURL });

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
