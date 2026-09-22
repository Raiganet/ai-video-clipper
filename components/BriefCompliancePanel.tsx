"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck, CircleHelp, XCircle } from "lucide-react";
import type { BriefComplianceCheck } from "@/lib/briefing";

export default function BriefCompliancePanel({ checks }: { checks: BriefComplianceCheck[] }) {
  if (!checks.length) return null;
  const icon = (status: BriefComplianceCheck["status"]) => status === "pass" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : status === "fail" ? <XCircle className="w-4 h-4 text-red-400" /> : status === "manual" ? <ClipboardCheck className="w-4 h-4 text-sky-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />;
  const bad = checks.filter((item) => item.status === "fail").length;
  const manual = checks.filter((item) => item.status === "manual" || item.status === "warning").length;
  return <section className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/70 p-4">
    <div className="flex items-center gap-2 mb-3"><CircleHelp className="w-4 h-4 text-violet-300" /><div><div className="font-semibold">Brief Compliance</div><div className="text-[11px] text-zinc-500">Pemeriksaan otomatis memakai transcript + setting render. Aturan visual/repost tetap memerlukan review manusia.</div></div><span className={`ml-auto text-xs px-2 py-1 rounded-full ${bad ? "bg-red-500/10 text-red-300" : manual ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300"}`}>{bad ? `${bad} gagal` : manual ? `${manual} perlu review` : "Siap"}</span></div>
    <div className="grid sm:grid-cols-2 gap-2">{checks.map((item) => <div key={item.key} className="rounded-lg border border-zinc-800 bg-black/20 p-3 flex gap-2">{icon(item.status)}<div className="min-w-0"><div className="text-xs font-medium text-zinc-300">{item.label}</div>{item.detail && <div className="text-[10px] text-zinc-600 mt-1 break-words">{item.detail}</div>}</div></div>)}</div>
  </section>;
}
