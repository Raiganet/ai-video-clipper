import { Worker, UnrecoverableError } from "bullmq";
import Redis from "ioredis";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runFfmpegRender } from "./render-core.mjs";
import { downloadFile, uploadFile } from "./storage.mjs";

const REDIS_URL = String(process.env.REDIS_URL || "").trim();
if (!REDIS_URL) throw new Error("REDIS_URL wajib untuk cluster worker.");
const QUEUE = String(process.env.RENDER_QUEUE_NAME || "ai-clipper-render");
const CONCURRENCY = Math.max(1, Number(process.env.RENDER_WORKER_CONCURRENCY || 1));
const TMP = process.env.RENDER_TMP_DIR || "/tmp/ai-clipper-cluster";
const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const subscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker(QUEUE, async (job, _token, signal) => {
  const { sourceId, renderId, sourceKey, outputKey, body } = job.data || {};
  if (!sourceId || !renderId || !sourceKey || !outputKey) throw new UnrecoverableError("Render payload tidak lengkap.");
  const dir = join(TMP, `${job.id}-${randomUUID().slice(0, 6)}`);
  await mkdir(dir, { recursive: true });
  const sourcePath = join(dir, "source.bin");
  const outputPath = join(dir, "output.mp4");
  const assPath = join(dir, "captions.ass");
  try {
    if (await connection.get(`clipper:cancelled:${job.id}`)) throw new UnrecoverableError("Render dibatalkan.");
    await job.updateProgress(3);
    await downloadFile(sourceKey, sourcePath);
    await job.updateProgress(7);
    await runFfmpegRender({ body, sourcePath, outputPath, assPath, signal, onProgress: (percent) => { void job.updateProgress(Math.round(percent)); } });
    if (signal?.aborted) throw new UnrecoverableError("Render dibatalkan.");
    await job.updateProgress(97);
    await uploadFile(outputKey, outputPath, "video/mp4");
    await job.updateProgress(100);
    return { outputKey, renderId, sourceId };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw new UnrecoverableError("Render dibatalkan.");
    throw error;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}, { connection, concurrency: CONCURRENCY });

await subscriber.psubscribe("clipper:cancel:*");
subscriber.on("pmessage", (_pattern, channel) => {
  const id = channel.slice("clipper:cancel:".length);
  if (id) worker.cancelJob(id, "User requested cancellation");
});

worker.on("completed", job => console.log("render completed", job.id));
worker.on("failed", (job, error) => console.error("render failed", job?.id, error.message));
worker.on("error", error => console.error("worker error", error));

async function shutdown() { await worker.close(); await subscriber.quit(); await connection.quit(); process.exit(0); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
console.log(`AI Clipper cluster worker ready: queue=${QUEUE} concurrency=${CONCURRENCY}`);
