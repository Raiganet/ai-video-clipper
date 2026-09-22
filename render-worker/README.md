# AI Clipper Render Worker — Stage 11

Stage 11 mempertahankan **dua mode worker** agar development sederhana tetap jalan dan production bisa scale horizontal.

## 1. Local fallback — tanpa Redis

`server.mjs` mempertahankan queue in-memory Stage 9. Cocok untuk satu VM/container.

```bash
RENDER_WORKER_SECRET=minimum-24-character-secret \
ALLOWED_ORIGIN=https://app.domain.com \
node server.mjs
```

Environment penting:

```env
PORT=8787
RENDER_WORKER_SECRET=...
ALLOWED_ORIGIN=https://app.domain.com
MAX_UPLOAD_MB=2048
MAX_CONCURRENT_RENDERS=2
RENDER_MAX_RETRIES=2
RENDER_FILE_TTL_MINUTES=180
FFMPEG_PATH=ffmpeg
```

## 2. Distributed cluster — BullMQ + Redis + R2/S3

Untuk production multi-instance gunakan:

- `cluster-server.mjs` sebagai API/queue producer.
- satu atau banyak `cluster-worker.mjs` sebagai FFmpeg consumer.
- Redis sebagai queue bersama.
- S3-compatible object storage sebagai source/output bersama.

Install dependency worker:

```bash
npm install
```

Environment:

```env
PORT=8787
RENDER_WORKER_SECRET=minimum-24-character-secret
ALLOWED_ORIGIN=https://app.domain.com

REDIS_URL=redis://default:password@redis:6379
RENDER_QUEUE_NAME=ai-clipper-render
RENDER_MAX_RETRIES=2
RENDER_FILE_TTL_MINUTES=180
RENDER_WORKER_CONCURRENCY=1
MAX_UPLOAD_MB=2048
FFMPEG_PATH=ffmpeg

OBJECT_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=ai-clipper-render
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
OBJECT_STORAGE_PREFIX=ai-clipper
OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

Jalankan API:

```bash
npm run cluster:api
```

Jalankan satu atau lebih worker pada mesin/container lain:

```bash
npm run cluster:worker
```

Setiap worker mengambil job dari queue Redis yang sama. Naikkan jumlah container worker untuk menambah throughput, bukan concurrency terlalu tinggi pada satu mesin.

## Direct upload R2/S3

Cluster API menyediakan `/v3/uploads/:sourceId`. Browser meminta presigned PUT URL lalu mengupload source langsung ke object storage. API credential storage tetap hanya ada di render cluster.

Bucket harus memiliki CORS yang mengizinkan origin webapp untuk `PUT`, `GET`, dan header `Content-Type`.

Jika presigned upload tidak tersedia, client otomatis fallback ke `PUT /v2/files/:sourceId` melalui worker API.

## API kompatibel

Webapp memakai kontrak `/v2`, sehingga local worker dan cluster worker bisa dipertukarkan hanya dengan mengganti `RENDER_WORKER_URL`.

- `PUT /v2/files/:sourceId`
- `POST /v2/jobs/:sourceId`
- `GET /v2/jobs/:sourceId/:renderId`
- `DELETE /v2/jobs/:sourceId/:renderId`
- `GET /v2/output/:sourceId/:renderId`
- `GET /health`

Cluster menambah:

- `POST /v3/uploads/:sourceId` → presigned direct upload.

## Cancel

Local worker menghentikan child-process FFmpeg secara langsung. Distributed mode memakai cancellation signal BullMQ; cluster API mengirim cancel event dan worker membatalkan FFmpeg yang sedang aktif.

## Temporary storage

Local worker memakai TTL file lokal. Distributed mode menggunakan object key terpisah untuk source/output. Untuk production, tambahkan **bucket lifecycle rule** agar prefix `ai-clipper/` terhapus otomatis sesuai retention yang diinginkan. Ini adalah guard kedua di luar cleanup aplikasi.


## Stage 11 briefing render

Render core menerima `ctaOverlay` dari Briefing-Aware Clipper dan membakar CTA hanya pada beberapa detik terakhir video. Branding juga menerima `logoDataUrl` PNG/JPEG/WebP (maks. 300 KB pada payload worker) lalu meng-overlay logo aktual ke output. Bila campaign mewajibkan logo, webapp memblokir render sebelum logo tersedia.
