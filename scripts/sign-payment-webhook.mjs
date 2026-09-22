import { createHmac } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, "").split("=");
  return [key, rest.join("=")];
}));
const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
if (secret.length < 32) {
  console.error("Set PAYMENT_WEBHOOK_SECRET minimal 32 karakter.");
  process.exit(1);
}
const payload = {
  transactionId: args.transaction || `TEST-${Date.now()}`,
  provider: args.provider || "manual-test",
  status: args.status || "paid",
  email: args.email || "customer@example.com",
  plan: args.plan || "pro",
  days: args.plan === "lifetime" ? null : Number(args.days || 30),
  amount: Number(args.amount || 99000),
  currency: args.currency || "IDR",
};
const raw = JSON.stringify(payload);
const signature = createHmac("sha256", secret).update(raw).digest("hex");
console.log(JSON.stringify({ payload, raw, signature, header: { "x-kastriva-signature": signature } }, null, 2));
