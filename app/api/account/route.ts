import { NextRequest, NextResponse } from "next/server";
import { firebaseAccessIsEnabled, getAccountState, verifyRequestUser } from "@/lib/entitlements";
import { isAdminUser } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!firebaseAccessIsEnabled()) {
    return NextResponse.json({ configured: false, error: "Firebase account belum dikonfigurasi." }, { status: 503 });
  }
  try {
    const user = await verifyRequestUser(request);
    if (!user) return NextResponse.json({ configured: false }, { status: 503 });
    const base = await getAccountState(user.uid, user.email || null);
    const account = { ...base, emailVerified: Boolean(user.email_verified), isAdmin: isAdminUser(user) };
    return NextResponse.json({ configured: true, account });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "AUTH_REQUIRED" || code === "AUTH_INVALID") {
      return NextResponse.json({ configured: true, error: "Login diperlukan." }, { status: 401 });
    }
    console.error("Account API error", error);
    return NextResponse.json({ configured: true, error: "Gagal membaca akun." }, { status: 500 });
  }
}
