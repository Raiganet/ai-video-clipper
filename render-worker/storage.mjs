import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { S3Client, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = String(process.env.OBJECT_STORAGE_ENDPOINT || "").trim();
const bucket = String(process.env.OBJECT_STORAGE_BUCKET || "").trim();
const region = String(process.env.OBJECT_STORAGE_REGION || "auto").trim() || "auto";
const accessKeyId = String(process.env.OBJECT_STORAGE_ACCESS_KEY_ID || "").trim();
const secretAccessKey = String(process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "").trim();
const prefix = String(process.env.OBJECT_STORAGE_PREFIX || "ai-clipper").replace(/^\/+|\/+$/g, "");
const configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);

const client = configured ? new S3Client({
  region,
  endpoint,
  forcePathStyle: String(process.env.OBJECT_STORAGE_FORCE_PATH_STYLE || "false").toLowerCase() === "true",
  credentials: { accessKeyId, secretAccessKey },
}) : null;

function mustClient() {
  if (!client) throw new Error("OBJECT_STORAGE_NOT_CONFIGURED");
  return client;
}

export function objectStorageConfigured() { return configured; }
export function sourceObjectKey(sourceId) { return `${prefix}/sources/${sourceId}/source.bin`; }
export function outputObjectKey(sourceId, renderId) { return `${prefix}/outputs/${sourceId}/${renderId}.mp4`; }

export async function presignSourceUpload(sourceId, contentType = "application/octet-stream", expiresIn = 900) {
  const Key = sourceObjectKey(sourceId);
  const url = await getSignedUrl(mustClient(), new PutObjectCommand({ Bucket: bucket, Key, ContentType: contentType }), { expiresIn });
  return { url, key: Key, expiresIn };
}

export async function presignOutputDownload(key, expiresIn = 900) {
  const url = await getSignedUrl(mustClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
  return { url, expiresIn };
}

export async function uploadStream(key, body, contentType = "application/octet-stream") {
  const upload = new Upload({ client: mustClient(), params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType }, queueSize: 4, partSize: 8 * 1024 * 1024, leavePartsOnError: false });
  await upload.done();
  return key;
}

export async function uploadFile(key, filePath, contentType = "video/mp4") {
  return uploadStream(key, createReadStream(filePath), contentType);
}

export async function downloadFile(key, filePath) {
  const response = await mustClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("OBJECT_BODY_EMPTY");
  await pipeline(response.Body, createWriteStream(filePath));
  return filePath;
}

export async function objectInfo(key) {
  try {
    const response = await mustClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { exists: true, size: Number(response.ContentLength || 0), contentType: response.ContentType || null };
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return { exists: false, size: 0, contentType: null };
    throw error;
  }
}

export async function objectExists(key) {
  return (await objectInfo(key)).exists;
}

export async function deleteObject(key) {
  if (!configured || !key) return;
  await mustClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
