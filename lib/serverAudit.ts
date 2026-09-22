import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export async function writeAdminAudit(input: {
  actorUid: string;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}) {
  try {
    await getAdminDb().collection("clipperAuditLogs").add({
      actorUid: input.actorUid,
      actorEmail: input.actorEmail || null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId || null,
      details: input.details || {},
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to write admin audit", error);
  }
}
