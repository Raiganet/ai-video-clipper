# AI Video Clipper — Stage 3

Next.js 16 + FFmpeg.wasm + Groq Whisper untuk mencari momen video dari transkripsi bertimestamp, lalu mengedit trim/caption/framing dan merender klip siap upload langsung di browser.

## Fitur yang sudah aktif

- Upload MP4/WebM/MOV/M4V.
- Metadata durasi dan resolusi dibaca di browser.
- Audio diekstrak menjadi mono 16 kHz AAC 32 kbps.
- Audio panjang dipecah per 12 menit sebelum dikirim ke API transkripsi.
- Groq Whisper `verbose_json` menghasilkan timestamp segmen.
- Pemilihan momen memakai timestamp, keyword, kepadatan ucapan, hook/pertanyaan, dan mode vibe.
- Vibe: Viral, Edukasi, Jualan, Ringkas.
- Fallback Pembagian Cepat bila AI gagal atau sengaja dimatikan.
- Burn-in caption nyata ke MP4: Clean, Karaoke, Pili, Pop, atau Tanpa Caption.
- Caption diraster dengan Canvas browser menjadi PNG transparan, lalu dibakar dengan FFmpeg.
- **Editor caption sebelum render**: koreksi teks, hapus cue, tambah caption manual, atau reset kembali ke caption otomatis.
- **Trim manual**: ubah start/end setiap draft klip sebelum render.
- **Smart Face framing**: MediaPipe Face Detector dimuat on-demand di browser, sampling 3–7 frame per klip, lalu memilih pusat framing stabil berdasarkan median wajah terbesar.
- Smart Face otomatis fallback ke center-crop bila wajah/model tidak tersedia.
- Output: Auto, 9:16 (720×1280), 1:1 (720×720), 16:9 (1280×720), dan Original.
- Crop FFmpeg menggunakan titik fokus Smart Face/Center, bukan lagi center-crop wajib.
- Export memakai H.264 (`libx264`) + AAC, `yuv420p`, dan `faststart`.
- Preview memiliki render signature yang memasukkan rasio, Smart Face/Center, trim, style caption, dan isi caption. Perubahan editor otomatis membuat preview lama berstatus stale.
- Memilih klip tidak lagi otomatis merender. Edit dulu, lalu render satu kali agar lebih hemat resource.
- Operasi FFmpeg diserialkan dan memakai nama file unik agar tidak bentrok.
- Temporary file dan Object URL dibersihkan untuk mengurangi memory leak.
- API transkripsi memiliki validasi ukuran/format dan rate limit dasar per instance.

## Smart Face

Smart Face memakai MediaPipe Tasks Vision `1.0.1` melalui dynamic import CDN dan model BlazeFace short-range. Tidak ada package tambahan yang harus dibundle ke Next.js.

Alur:

1. Pilih draft klip.
2. Saat render, browser mengambil beberapa sampel waktu di dalam klip.
3. Wajah terbesar di setiap sampel dicatat.
4. Median posisi wajah menjadi titik fokus stabil untuk crop 9:16/1:1/16:9.
5. Bila tidak ada wajah atau library gagal dimuat, center-crop digunakan otomatis.

Ini sengaja menggunakan **stable face-aware framing per klip**, bukan crop yang berpindah setiap frame, agar output tidak jitter dan FFmpeg.wasm tetap realistis di perangkat mobile.

## Editor Stage 3

- Klik kartu draft untuk memilihnya.
- Atur slider/angka `Start` dan `End`, lalu pilih **Terapkan Trim**.
- Koreksi teks caption di panel Editor Caption.
- Tambahkan caption manual bila transcript tidak tersedia.
- Klik **Render klip / Render perubahan** setelah semua edit selesai.
- Download hanya aktif bila preview sesuai dengan setting/editor terbaru.

## Belum aktif / Tahap berikutnya

- Dynamic active-speaker tracking yang menggeser crop dari frame ke frame.
- Word-level karaoke asli. Stage 3 masih membagi timestamp segmen menjadi cue pendek berdasarkan estimasi distribusi kata.
- Timeline visual/waveform dan drag handles seperti editor video penuh.
- Import/download langsung dari YouTube. UI YouTube saat ini memvalidasi link dan menampilkan thumbnail saja.
- Authentication, quota/lisensi per akun, project history, autosave draft, dan penyimpanan cloud.
- PWA/offline shell untuk UI aplikasi.

## Environment

Salin `.env.example` menjadi `.env.local`:

```bash
GROQ_API_KEY=your_key
GROQ_WHISPER_MODEL=whisper-large-v3
```

## Menjalankan

```bash
npm install
npm run dev
```

## Verifikasi sebelum deploy

```bash
npm run lint
npm run build
```

## Catatan performa

FFmpeg.wasm memproses video di RAM browser. Smart Face menambah proses sampling wajah sebelum render. Output sosial dibatasi ke 720p/1280p agar lebih realistis untuk desktop dan ponsel. Video sangat besar atau perangkat dengan RAM kecil tetap membutuhkan resource tinggi.

## Catatan produksi

Rate limit bawaan menggunakan memory proses Node sehingga hanya perlindungan dasar. Untuk deployment publik, tambahkan authentication, quota per user, dan rate limiter terdistribusi (Redis/KV atau layanan setara).
