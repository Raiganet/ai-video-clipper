import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyRequestUser } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function config() {
  const workerUrl = String(process.env.RENDER_WORKER_URL || "").trim().replace(/\/+$/, "");
  const secret = String(process.env.RENDER_WORKER_SECRET || "").trim();
  return { workerUrl, secret, configured: Boolean(workerUrl && secret.length >= 24) };
}

function sign(payload: Record<string, unknown>, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export async function GET() {
  const cfg = config();
  return NextResponse.json({ configured: cfg.configured });
}

export async function POST(request: NextRequest) {
  const cfg = config();
  if (!cfg.configured) return NextResponse.json({ error: "Render worker belum dikonfigurasi.", code: "WORKER_NOT_CONFIGURED" }, { status: 503 });
  try {
    const user = await verifyRequestUser(request, { requireVerified: true });
    if (!user) throw new Error("AUTH_REQUIRED");
    const jobId = `rw-${Date.now().toString(36)}-${randomUUID().slice(0, 12)}`;
    const exp = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
    const token = sign({ uid: user.uid, jobId, exp }, cfg.secret);
    return NextResponse.json({ success: true, workerUrl: cfg.workerUrl, token, jobId, expiresAt: exp * 1000 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) {
      return NextResponse.json({ error: code === "EMAIL_NOT_VERIFIED" ? "Verifikasi email untuk memakai server render." : "Login diperlukan untuk server render." }, { status: 401 });
    }
    return NextResponse.json({ error: "Gagal membuat sesi render worker." }, { status: 500 });
  }
}
