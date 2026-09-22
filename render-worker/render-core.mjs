import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const FONT_FILE = process.env.FONT_FILE || "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
function even(n) { n = Math.max(2, Math.round(n)); return n % 2 === 0 ? n : n - 1; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function outputSize(ratio, w, h) { if (ratio === "9:16" || ratio === "auto") return { w: 720, h: 1280, ratio: "9:16" }; if (ratio === "1:1") return { w: 720, h: 720, ratio }; if (ratio === "16:9") return { w: 1280, h: 720, ratio }; const scale = Math.min(1, 1280 / Math.max(w || 1280, h || 720)); return { w: even((w || 1280) * scale), h: even((h || 720) * scale), ratio: "original" }; }
function cropExpr(points, axis, sw, sh, ow, oh, fallback) { const max = axis === "x" ? Math.max(0, sw - ow) : Math.max(0, sh - oh); if (max <= 0) return "0"; const ss = axis === "x" ? sw : sh, os = axis === "x" ? ow : oh; const fp = Math.round(clamp(ss * fallback - os / 2, 0, max)); const usable = (Array.isArray(points) ? points : []).filter(p => Number.isFinite(p?.time) && Number.isFinite(p?.[axis])).slice(0, 24).map(p => ({ time: Math.max(0, p.time), px: Math.round(clamp(ss * p[axis] - os / 2, 0, max)) })); if (usable.length < 2) return String(usable[0]?.px ?? fp); let ex = String(usable.at(-1).px); for (let i = usable.length - 2; i >= 0; i--) { const a = usable[i], b = usable[i + 1], span = Math.max(.05, b.time - a.time), d = b.px - a.px, interp = d === 0 ? String(a.px) : `${a.px}+(${d})*(t-${a.time.toFixed(3)})/${span.toFixed(3)}`; ex = `if(lt(t,${b.time.toFixed(3)}),${interp},${ex})`; } return ex; }
function assTime(sec) { sec = Math.max(0, Number(sec) || 0); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`; }
function assText(value) { return String(value || "").replace(/[{}]/g, "").replace(/\r?\n/g, " ").replace(/,/g, "，"); }
function assCueText(cue) { const speaker = Number.isFinite(cue?.speaker) ? `SPEAKER ${Number(cue.speaker) + 1} • ` : ""; const clean = assText(cue?.text || ""); if (!Number.isFinite(cue?.activeWordIndex)) return speaker + clean; const words = clean.split(/\s+/).filter(Boolean); const active = clamp(Math.round(cue.activeWordIndex), 0, Math.max(0, words.length - 1)); return speaker + words.map((word, index) => index === active ? `{\\c&H0000FFFF&}${word}{\\c&H00FFFFFF&}` : word).join(" "); }
function makeAss(cues, outPath, width, height) { const fs = Math.max(34, Math.round(width * .055)); const lines = (Array.isArray(cues) ? cues : []).slice(0, 500).map(c => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${assCueText(c)}`); const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,DejaVu Sans,${fs},&H00FFFFFF,&H0000FFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,4,1,2,60,60,80,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${lines.join("\n")}\n`; writeFileSync(outPath, ass); return lines.length > 0; }
function escapeDrawtext(v) { return String(v || "").replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'").replace(/%/g, "\\%"); }
function parseFfmpegTime(line) { const m = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/); return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null; }
function logoPathFromAss(assPath) { return `${assPath}.logo.png`; }
function writeLogo(dataUrl, path) { const match = String(dataUrl || "").match(/^data:image\/(?:png|webp|jpeg|jpg);base64,(.+)$/i); if (!match) return false; const data = Buffer.from(match[1], "base64"); if (!data.length || data.length > 300_000) return false; writeFileSync(path, data); return true; }

export function buildRenderArgs({ body, sourcePath, outputPath, assPath }) {
  const start = Math.max(0, Number(body.start) || 0), duration = clamp(Number(body.duration) || 1, .1, 1800);
  const sw = Math.max(2, Number(body.sourceWidth) || 1280), sh = Math.max(2, Number(body.sourceHeight) || 720);
  const size = outputSize(String(body.ratio || "auto"), sw, sh);
  const focus = { x: clamp(Number(body.cropFocus?.x) || .5, .05, .95), y: clamp(Number(body.cropFocus?.y) || .5, .05, .95) };
  const vf = [];
  if (size.ratio === "original") vf.push(`scale=${size.w}:${size.h},setsar=1`);
  else { const f = Math.max(size.w / sw, size.h / sh), scaledW = even(sw * f), scaledH = even(sh * f), cx = cropExpr(body.cropTrack, "x", scaledW, scaledH, size.w, size.h, focus.x), cy = cropExpr(body.cropTrack, "y", scaledW, scaledH, size.w, size.h, focus.y); vf.push(`scale=${scaledW}:${scaledH},crop=${size.w}:${size.h}:x='${cx}':y='${cy}',setsar=1`); }
  if (makeAss(body.captionCues, assPath, size.w, size.h)) vf.push(`subtitles='${assPath.replace(/'/g, "\\'")}'`);
  const branding = body.branding || {};
  if (branding.enabled && existsSync(FONT_FILE)) { const text = [branding.name, branding.handle].filter(Boolean).join("  "); if (text) { const pos = String(branding.position || "top-right"), x = pos.includes("right") ? "w-tw-36" : "36", y = pos.startsWith("bottom") ? "h-th-36" : "36"; vf.push(`drawtext=fontfile='${FONT_FILE.replace(/'/g, "\\'")}':text='${escapeDrawtext(text)}':fontcolor=white@${clamp(Number(branding.opacity) || .9, .2, 1)}:fontsize=${Math.max(18, Math.round(Math.min(size.w, size.h) * .025 * (Number(branding.scale) || 1)))}:box=${branding.background === false ? 0 : 1}:boxcolor=black@0.5:boxborderw=12:x=${x}:y=${y}`); } }
  const cta = body.ctaOverlay || {};
  if (cta.enabled && String(cta.text || "").trim() && existsSync(FONT_FILE)) { const d = clamp(Number(cta.duration) || 3.5, 1.5, 8), startAt = Math.max(0, duration - d).toFixed(3), main = escapeDrawtext(String(cta.text || "").slice(0, 180)); vf.push(`drawtext=fontfile='${FONT_FILE.replace(/'/g, "\\'")}':text='${main}':fontcolor=white:fontsize=${Math.max(28, Math.round(size.w * .052))}:x=(w-tw)/2:y=h*0.60:box=1:boxcolor=black@0.72:boxborderw=24:enable='gte(t,${startAt})'`); }

  const logoPath = logoPathFromAss(assPath);
  const hasLogo = Boolean(branding.enabled && branding.logoDataUrl && writeLogo(branding.logoDataUrl, logoPath));
  const args = ["-y", "-ss", String(start), "-t", String(duration), "-i", sourcePath];
  if (hasLogo) args.push("-loop", "1", "-i", logoPath);
  if (hasLogo) {
    const logoW = Math.max(48, Math.round(Math.min(size.w, size.h) * .10 * clamp(Number(branding.scale) || 1, .65, 1.5)));
    const pos = String(branding.position || "top-right");
    const x = pos.includes("right") ? "W-w-28" : "28";
    const y = pos.startsWith("bottom") ? "H-h-28" : "28";
    const opacity = clamp(Number(branding.opacity) || .9, .2, 1);
    const chain = `[0:v]${vf.join(",")}[base];[1:v]scale=${logoW}:-1,format=rgba,colorchannelmixer=aa=${opacity}[logo];[base][logo]overlay=x=${x}:y=${y}:shortest=1[vout]`;
    args.push("-filter_complex", chain, "-map", "[vout]");
  } else {
    args.push("-vf", vf.join(","), "-map", "0:v:0");
  }
  args.push("-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputPath);
  return { duration, args, logoPath: hasLogo ? logoPath : null };
}

export function runFfmpegRender({ body, sourcePath, outputPath, assPath, signal, onProgress }) {
  const { duration, args, logoPath } = buildRenderArgs({ body, sourcePath, outputPath, assPath });
  return new Promise((resolve, reject) => {
    const cp = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; let settled = false;
    const cleanup = () => { if (logoPath) { try { if (existsSync(logoPath)) unlinkSync(logoPath); } catch {} } };
    const abort = () => { if (!settled) cp.kill("SIGTERM"); };
    signal?.addEventListener("abort", abort, { once: true });
    cp.stderr.on("data", chunk => { const line = chunk.toString(); err = (err + line).slice(-16000); const seconds = parseFfmpegTime(line); if (seconds !== null) onProgress?.(clamp(8 + (seconds / Math.max(.1, duration)) * 88, 8, 96)); });
    cp.on("error", (error) => { settled = true; signal?.removeEventListener("abort", abort); cleanup(); reject(error); });
    cp.on("close", code => { settled = true; signal?.removeEventListener("abort", abort); cleanup(); if (signal?.aborted) reject(new DOMException("Render dibatalkan.", "AbortError")); else if (code === 0) resolve(); else reject(new Error(err || `ffmpeg exit ${code}`)); });
  });
}
