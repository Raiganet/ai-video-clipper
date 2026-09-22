import { runFfmpegRender } from "./render-core.mjs";
import http from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8787);
const SECRET = String(process.env.RENDER_WORKER_SECRET || "");
const TMP = process.env.RENDER_TMP_DIR || "/tmp/ai-clipper-worker";
const MAX_UPLOAD = Math.max(100, Number(process.env.MAX_UPLOAD_MB || 2048)) * 1024 * 1024;
const MAX_CONCURRENT = Math.max(1, Number(process.env.MAX_CONCURRENT_RENDERS || 2));
const MAX_RETRIES = Math.max(0, Math.min(5, Number(process.env.RENDER_MAX_RETRIES || 2)));
const TTL_MS = Math.max(30, Number(process.env.RENDER_FILE_TTL_MINUTES || 180)) * 60_000;
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const FONT_FILE = process.env.FONT_FILE || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const jobs = new Map();
const queue = [];
let activeRenders = 0;
mkdirSync(TMP, { recursive: true });

function cors() { return { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "Authorization, Content-Type, X-File-Name", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Vary": "Origin" }; }
function json(res, status, body, extra = {}) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(), ...extra }); res.end(JSON.stringify(body)); }
function safeId(value) { return /^[a-zA-Z0-9_-]{6,100}$/.test(value || "") ? value : null; }
function safeEqual(a, b) { const aa = Buffer.from(a), bb = Buffer.from(b); return aa.length === bb.length && timingSafeEqual(aa, bb); }
function verifyToken(req, sourceId) {
  const raw = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const [body, sig] = raw.split("."); if (!body || !sig || SECRET.length < 24) return false;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url"); if (!safeEqual(expected, sig)) return false;
  try { const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); return payload.jobId === sourceId && Number(payload.exp) > Math.floor(Date.now() / 1000); } catch { return false; }
}
function readJson(req, max = 1_000_000) { return new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on("data", c => { size += c.length; if (size > max) { reject(new Error("BODY_TOO_LARGE")); req.destroy(); return; } chunks.push(c); }); req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(e); } }); req.on("error", reject); }); }
function even(n) { n = Math.max(2, Math.round(n)); return n % 2 === 0 ? n : n - 1; }
function outputSize(ratio, w, h) { if (ratio === "9:16" || ratio === "auto") return { w: 720, h: 1280, ratio: "9:16" }; if (ratio === "1:1") return { w: 720, h: 720, ratio }; if (ratio === "16:9") return { w: 1280, h: 720, ratio }; const scale = Math.min(1, 1280 / Math.max(w || 1280, h || 720)); return { w: even((w || 1280) * scale), h: even((h || 720) * scale), ratio: "original" }; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function cropExpr(points, axis, sw, sh, ow, oh, fallback) { const max = axis === "x" ? Math.max(0, sw - ow) : Math.max(0, sh - oh); if (max <= 0) return "0"; const ss = axis === "x" ? sw : sh, os = axis === "x" ? ow : oh; const fp = Math.round(clamp(ss * fallback - os / 2, 0, max)); const usable = (Array.isArray(points) ? points : []).filter(p => Number.isFinite(p?.time) && Number.isFinite(p?.[axis])).slice(0, 24).map(p => ({ time: Math.max(0, p.time), px: Math.round(clamp(ss * p[axis] - os / 2, 0, max)) })); if (usable.length < 2) return String(usable[0]?.px ?? fp); let ex = String(usable.at(-1).px); for (let i = usable.length - 2; i >= 0; i--) { const a = usable[i], b = usable[i + 1], span = Math.max(.05, b.time - a.time), d = b.px - a.px, interp = d === 0 ? String(a.px) : `${a.px}+(${d})*(t-${a.time.toFixed(3)})/${span.toFixed(3)}`; ex = `if(lt(t,${b.time.toFixed(3)}),${interp},${ex})`; } return ex; }
function assTime(sec) { sec = Math.max(0, Number(sec) || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`; }
function assText(value) { return String(value || "").replace(/[{}]/g, "").replace(/\r?\n/g, " ").replace(/,/g, "，"); }
function assCueText(cue) {
  const speaker = Number.isFinite(cue?.speaker) ? `SPEAKER ${Number(cue.speaker) + 1} • ` : "";
  const clean = assText(cue?.text || "");
  if (!Number.isFinite(cue?.activeWordIndex)) return speaker + clean;
  const words = clean.split(/\s+/).filter(Boolean); const active = clamp(Math.round(cue.activeWordIndex), 0, Math.max(0, words.length - 1));
  return speaker + words.map((word, index) => index === active ? `{\\c&H0000FFFF&}${word}{\\c&H00FFFFFF&}` : word).join(" ");
}
function makeAss(cues, outPath, width, height) { const fs = Math.max(34, Math.round(width * .055)); const lines = (Array.isArray(cues) ? cues : []).slice(0, 320).map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assCueText(c)}`); const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,DejaVu Sans,${fs},&H00FFFFFF,&H0000FFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,60,60,80,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${lines.join("\n")}\n`; writeFileSync(outPath, ass); return lines.length > 0; }
function escapeDrawtext(v) { return String(v || "").replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%"); }
function parseFfmpegTime(line) { const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/); if (!m) return null; return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]); }
function sourcePath(id) { return join(TMP, `${id}.source`); }
function outputPath(sourceId, renderId) { return join(TMP, `${sourceId}-${renderId}.mp4`); }
function assPath(sourceId, renderId) { return join(TMP, `${sourceId}-${renderId}.ass`); }
function publicJob(job) { return { renderId: job.renderId, sourceId: job.sourceId, status: job.status, progress: Math.round(job.progress), phase: job.phase, attempt: job.attempt, maxAttempts: MAX_RETRIES + 1, error: job.error || null, createdAt: job.createdAt, updatedAt: job.updatedAt, expiresAt: job.expiresAt, outputReady: job.status === "completed" }; }

function renderArgs(job) {
  const body = job.body; const start = Math.max(0, Number(body.start) || 0), duration = clamp(Number(body.duration) || 1, .1, 1800); const sw = Math.max(2, Number(body.sourceWidth) || 1280), sh = Math.max(2, Number(body.sourceHeight) || 720); const size = outputSize(String(body.ratio || "auto"), sw, sh); const focus = { x: clamp(Number(body.cropFocus?.x) || .5, .05, .95), y: clamp(Number(body.cropFocus?.y) || .5, .05, .95) }; const vf = [];
  if (size.ratio === "original") vf.push(`scale=${size.w}:${size.h},setsar=1`); else { const f = Math.max(size.w / sw, size.h / sh), scaledW = even(sw * f), scaledH = even(sh * f), cx = cropExpr(body.cropTrack, "x", scaledW, scaledH, size.w, size.h, focus.x), cy = cropExpr(body.cropTrack, "y", scaledW, scaledH, size.w, size.h, focus.y); vf.push(`scale=${scaledW}:${scaledH},crop=${size.w}:${size.h}:x='${cx}':y='${cy}',setsar=1`); }
  const ass = assPath(job.sourceId, job.renderId); const hasAss = makeAss(body.captionCues, ass, size.w, size.h); if (hasAss) vf.push(`subtitles='${ass.replace(/'/g, "\\'")}'`);
  const branding = body.branding || {}; if (branding.enabled && existsSync(FONT_FILE)) { const text = [branding.name, branding.handle].filter(Boolean).join("  "); if (text) { const pos = String(branding.position || "top-right"), x = pos.includes("right") ? "w-tw-36" : "36", y = pos.startsWith("bottom") ? "h-th-36" : "36"; vf.push(`drawtext=fontfile='${FONT_FILE.replace(/'/g, "\\'")}':text='${escapeDrawtext(text)}':fontcolor=white@${clamp(Number(branding.opacity) || .9, .2, 1)}:fontsize=${Math.max(18, Math.round(Math.min(size.w, size.h) * .025 * (Number(branding.scale) || 1)))}:box=${branding.background === false ? 0 : 1}:boxcolor=black@0.5:boxborderw=12:x=${x}:y=${y}`); } }
  return { duration, args: ["-y", "-ss", String(start), "-t", String(duration), "-i", sourcePath(job.sourceId), "-vf", vf.join(","), "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputPath(job.sourceId, job.renderId)] };
}

function runFfmpegJob(job) {
  const controller = new AbortController();
  job.controller = controller;
  return runFfmpegRender({
    body: job.body,
    sourcePath: sourcePath(job.sourceId),
    outputPath: outputPath(job.sourceId, job.renderId),
    assPath: assPath(job.sourceId, job.renderId),
    signal: controller.signal,
    onProgress: (percent) => { job.progress = clamp(percent, 2, 99); job.phase = job.attempt > 1 ? "retrying" : "rendering"; job.updatedAt = Date.now(); },
  }).finally(() => { job.controller = null; });
}

function processQueue() {
  while (activeRenders < MAX_CONCURRENT && queue.length > 0) {
    const key = queue.shift(); const job = jobs.get(key); if (!job || job.status !== "queued") continue;
    activeRenders += 1; job.status = "running"; job.phase = job.attempt > 0 ? "retrying" : "rendering"; job.progress = Math.max(job.progress, 5); job.attempt += 1; job.updatedAt = Date.now();
    runFfmpegJob(job).then(() => { job.status = "completed"; job.phase = "completed"; job.progress = 100; job.error = null; job.updatedAt = Date.now(); }).catch(error => { job.error = error instanceof Error ? error.message.slice(-12000) : "Render gagal"; job.updatedAt = Date.now(); if (job.attempt <= MAX_RETRIES && !job.cancelled) { job.status = "queued"; job.phase = "retrying"; job.progress = 2; queue.push(key); } else { job.status = job.cancelled ? "cancelled" : "failed"; job.phase = job.status; } }).finally(() => { job.process = null; activeRenders -= 1; processQueue(); });
  }
}

function createQueuedJob(sourceId, body) {
  const renderId = `job-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`; const key = `${sourceId}:${renderId}`; const now = Date.now();
  const job = { sourceId, renderId, body, status: "queued", phase: "queued", progress: 1, attempt: 0, error: null, cancelled: false, process: null, controller: null, createdAt: now, updatedAt: now, expiresAt: now + TTL_MS };
  jobs.set(key, job); queue.push(key); processQueue(); return job;
}

async function handleLegacyRender(sourceId, body) {
  const job = createQueuedJob(sourceId, body);
  while (["queued", "running"].includes(job.status)) await new Promise(resolve => setTimeout(resolve, 250));
  if (job.status !== "completed") throw new Error(job.error || "Render worker gagal");
  return job;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors()); return res.end(); }
  const url = new URL(req.url || "/", "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, activeRenders, queued: queue.length, jobs: jobs.size, maxConcurrent: MAX_CONCURRENT, maxRetries: MAX_RETRIES, ttlMinutes: Math.round(TTL_MS / 60_000) });

  // Stage 11 local fallback API: source session + render job ID.
  let match = url.pathname.match(/^\/v2\/(files|jobs)\/([^/]+)$/);
  if (match) {
    const kind = match[1], sourceId = safeId(match[2]); if (!sourceId) return json(res, 400, { error: "Invalid source id" }); if (!verifyToken(req, sourceId)) return json(res, 401, { error: "Unauthorized" });
    try {
      if (kind === "files" && req.method === "PUT") {
        const declared = Number(req.headers["content-length"] || 0); if (declared > MAX_UPLOAD) return json(res, 413, { error: "File terlalu besar" });
        let received = 0; const target = sourcePath(sourceId); const ws = createWriteStream(target); req.on("data", c => { received += c.length; if (received > MAX_UPLOAD) req.destroy(new Error("UPLOAD_TOO_LARGE")); }); req.pipe(ws); await new Promise((resolve, reject) => { ws.on("finish", resolve); ws.on("error", reject); req.on("error", reject); }); return json(res, 200, { success: true, bytes: received, expiresAt: Date.now() + TTL_MS });
      }
      if (kind === "jobs" && req.method === "POST") {
        if (!existsSync(sourcePath(sourceId))) return json(res, 404, { error: "Source belum diupload" }); const body = await readJson(req); const job = createQueuedJob(sourceId, body); return json(res, 202, { success: true, ...publicJob(job) });
      }
      return json(res, 405, { error: "Method not allowed" });
    } catch (error) { console.error(error); return json(res, 500, { error: error instanceof Error ? error.message : "Worker error" }); }
  }

  match = url.pathname.match(/^\/v2\/(jobs|output)\/([^/]+)\/([^/]+)$/);
  if (match) {
    const kind = match[1], sourceId = safeId(match[2]), renderId = safeId(match[3]); if (!sourceId || !renderId) return json(res, 400, { error: "Invalid job id" }); if (!verifyToken(req, sourceId)) return json(res, 401, { error: "Unauthorized" }); const job = jobs.get(`${sourceId}:${renderId}`);
    if (!job) return json(res, 404, { error: "Render job tidak ditemukan atau sudah expired." });
    if (kind === "jobs" && req.method === "GET") return json(res, 200, { success: true, ...publicJob(job) });
    if (kind === "jobs" && req.method === "DELETE") { job.cancelled = true; job.controller?.abort(); if (job.status === "queued") { job.status = "cancelled"; job.phase = "cancelled"; } job.updatedAt = Date.now(); return json(res, 200, { success: true, ...publicJob(job) }); }
    if (kind === "output" && req.method === "GET") { const output = outputPath(sourceId, renderId); if (job.status !== "completed" || !existsSync(output)) return json(res, 409, { error: "Output belum siap", ...publicJob(job) }); res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": statSync(output).size, "Cache-Control": "private, no-store", ...cors() }); return createReadStream(output).pipe(res); }
    return json(res, 405, { error: "Method not allowed" });
  }

  // Backward-compatible Stage 8 API.
  match = url.pathname.match(/^\/v1\/(files|render|output)\/([^/]+)$/);
  if (match) {
    const kind = match[1], sourceId = safeId(match[2]); if (!sourceId) return json(res, 400, { error: "Invalid job id" }); if (!verifyToken(req, sourceId)) return json(res, 401, { error: "Unauthorized" });
    try {
      if (kind === "files" && req.method === "PUT") { const declared = Number(req.headers["content-length"] || 0); if (declared > MAX_UPLOAD) return json(res, 413, { error: "File terlalu besar" }); let received = 0; const ws = createWriteStream(sourcePath(sourceId)); req.on("data", c => { received += c.length; if (received > MAX_UPLOAD) req.destroy(new Error("UPLOAD_TOO_LARGE")); }); req.pipe(ws); await new Promise((resolve, reject) => { ws.on("finish", resolve); ws.on("error", reject); req.on("error", reject); }); return json(res, 200, { success: true, bytes: received }); }
      if (kind === "render" && req.method === "POST") { const body = await readJson(req); if (!existsSync(sourcePath(sourceId))) return json(res, 404, { error: "Source belum diupload" }); const job = await handleLegacyRender(sourceId, body); return json(res, 200, { success: true, outputUrl: `/v2/output/${sourceId}/${job.renderId}` }); }
      return json(res, 410, { error: "Gunakan API /v2 untuk output render." });
    } catch (error) { return json(res, 500, { error: error instanceof Error ? error.message : "Worker error" }); }
  }
  return json(res, 404, { error: "Not found" });
});

function cleanup() {
  const now = Date.now();
  for (const [key, job] of jobs) {
    if (job.expiresAt < now && !["running", "queued"].includes(job.status)) { for (const path of [outputPath(job.sourceId, job.renderId), assPath(job.sourceId, job.renderId)]) { try { if (existsSync(path)) unlinkSync(path); } catch {} } jobs.delete(key); }
  }
  const cutoff = now - TTL_MS;
  for (const name of readdirSync(TMP)) { const p = join(TMP, name); try { if (statSync(p).mtimeMs < cutoff) unlinkSync(p); } catch {} }
}
setInterval(cleanup, Math.min(30 * 60_000, Math.max(5 * 60_000, Math.floor(TTL_MS / 4)))).unref();
server.listen(PORT, () => console.log(`AI Clipper Stage 11 local render worker listening on :${PORT}`));
