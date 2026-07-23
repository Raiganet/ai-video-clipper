import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24 MB (aman untuk Groq)

export async function POST(request: NextRequest) {
  try {
    // Cek API Key
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "GROQ_API_KEY belum dikonfigurasi." },
        { status: 500 }
      );
    }

    // Ambil FormData
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "File tidak ditemukan." },
        { status: 400 }
      );
    }

    // Validasi ukuran
    if (file.size === 0) {
      return NextResponse.json(
        { error: "File kosong." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `Ukuran file ${(file.size / 1024 / 1024).toFixed(
            1
          )} MB melebihi batas ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
        },
        { status: 413 }
      );
    }

    // Validasi tipe file
    const allowedTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Format ${file.type} tidak didukung.`,
        },
        { status: 400 }
      );
    }

    // Kirim ke Groq
    const groqForm = new FormData();
    groqForm.append("file", file);
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("response_format", "text");
    groqForm.append("language", "id");

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 120000);

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: groqForm,
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      let errorMessage = "Transkripsi gagal.";

      try {
        const err = await response.json();
        errorMessage =
          err?.error?.message ??
          err?.message ??
          JSON.stringify(err);
      } catch {
        errorMessage = await response.text();
      }

      return NextResponse.json(
        {
          error: errorMessage,
        },
        {
          status: response.status,
        }
      );
    }

    const transcript = await response.text();

    return NextResponse.json({
      success: true,
      transcript,
    });
  } catch (error: any) {
    console.error("Transcription Error:", error);

    if (error.name === "AbortError") {
      return NextResponse.json(
        {
          error: "Timeout saat menghubungi Groq.",
        },
        {
          status: 504,
        }
      );
    }

    return NextResponse.json(
      {
        error: error.message || "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}
