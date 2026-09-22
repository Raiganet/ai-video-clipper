import type { CaptionCue } from "@/lib/captions";

function clampTime(value: number) {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function srtTime(value: number) {
  const totalMs = Math.max(0, Math.round(clampTime(value) * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function vttTime(value: number) {
  return srtTime(value).replace(",", ".");
}

function textForCue(cue: CaptionCue) {
  const speaker = typeof cue.speaker === "number" ? `Speaker ${cue.speaker + 1}: ` : "";
  return `${speaker}${String(cue.text || "").replace(/\r?\n/g, " ").trim()}`.trim();
}

export function cuesToSrt(cues: CaptionCue[]) {
  return cues
    .filter((cue) => cue.end > cue.start && textForCue(cue))
    .map((cue, index) => `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${textForCue(cue)}\n`)
    .join("\n");
}

export function cuesToVtt(cues: CaptionCue[]) {
  const body = cues
    .filter((cue) => cue.end > cue.start && textForCue(cue))
    .map((cue) => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${textForCue(cue)}\n`)
    .join("\n");
  return `WEBVTT\n\n${body}`;
}
