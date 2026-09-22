import { createHmac, randomUUID } from "node:crypto";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const secret = process.env.LICENSE_SIGNING_SECRET;
if (!secret || secret.length < 32) {
  console.error("LICENSE_SIGNING_SECRET wajib ada dan minimal 32 karakter.");
  process.exit(1);
}

const plan = arg("plan") || "pro";
if (!["pro", "lifetime"].includes(plan)) {
  console.error("--plan hanya boleh pro atau lifetime");
  process.exit(1);
}

const daysRaw = arg("days");
const days = daysRaw ? Number(daysRaw) : undefined;
if (daysRaw && (!Number.isFinite(days) || days <= 0)) {
  console.error("--days harus angka positif");
  process.exit(1);
}

const now = Date.now();
const claims = {
  v: 1,
  id: arg("id") || randomUUID(),
  plan,
  issuedAt: now,
  ...(days ? { expiresAt: now + days * 24 * 60 * 60 * 1000 } : {}),
  ...(arg("email") ? { email: arg("email").trim().toLowerCase() } : {}),
};

const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
const signature = createHmac("sha256", secret).update(payload).digest("base64url");
console.log(`KAS4.${payload}.${signature}`);
