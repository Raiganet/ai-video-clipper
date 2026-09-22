import http from "node:http";
import { Transform } from "node:stream";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { deleteObject, objectInfo, objectStorageConfigured, outputObjectKey, presignOutputDownload, presignSourceUpload, sourceObjectKey, uploadStream } from "./storage.mjs";

const PORT = Number(process.env.PORT || 8787);
const SECRET = String(process.env.RENDER_WORKER_SECRET || "");
const REDIS_URL = String(process.env.REDIS_URL || "").trim();
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const QUEUE = String(process.env.RENDER_QUEUE_NAME || "ai-clipper-render");
const MAX_UPLOAD = Math.max(100, Number(process.env.MAX_UPLOAD_MB || 2048)) * 1024 * 1024;
const MAX_RETRIES = Math.max(0, Math.min(5, Number(process.env.RENDER_MAX_RETRIES || 2)));
const FILE_TTL_SEC = Math.max(1800, Number(process.env.RENDER_FILE_TTL_MINUTES || 180) * 60);
if (!REDIS_URL) throw new Error("REDIS_URL wajib untuk cluster API.");
if (SECRET.length < 24) throw new Error("RENDER_WORKER_SECRET minimal 24 karakter.");
if (!objectStorageConfigured()) throw new Error("Object storage S3/R2 wajib untuk cluster mode.");

const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(QUEUE, { connection });

function cors() { return { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name, X-Source-Key", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", Vary: "Origin" }; }
function json(res, status, body, extra = {}) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(), ...extra }); res.end(JSON.stringify(body)); }
function safeId(value) { return /^[a-zA-Z0-9_-]{6,100}$/.test(value || "") ? value : null; }
function safeEqual(a, b) { const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); }
function verifyToken(req, sourceId) {
  const raw = String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""); const [body, sig] = raw.split("."); if (!body || !sig) return false;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url"); if (!safeEqual(expected, sig)) return false;
  try { const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); return payload.jobId === sourceId && Number(payload.exp) > Math.floor(Date.now() / 1000); } catch { return false; }
}
function readJson(req, max = 1_000_000) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on("data", c => { size += c.length; if (size > max) { reject(new Error("BODY_TOO_LARGE")); req.destroy(); return; } chunks.push(c); }); req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } }); req.on("error", reject); }); }

function limitedStream(maxBytes) {
  let bytes = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) return callback(new Error("UPLOAD_TOO_LARGE"));
      callback(null, chunk);
    },
  });
}

function sourceMetaKey(sourceId) { return `clipper:source:${sourceId}`; }
function jobId(sourceId, renderId) { return `${sourceId}--${renderId}`; }
function normalizeState(state) { if (state === "waiting" || state === "delayed" || state === "prioritized" || state === "waiting-children") return "queued"; if (state === "active") return "running"; return state; }
async function publicJob(job) {
  const state = await job.getState();
  const progress = typeof job.progress === "number" ? job.progress : Number(job.progress?.percent || 0);
  return { renderId: job.data?.renderId, sourceId: job.data?.sourceId, status: normalizeState(state), progress: Math.max(0, Math.min(100, Math.round(progress || 0))), phase: state === "active" ? "rendering" : normalizeState(state), attempt: job.attemptsMade + (state === "active" ? 1 : 0), maxAttempts: Number(job.opts?.attempts || MAX_RETRIES + 1), error: job.failedReason || null, createdAt: job.timestamp, updatedAt: job.finishedOn || job.processedOn || job.timestamp, outputReady: state === "completed" };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors()); return res.end(); }
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    try { const counts = await queue.getJobCounts("waiting", "active", "delayed", "completed", "failed"); return json(res, 200, { ok: true, mode: "bullmq", queue: QUEUE, storage: "s3-compatible", counts, maxRetries: MAX_RETRIES }); }
    catch (error) { return json(res, 503, { ok: false, error: error instanceof Error ? error.message : "Queue unavailable" }); }
  }

  let match = url.pathname.match(/^\/v3\/uploads\/([^/]+)$/);
  if (match) {
    const sourceId = safeId(match[1]); if (!sourceId) return json(res, 400, { error: "Invalid source id" }); if (!verifyToken(req, sourceId)) return json(res, 401, { error: "Unauthorized" });
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
    try {
      const body = await readJson(req, 50_000); const size = Math.max(0, Number(body.size || 0)); if (size > MAX_UPLOAD) return json(res, 413, { error: "File terlalu besar" });
      const contentType = String(body.contentType || "application/octet-stream").slice(0, 120);
      const signed = await presignSourceUpload(sourceId, contentType, 15 * 60);
      await connection.set(sourceMetaKey(sourceId), JSON.stringify({ key: signed.key, size, contentType, createdAt: Date.now() }), "EX", FILE_TTL_SEC);
      return json(res, 200, { success: true, uploadUrl: signed.url, sourceKey: signed.key, expiresAt: Date.now() + signed.expiresIn * 1000 });
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : "Presign gagal" }); }
  }

  match = url.pathname.match(/^\/v2\/(files|jobs)\/([^/]+)$/);
  if (match) {
    const kind = match[1], sourceId = safeId(match[2]); if (!sourceId) return json(res, 400, { error: "Invalid source id" }); if (!verifyToken(req, sourceId)) return json(res, 401, { error: "Unauthorized" });
    try {
      if (kind === "files" && req.method === "PUT") {
        const declared = Number(req.headers["content-length"] || 0); if (declared > MAX_UPLOAD) return json(res, 413, { error: "File terlalu besar" });
        const key = sourceObjectKey(sourceId);
        try {
          await uploadStream(key, req.pipe(limitedStream(MAX_UPLOAD)), String(req.headers["content-type"] || "application/octet-stream"));
        } catch (error) {
          await deleteObject(key).catch(() => undefined);
          if (error instanceof Error && error.message === "UPLOAD_TOO_LARGE") return json(res, 413, { error: "File terlalu besar" });
          throw error;
        }
        const info = await objectInfo(key);
        await connection.set(sourceMetaKey(sourceId), JSON.stringify({ key, size: info.size, createdAt: Date.now() }), "EX", FILE_TTL_SEC);
        return json(res, 200, { success: true, bytes: info.size, storage: "s3-compatible" });
      }
      if (kind === "jobs" && req.method === "POST") {
        const sourceMeta = await connection.get(sourceMetaKey(sourceId)); if (!sourceMeta) return json(res, 404, { error: "Source belum diupload atau sudah expired." });
        const body = await readJson(req); const renderId = `job-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`; const sourceKey = JSON.parse(sourceMeta).key;
        const info = await objectInfo(sourceKey);
        if (!info.exists) return json(res, 404, { error: "Source object belum tersedia. Upload ulang video." });
        if (info.size > MAX_UPLOAD) { await deleteObject(sourceKey).catch(() => undefined); return json(res, 413, { error: "Source object melebihi batas upload." }); }
        const outputKey = outputObjectKey(sourceId, renderId);
        const job = await queue.add("render", { sourceId, renderId, sourceKey, outputKey, body }, { jobId: jobId(sourceId, renderId), attempts: MAX_RETRIES + 1, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { age: FILE_TTL_SEC }, removeOnFail: { age: FILE_TTL_SEC } });
        return json(res, 202, { success: true, ...(await publicJob(job)) });
      }
      return json(res, 405, { error: "Method not allowed" });
    } catch (error) { console.error(error); return json(res, 500, { error: error instanceof Error ? error.message : "Cluster worker error" }); }
  }

  match = url.pathname.match(/^\/v2\/(jobs|output)\/([^/]+)\/([^/]+)$/);
  if (match) {
    const kind = match[1], sourceId = safeId(match[2]), renderId = safeId(match[3]); if (!sourceId || !renderId) return json(res, 400, { error: "Invalid job id" }); if (!verifyToken(req, sourceId)) return json(res, 401, { error: "Unauthorized" });
    const job = await queue.getJob(jobId(sourceId, renderId)); if (!job) return json(res, 404, { error: "Render job tidak ditemukan atau sudah expired." });
    if (kind === "jobs" && req.method === "GET") return json(res, 200, { success: true, ...(await publicJob(job)) });
    if (kind === "jobs" && req.method === "DELETE") {
      const state = await job.getState();
      if (state === "active") {
        await connection.publish(`clipper:cancel:${job.id}`, "user");
        await connection.set(`clipper:cancelled:${job.id}`, "1", "EX", 3600);
      } else if (!["completed", "failed"].includes(state)) {
        await job.remove().catch(() => undefined);
      }
      return json(res, 200, { success: true, status: "cancelled", renderId, sourceId });
    }
    if (kind === "output" && req.method === "GET") {
      if (await job.getState() !== "completed") return json(res, 409, { error: "Output belum siap", ...(await publicJob(job)) });
      const outputKey = String(job.returnvalue?.outputKey || job.data?.outputKey || ""); if (!outputKey) return json(res, 404, { error: "Output key tidak ditemukan." });
      const signed = await presignOutputDownload(outputKey, 10 * 60); res.writeHead(302, { Location: signed.url, "Cache-Control": "private, no-store", ...cors() }); return res.end();
    }
    return json(res, 405, { error: "Method not allowed" });
  }

  return json(res, 404, { error: "Not found" });
});

async function shutdown() { await queue.close(); await connection.quit(); server.close(() => process.exit(0)); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
server.listen(PORT, () => console.log(`AI Clipper Stage 11 cluster API listening on :${PORT}`));
