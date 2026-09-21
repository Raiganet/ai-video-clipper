// Smart face-aware framing untuk crop sosial.
// Deteksi wajah dijalankan di browser dengan MediaPipe Tasks Vision yang dimuat on-demand.

const nativeImport = new Function("url", "return import(url)") as (
  url: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => Promise<any>;

const MEDIAPIPE_VERSION = "1.0.1";
const MEDIAPIPE_ESM = `https://esm.sh/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let detectorPromise: Promise<any> | null = null;

export interface CropFocus {
  x: number;
  y: number;
  confidence: number;
  detectedSamples: number;
  totalSamples: number;
  mode: "face" | "center";
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const mod = await nativeImport(MEDIAPIPE_ESM);
      const vision = await mod.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      return mod.FaceDetector.createFromModelPath(vision, FACE_MODEL);
    })();
  }

  try {
    return await detectorPromise;
  } catch (error) {
    detectorPromise = null;
    throw error;
  }
}

function waitForEvent(target: EventTarget, eventName: string, timeoutMs = 12000) {
  return new Promise<void>((resolve, reject) => {
    let timer = 0;
    const done = () => {
      window.clearTimeout(timer);
      target.removeEventListener(eventName, done);
      resolve();
    };
    timer = window.setTimeout(() => {
      target.removeEventListener(eventName, done);
      reject(new Error(`Timeout saat menunggu ${eventName}`));
    }, timeoutMs);
    target.addEventListener(eventName, done, { once: true });
  });
}

async function seek(video: HTMLVideoElement, time: number) {
  const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
  if (Math.abs(video.currentTime - target) < 0.03) return;
  const waiting = waitForEvent(video, "seeked");
  video.currentTime = target;
  await waiting;
}

function median(values: number[]) {
  if (values.length === 0) return 0.5;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Sampling beberapa frame dalam sebuah klip, lalu memilih wajah terbesar per frame.
 * Hasil akhirnya adalah titik fokus stabil (median) agar framing tidak jitter.
 */
export async function detectFaceFocus(
  file: File,
  clipStart: number,
  clipDuration: number,
  onProgress?: (percent: number) => void
): Promise<CropFocus> {
  const fallback: CropFocus = {
    x: 0.5,
    y: 0.45,
    confidence: 0,
    detectedSamples: 0,
    totalSamples: 0,
    mode: "center",
  };

  if (typeof window === "undefined" || clipDuration <= 0) return fallback;

  const detector = await getDetector();
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await waitForEvent(video, "loadeddata");
    const sampleCount = Math.max(3, Math.min(7, Math.ceil(clipDuration / 5)));
    const xs: number[] = [];
    const ys: number[] = [];
    const scores: number[] = [];

    for (let index = 0; index < sampleCount; index += 1) {
      const ratio = sampleCount === 1 ? 0.5 : (index + 0.5) / sampleCount;
      const time = clipStart + clipDuration * ratio;
      await seek(video, time);

      // MediaPipe menerima HTMLVideoElement sebagai image source.
      const result = detector.detect(video);
      const detections = Array.isArray(result?.detections) ? result.detections : [];

      let best: {
        boundingBox?: { originX: number; originY: number; width: number; height: number };
        categories?: Array<{ score?: number }>;
      } | null = null;
      let bestArea = 0;
      for (const detection of detections) {
        const box = detection?.boundingBox;
        if (!box) continue;
        const area = Math.max(0, Number(box.width) || 0) * Math.max(0, Number(box.height) || 0);
        if (area > bestArea) {
          bestArea = area;
          best = detection;
        }
      }

      if (best?.boundingBox && video.videoWidth > 0 && video.videoHeight > 0) {
        const box = best.boundingBox;
        const centerX = (Number(box.originX) + Number(box.width) / 2) / video.videoWidth;
        const centerY = (Number(box.originY) + Number(box.height) / 2) / video.videoHeight;
        const score = Number(best.categories?.[0]?.score ?? 0.6);
        if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
          xs.push(clamp(centerX));
          // Sedikit ruang di bawah wajah untuk bahu/caption.
          ys.push(clamp(centerY + 0.04));
          scores.push(Number.isFinite(score) ? clamp(score) : 0.6);
        }
      }

      onProgress?.(Math.round(((index + 1) / sampleCount) * 100));
    }

    if (xs.length === 0) {
      return { ...fallback, totalSamples: sampleCount };
    }

    return {
      x: clamp(median(xs), 0.08, 0.92),
      y: clamp(median(ys), 0.12, 0.88),
      confidence: scores.reduce((sum, score) => sum + score, 0) / scores.length,
      detectedSamples: xs.length,
      totalSamples: sampleCount,
      mode: "face",
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
