// Dynamic face-aware framing untuk crop sosial.
// MediaPipe dimuat on-demand di browser; video tidak diunggah ke server.

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

export interface CropTrackPoint {
  time: number;
  x: number;
  y: number;
  confidence: number;
}

export interface CropTrack extends CropFocus {
  points: CropTrackPoint[];
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

function smoothTrack(points: CropTrackPoint[]) {
  if (points.length < 3) return points;
  return points.map((point, index) => {
    const slice = points.slice(Math.max(0, index - 1), Math.min(points.length, index + 2));
    const totalWeight = slice.reduce((sum, item) => sum + Math.max(0.15, item.confidence), 0);
    return {
      ...point,
      x: clamp(slice.reduce((sum, item) => sum + item.x * Math.max(0.15, item.confidence), 0) / totalWeight, 0.06, 0.94),
      y: clamp(slice.reduce((sum, item) => sum + item.y * Math.max(0.15, item.confidence), 0) / totalWeight, 0.1, 0.9),
    };
  });
}

/**
 * Mengambil beberapa sampel wajah dan mempertahankan kontinuitas subjek antar frame.
 * Ini adalah active-subject heuristic, bukan lip/mouth speaking detector murni.
 */
export async function detectFaceTrack(
  file: File,
  clipStart: number,
  clipDuration: number,
  onProgress?: (percent: number) => void
): Promise<CropTrack> {
  const fallback: CropTrack = {
    x: 0.5,
    y: 0.45,
    confidence: 0,
    detectedSamples: 0,
    totalSamples: 0,
    mode: "center",
    points: [],
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
    const sampleCount = Math.max(4, Math.min(16, Math.ceil(clipDuration / 2.5)));
    const points: CropTrackPoint[] = [];
    let previous: CropTrackPoint | null = null;

    for (let index = 0; index < sampleCount; index += 1) {
      const ratio = sampleCount === 1 ? 0.5 : (index + 0.5) / sampleCount;
      const time = clipStart + clipDuration * ratio;
      await seek(video, time);

      const result = detector.detect(video);
      const detections = Array.isArray(result?.detections) ? result.detections : [];
      const candidates: Array<CropTrackPoint & { area: number }> = [];

      for (const detection of detections) {
        const box = detection?.boundingBox;
        if (!box || video.videoWidth <= 0 || video.videoHeight <= 0) continue;
        const width = Math.max(0, Number(box.width) || 0);
        const height = Math.max(0, Number(box.height) || 0);
        const centerX = (Number(box.originX) + width / 2) / video.videoWidth;
        const centerY = (Number(box.originY) + height / 2) / video.videoHeight;
        const score = Number(detection.categories?.[0]?.score ?? 0.6);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) continue;
        candidates.push({
          time: Math.max(0, time - clipStart),
          x: clamp(centerX),
          y: clamp(centerY + 0.04),
          confidence: Number.isFinite(score) ? clamp(score) : 0.6,
          area: (width * height) / Math.max(1, video.videoWidth * video.videoHeight),
        });
      }

      if (candidates.length > 0) {
        let best = candidates[0];
        let bestScore = -Infinity;
        for (const candidate of candidates) {
          const areaScore = Math.min(1, candidate.area * 10);
          const continuity = previous
            ? 1 - Math.min(1, Math.hypot(candidate.x - previous.x, candidate.y - previous.y) / 0.55)
            : 0.5;
          const score = areaScore * 0.5 + candidate.confidence * 0.25 + continuity * 0.25;
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
        const next: CropTrackPoint = { time: best.time, x: best.x, y: best.y, confidence: best.confidence };
        points.push(next);
        previous = next;
      } else if (previous) {
        // Pertahankan posisi terakhir agar crop tidak meloncat ke tengah hanya karena satu sampel gagal.
        points.push({ ...previous, time: Math.max(0, time - clipStart), confidence: previous.confidence * 0.75 });
      }

      onProgress?.(Math.round(((index + 1) / sampleCount) * 100));
    }

    if (points.length === 0) return { ...fallback, totalSamples: sampleCount };
    const smoothed = smoothTrack(points);
    const xs = smoothed.map((point) => point.x);
    const ys = smoothed.map((point) => point.y);
    const confidences = smoothed.map((point) => point.confidence);

    return {
      x: clamp(median(xs), 0.08, 0.92),
      y: clamp(median(ys), 0.12, 0.88),
      confidence: confidences.reduce((sum, score) => sum + score, 0) / confidences.length,
      detectedSamples: smoothed.length,
      totalSamples: sampleCount,
      mode: "face",
      points: smoothed,
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function detectFaceFocus(
  file: File,
  clipStart: number,
  clipDuration: number,
  onProgress?: (percent: number) => void
): Promise<CropFocus> {
  const track = await detectFaceTrack(file, clipStart, clipDuration, onProgress);
  const { points: _points, ...focus } = track;
  return focus;
}
