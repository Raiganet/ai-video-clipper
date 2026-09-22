import { gunzipSync, gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/entitlements";
import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebaseAdmin";
import type { ProjectDraft } from "@/lib/projectTypes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 700 * 1024;
const MAX_PROJECTS_RETURNED = 100;

function asMillis(value: unknown) {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number") return value;
  if (typeof value === "object" && value && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function validDraft(input: unknown): input is ProjectDraft {
  if (!input || typeof input !== "object") return false;
  const value = input as Partial<ProjectDraft>;
  return Boolean(
    typeof value.id === "string" && value.id.length >= 8 && value.id.length <= 100 &&
    typeof value.name === "string" && value.name.length <= 120 &&
    Number.isFinite(value.createdAt) && Number.isFinite(value.updatedAt) &&
    typeof value.sourceName === "string" && value.sourceName.length <= 300 &&
    Array.isArray(value.clips) && value.clips.length <= 100 &&
    Array.isArray(value.transcriptSegments) && value.transcriptSegments.length <= 20000
  );
}

function encodedDraft(draft: ProjectDraft) {
  const normalized: ProjectDraft = { ...draft, sourceStored: false };
  const json = Buffer.from(JSON.stringify(normalized), "utf8");
  if (json.length > MAX_REQUEST_BYTES) throw new Error("PROJECT_TOO_LARGE");
  const compressed = gzipSync(json, { level: 9 });
  if (compressed.length > MAX_COMPRESSED_BYTES) throw new Error("PROJECT_COMPRESSED_TOO_LARGE");
  return compressed;
}

function decodeDraft(payload: Buffer | Uint8Array): ProjectDraft {
  const raw = gunzipSync(Buffer.from(payload));
  const parsed = JSON.parse(raw.toString("utf8")) as unknown;
  if (!validDraft(parsed)) throw new Error("PROJECT_CORRUPT");
  return { ...parsed, sourceStored: false };
}

function authError(error: unknown) {
  const code = error instanceof Error ? error.message : "UNKNOWN";
  if (["AUTH_REQUIRED", "AUTH_INVALID", "EMAIL_NOT_VERIFIED"].includes(code)) {
    return NextResponse.json({ error: code === "EMAIL_NOT_VERIFIED" ? "Verifikasi email untuk memakai cloud sync." : "Login diperlukan." }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Cloud sync belum dikonfigurasi." }, { status: 503 });
  try {
    const user = await verifyRequestUser(request, { requireVerified: true });
    if (!user) throw new Error("AUTH_REQUIRED");
    const id = request.nextUrl.searchParams.get("id")?.trim();
    const collection = getAdminDb().collection("clipperUsers").doc(user.uid).collection("projects");

    if (id) {
      const snap = await collection.doc(id).get();
      if (!snap.exists) return NextResponse.json({ error: "Project cloud tidak ditemukan." }, { status: 404 });
      const data = snap.data() || {};
      const payload = data.payload;
      const bytes = payload && typeof payload.toUint8Array === "function" ? payload.toUint8Array() : payload;
      if (!bytes) return NextResponse.json({ error: "Payload project cloud rusak." }, { status: 500 });
      return NextResponse.json({ project: decodeDraft(bytes) });
    }

    const snap = await collection.orderBy("updatedAt", "desc").limit(MAX_PROJECTS_RETURNED).get();
    const projects = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data.name || "Project"),
        updatedAt: Number(data.clientUpdatedAt || asMillis(data.updatedAt)),
        cloudUpdatedAt: asMillis(data.updatedAt),
        sourceName: String(data.sourceName || ""),
        sourceSize: Number(data.sourceSize || 0),
        sourceStored: false,
        clipCount: Number(data.clipCount || 0),
        compressedBytes: Number(data.compressedBytes || 0),
      };
    });
    return NextResponse.json({ projects, truncated: snap.size >= MAX_PROJECTS_RETURNED });
  } catch (error) {
    const auth = authError(error); if (auth) return auth;
    console.error("Cloud project GET failed", error);
    return NextResponse.json({ error: "Gagal membaca project cloud." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Cloud sync belum dikonfigurasi." }, { status: 503 });
  try {
    const user = await verifyRequestUser(request, { requireVerified: true });
    if (!user) throw new Error("AUTH_REQUIRED");
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) throw new Error("PROJECT_TOO_LARGE");
    const body = JSON.parse(text) as { draft?: unknown; force?: boolean };
    if (!validDraft(body.draft)) return NextResponse.json({ error: "Format project tidak valid." }, { status: 400 });
    const draft = body.draft;
    const compressed = encodedDraft(draft);
    const ref = getAdminDb().collection("clipperUsers").doc(user.uid).collection("projects").doc(draft.id);

    await getAdminDb().runTransaction(async (tx) => {
      const current = await tx.get(ref);
      const remoteUpdatedAt = Number(current.data()?.clientUpdatedAt || 0);
      if (current.exists && remoteUpdatedAt > draft.updatedAt && !body.force) {
        const conflict = new Error("PROJECT_CONFLICT") as Error & { remoteUpdatedAt?: number };
        conflict.remoteUpdatedAt = remoteUpdatedAt;
        throw conflict;
      }
      tx.set(ref, {
        name: draft.name.slice(0, 120),
        sourceName: draft.sourceName.slice(0, 300),
        sourceSize: draft.sourceSize,
        clipCount: draft.clips.length,
        createdAtClient: draft.createdAt,
        clientUpdatedAt: draft.updatedAt,
        compressedBytes: compressed.length,
        payload: compressed,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return NextResponse.json({ success: true, id: draft.id, compressedBytes: compressed.length });
  } catch (error) {
    const auth = authError(error); if (auth) return auth;
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "PROJECT_CONFLICT") {
      return NextResponse.json({ error: "Project cloud lebih baru. Buka versi cloud atau paksa sinkronisasi.", code, remoteUpdatedAt: (error as Error & { remoteUpdatedAt?: number }).remoteUpdatedAt || 0 }, { status: 409 });
    }
    if (["PROJECT_TOO_LARGE", "PROJECT_COMPRESSED_TOO_LARGE"].includes(code)) {
      return NextResponse.json({ error: "Draft terlalu besar untuk cloud sync. Project tetap aman di penyimpanan lokal.", code }, { status: 413 });
    }
    console.error("Cloud project POST failed", error);
    return NextResponse.json({ error: "Gagal menyinkronkan project." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) return NextResponse.json({ error: "Cloud sync belum dikonfigurasi." }, { status: 503 });
  try {
    const user = await verifyRequestUser(request, { requireVerified: true });
    if (!user) throw new Error("AUTH_REQUIRED");
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id || id.length > 100) return NextResponse.json({ error: "ID project tidak valid." }, { status: 400 });
    await getAdminDb().collection("clipperUsers").doc(user.uid).collection("projects").doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    const auth = authError(error); if (auth) return auth;
    return NextResponse.json({ error: "Gagal menghapus project cloud." }, { status: 500 });
  }
}
