import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";
import { verifyRequestUser } from "@/lib/entitlements";

function configuredAdminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(user: DecodedIdToken) {
  if (user.admin === true) return true;
  const email = String(user.email || "").trim().toLowerCase();
  return Boolean(email && configuredAdminEmails().has(email));
}

export async function requireAdmin(request: NextRequest) {
  const user = await verifyRequestUser(request, { requireVerified: true });
  if (!user) throw new Error("AUTH_REQUIRED");
  if (!isAdminUser(user)) throw new Error("ADMIN_REQUIRED");
  return user;
}
