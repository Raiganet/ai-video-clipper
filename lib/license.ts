import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type LicensePlan = "pro" | "lifetime";

export interface LicenseClaims {
  v: 1;
  id: string;
  plan: LicensePlan;
  issuedAt: number;
  expiresAt?: number;
  email?: string;
}

function signingSecret() {
  const secret = process.env.LICENSE_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("LICENSE_SIGNING_SECRET belum dikonfigurasi atau terlalu pendek.");
  }
  return secret;
}

function encodeClaims(claims: LicenseClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `KAS4.${payload}.${signature}`;
}

export function createLicenseCode(input: { plan: LicensePlan; days?: number; email?: string; id?: string }) {
  if (!['pro', 'lifetime'].includes(input.plan)) throw new Error("Plan lisensi tidak valid.");
  if (input.days !== undefined && (!Number.isFinite(input.days) || input.days <= 0)) throw new Error("Durasi lisensi tidak valid.");
  const issuedAt = Date.now();
  const claims: LicenseClaims = {
    v: 1,
    id: input.id || randomUUID(),
    plan: input.plan,
    issuedAt,
    ...(input.days ? { expiresAt: issuedAt + input.days * 24 * 60 * 60 * 1000 } : {}),
    ...(input.email?.trim() ? { email: input.email.trim().toLowerCase() } : {}),
  };
  return { code: encodeClaims(claims), claims };
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function verifyLicenseCode(code: string): LicenseClaims {
  const [prefix, payload, signature] = code.trim().split(".");
  if (prefix !== "KAS4" || !payload || !signature) {
    throw new Error("Format lisensi tidak valid.");
  }

  const expected = createHmac("sha256", signingSecret()).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    throw new Error("Signature lisensi tidak valid.");
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Signature lisensi tidak valid.");
  }

  let claims: LicenseClaims;
  try {
    claims = JSON.parse(decodeBase64Url(payload)) as LicenseClaims;
  } catch {
    throw new Error("Payload lisensi tidak valid.");
  }

  if (claims.v !== 1 || !claims.id || !["pro", "lifetime"].includes(claims.plan)) {
    throw new Error("Isi lisensi tidak valid.");
  }
  if (claims.expiresAt && Date.now() >= claims.expiresAt) {
    throw new Error("Lisensi sudah kedaluwarsa.");
  }
  return claims;
}
