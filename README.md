# Kastriva AI Video Clipper — Stage 14

Versi **1.5.0**. Stage 14 menambahkan **Campaign Submission Manager** di atas workflow multi-video Stage 13: shortlist final, approval/reject internal, catatan revisi, versioning render, checklist submission per platform, dan paket final campaign.

## Fitur utama

- AI moment detection: Viral / Edukasi / Jualan / Ringkas.
- Groq Whisper segment + word timestamps.
- Deepgram speaker diarization opsional.
- Caption burn-in: Clean / Karaoke / Pili / Pop.
- Karaoke word-level dengan timestamp kata asli bila tersedia.
- Rasio Auto / 9:16 / 1:1 / 16:9 / Original.
- Smart Face + Dynamic Active Subject Tracking.
- Trim + waveform timeline + caption editor.
- Branding/watermark preset.
- Batch render, retry, progress, dan **cancel render**.
- Project/history IndexedDB + cloud draft sync Firestore.
- Firebase Auth, verified email, trial/quota/lisensi.
- PWA + offline shell.
- Midtrans Snap + verified webhook + reconciliation.
- Export Google Drive dengan scope `drive.file`.
- **ZIP batch sekarang dapat berisi MP4 + SRT + VTT.**
- **Export SRT/VTT terpisah** untuk editor/platform sosial.
- **AI Publish Pack** per klip: judul, deskripsi, hook, CTA, hashtag.
- Dashboard Admin menampilkan health/queue render infrastructure.





## Stage 14 — Campaign Submission Manager

Stage 14 menambahkan workflow final sebelum klip benar-benar dikirim/posting:

- **Shortlist** kandidat final per campaign.
- Keputusan internal **Pending / Approved / Perlu Revisi / Rejected**.
- Catatan revisi dan catatan reviewer per klip.
- **Versioning render** (`v1`, `v2`, dst.) berdasarkan perubahan render signature. Jika klip yang sudah Approved dirender menjadi versi baru, status internal otomatis kembali ke **Perlu Revisi**.
- Checklist per platform: TikTok, Instagram Reels, YouTube Shorts, dan Campaign Portal.
- Penanda Caption / Hashtag / Bio Link / Uploaded / Submitted beserta catatan atau URL posting.
- **Final Package** hanya memasukkan klip yang sekaligus: Shortlist + Approved + status brief Siap Submit + render versi terbaru.
- Paket final ZIP berisi MP4, SRT/VTT, Publish Pack, `manifest.json`, `manifest.csv`, dan README submission.

Riwayat versi menyimpan metadata version/timestamp/signature, sedangkan browser tetap hanya mempertahankan file render aktif agar storage tidak membengkak. Data Submission Manager ikut autosave IndexedDB dan cloud draft.

## Stage 13 — Multi-Video Campaign Production

Stage 13 membuat briefing campaign dapat dipakai untuk produksi skala lebih besar, bukan hanya satu source video. Fitur utamanya:

- **Multi-video campaign batch** hingga beberapa source dalam satu workspace.
- Source video kecil dapat disimpan ke IndexedDB bersama project (dibatasi per-file dan total agar storage browser tidak dipaksa berlebihan).
- Transcript source disimpan di cache selama sesi agar tagging target speaker lalu ranking ulang tidak menghabiskan quota transkripsi lagi.
- **Target speaker per source**: Speaker 1 di video A tidak dianggap otomatis sama dengan Speaker 1 di video B.
- **Beberapa kandidat per narasi** dengan target 1–4 kandidat/narasi; hasil akhir dipilih lintas source berdasarkan skor terbaik.
- Status otomatis setiap kandidat: **Siap Submit**, **Perlu Revisi**, atau **Gagal Brief**.
- Status mempertimbangkan compliance brief, render terbaru, Publish Pack, logo/CTA/hashtag, serta manual review.
- Manual review campaign dapat dicentang setelah benar-benar diverifikasi (misalnya link bio, bukan screenshot/repost, izin footage).
- **Campaign Template** tersimpan lokal di browser sehingga briefing seperti Fortis Circle dapat dipakai ulang tanpa paste ulang.

### Alur batch yang direkomendasikan

1. Analisis briefing.
2. Tambahkan semua source video di Campaign Workspace.
3. Klik **Analisis Semua Video**.
4. Jika briefing mewajibkan pembicara tertentu, tag target speaker pada setiap source setelah diarization selesai.
5. Jalankan **Analisis Semua Video** lagi; transcript sesi dipakai ulang sehingga hanya ranking yang diperbarui.
6. Review kandidat per narasi dan status submit.
7. Render kandidat yang dipilih, buat Publish Pack, selesaikan manual review, lalu export.

## Stage 12 — Campaign Workspace

Stage 12 menambahkan panel **Campaign Workspace** untuk kebutuhan campaign nyata seperti Fortis Circle. Workspace ini membantu:

- menyusun banyak narasi campaign dalam satu tempat;
- menyimpan source video yang sedang dipakai;
- melihat coverage kandidat klip per narasi;
- memfokuskan pencarian hanya ke satu narasi tertentu;
- memeriksa checklist siap submit (logo, CTA, target speaker, hashtag, dan cakupan narasi).

Jika briefing memiliki 6 narasi, Stage 12 akan berusaha menghasilkan cakupan narasi yang lebih merata, bukan hanya mengambil 5–6 skor tertinggi dari narasi yang sama. Workspace juga menyediakan **focus mode** agar pengguna bisa memilih satu narasi dan menjalankan pencarian ulang untuk membuat kandidat yang lebih spesifik pada angle tersebut.

## Stage 11 — Briefing-Aware Clipper

Tempel briefing campaign pada panel **Briefing-Aware Clipper**, lalu klik **Analisis Briefing**. Parser AI (dengan fallback lokal) mengekstrak:

- durasi minimum/maksimum klip;
- target subjek/speaker;
- narasi/angle yang harus dicari;
- CTA akhir video;
- link yang wajib dicantumkan di bio;
- kebutuhan logo/watermark;
- hashtag wajib;
- URL materi sumber sebagai referensi;
- larangan topik/klaim serta pemeriksaan manual.

Contoh briefing seperti Fortis Circle (`30–90 detik`, fokus pembicara tertentu, logo wajib, CTA, `#davidnoah #fortiscircle`, dan larangan topik tertentu) akan memengaruhi pencarian momen, bukan hanya menjadi catatan UI. Kandidat yang mengandung topik terlarang atau janji keuntungan eksplisit dari transcript dibuang dari hasil briefing. Klaim/rekomendasi finansial yang masih membutuhkan konteks diberi warning untuk review manusia.

### Alur target speaker

Sistem **tidak menebak identitas orang dari wajah**. Jika briefing menyebut nama pembicara, aktifkan diarization, dengarkan preview, lalu tag label `Speaker 1/2/...` yang benar satu kali. Setelah itu klik pencarian briefing lagi; transcript yang sudah ada digunakan ulang sehingga sistem dapat memprioritaskan section yang didominasi speaker tersebut tanpa transkripsi ulang.

### Compliance sebelum posting

Panel **Brief Compliance** memeriksa hal yang dapat diverifikasi dari transcript dan setting render: durasi, logo, CTA, dominasi target speaker, hashtag, dan filter topik/klaim. Aturan seperti “bukan screenshot campaign”, “bukan repost video yang sudah pernah diposting”, “tidak memakai ads/bot”, serta kepemilikan/izin footage ditandai **Manual Review**, karena tidak aman untuk dianggap lolos hanya dari transcript.

### CTA dan logo

Jika brief mewajibkan logo, render diblokir sampai logo benar-benar diunggah pada panel Branding. CTA brief dibakar ke bagian akhir MP4. Render worker Stage 11 juga mendukung file logo PNG/JPEG/WebP asli, bukan hanya nama brand teks. Publish Pack mewarisi CTA/hashtag wajib dan menampilkan reminder link-in-bio.

### Materi YouTube/Drive

URL dari briefing disimpan sebagai **referensi materi**. Webapp tidak bertindak sebagai downloader YouTube. Untuk clipping, upload file video sumber yang memang diizinkan untuk digunakan sesuai campaign/licensing.

## Stage 10 Render Infrastructure

### Mode A — Local Worker

Tetap tersedia tanpa Redis. Cocok untuk development atau satu VM:

```bash
npm run worker:start
```

Queue berada di memory worker dan source/output berada di temp disk dengan TTL.

### Mode B — Distributed Cluster

Production dapat memakai:

```text
Browser
  │
  ├─ presigned PUT ──────────► R2 / S3
  │
  └─ create render job ──────► Cluster API
                                │
                                ▼
                              Redis
                                │
                   ┌────────────┼────────────┐
                   ▼            ▼            ▼
               FFmpeg #1    FFmpeg #2    FFmpeg #3
                   │            │            │
                   └────────────┼────────────┘
                                ▼
                              R2 / S3
```

BullMQ menyimpan queue bersama di Redis sehingga worker dapat berada pada container/VM berbeda. BullMQ mendukung worker concurrency/retry dan Stage 10/11 memakai job attempts + exponential backoff. Untuk file besar, R2/S3 menghindari kebutuhan shared local disk antar worker.

Install dependency cluster:

```bash
npm run worker:install
```

Jalankan API producer:

```bash
npm run worker:cluster:api
```

Jalankan sebanyak worker yang diperlukan:

```bash
npm run worker:cluster:worker
```

Lihat `render-worker/README.md` untuk deployment detail.

## Environment aplikasi

Salin `.env.example` menjadi `.env.local`.

Environment utama:

```env
GROQ_API_KEY=...
GROQ_WHISPER_MODEL=whisper-large-v3
GROQ_TEXT_MODEL=llama-3.3-70b-versatile

DEEPGRAM_API_KEY=...
DEEPGRAM_MODEL=nova-3

NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

ADMIN_EMAILS=admin@domain.com
LICENSE_SIGNING_SECRET=minimum-32-random-characters
PAYMENT_WEBHOOK_SECRET=another-minimum-32-random-characters

MIDTRANS_SERVER_KEY=SB-Mid-server-...
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_PRO_PRICE_IDR=99000
MIDTRANS_PRO_DAYS=30
MIDTRANS_LIFETIME_PRICE_IDR=499000

NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=...apps.googleusercontent.com

RENDER_WORKER_URL=https://render.domain.com
RENDER_WORKER_SECRET=minimum-24-random-characters
```

Semua secret server **jangan** memakai `NEXT_PUBLIC_`.

## Environment distributed render cluster

Di deployment `render-worker`:

```env
REDIS_URL=redis://default:password@redis-host:6379
RENDER_QUEUE_NAME=ai-clipper-render
RENDER_WORKER_CONCURRENCY=1
RENDER_MAX_RETRIES=2
RENDER_FILE_TTL_MINUTES=180
MAX_UPLOAD_MB=2048

OBJECT_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=ai-clipper-render
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
OBJECT_STORAGE_PREFIX=ai-clipper
OBJECT_STORAGE_FORCE_PATH_STYLE=false
```

Untuk Cloudflare R2, tambahkan CORS bucket agar origin webapp boleh melakukan `PUT` ke presigned URL. Presigned URL adalah bearer capability dengan masa berlaku pendek; jangan log atau menyimpannya ke analytics.

Tambahkan bucket lifecycle rule sebagai safety net untuk menghapus source/output lama.

## AI Publish Pack

Setelah transcript tersedia, pilih klip lalu buka **AI Publish Pack**. Endpoint `/api/clip-metadata` mengirim transcript klip (bukan file video) ke Groq Chat Completions dan meminta JSON:

```json
{
  "title": "...",
  "description": "...",
  "hashtags": ["#..."],
  "hook": "...",
  "cta": "..."
}
```

Hasil dapat diedit dan disimpan di draft project. Default model `llama-3.3-70b-versatile` dapat diganti melalui `GROQ_TEXT_MODEL`.

## Subtitle export

Setiap klip memakai timing relatif terhadap awal klip, sehingga export menghasilkan file `.srt` dan `.vtt` yang langsung cocok dengan MP4 hasil render. Jika speaker diarization aktif, nama `Speaker N:` ikut ditulis di subtitle.

ZIP batch menyertakan subtitle ketika cue tersedia. Tombol **SRT/VTT** membuat ZIP subtitle tanpa MP4.

## Cancel render

Untuk server render, tombol **Batalkan Render** mengirim `DELETE` ke render job. Local worker membunuh child FFmpeg. Pada cluster, cancellation diteruskan ke BullMQ worker dan AbortSignal menghentikan FFmpeg aktif. Browser-render FFmpeg WASM tidak memiliki hard-cancel yang aman pada instance bersama, jadi cancel paling efektif pada Server/Auto mode yang memilih worker.

## Monitoring Admin

Dashboard `/admin` sekarang membaca `RENDER_WORKER_URL/health` dan menampilkan:

- Online/offline.
- Mode `bullmq` atau local.
- Active render.
- Queued render.
- Storage backend.

Endpoint health tidak berisi secret atau user data.

## Menjalankan webapp

```powershell
npm install
npm run dev
```

Production check:

```powershell
npm run lint
npm run build
```

## Batasan yang masih ada

- Active Subject masih visual face-continuity heuristic, belum speaker-to-face lip activity matching.
- Browser FFmpeg WASM tetap terbatas memory; gunakan cluster worker untuk video besar.
- Presigned direct upload membutuhkan CORS bucket yang benar.
- Distributed source/output retention sebaiknya dipaksa lagi lewat lifecycle rule bucket.
- AI Publish Pack dan briefing ranking terutama memakai transcript/cue; aturan visual tetap membutuhkan review atau analisis visual tambahan.
- URL YouTube/Drive pada brief adalah referensi materi; pemrosesan memakai file sumber yang di-upload dan memang boleh digunakan.

## Arah berikutnya

Stage berikutnya dapat fokus pada persistent campaign templates/brief library, evidence checklist per campaign, visual compliance detector, speaker-to-face lip activity matching, billing usage per render minute, dan webhook worker health alerts.
