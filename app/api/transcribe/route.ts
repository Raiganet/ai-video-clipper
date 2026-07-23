import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Tidak ada file yang diunggah" }, { status: 400 });
    }

    // Batasi ukuran file untuk Groq (max ~25MB untuk free tier)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ 
        error: "File terlalu besar untuk transkripsi AI (Maks 25MB). Gunakan video lebih pendek atau mode basic." 
      }, { status: 413 });
    }

    const groqFormData = new FormData();
    groqFormData.append("file", file);
    groqFormData.append("model", "whisper-large-v3");
    groqFormData.append("response_format", "text");
    groqFormData.append("language", "id"); // Optimasi untuk Bahasa Indonesia

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: `Transkripsi gagal: ${errorText}` }, { status: response.status });
    }

    const transcript = await response.text();
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json({ error: "Terjadi kesalahan pada server" }, { status: 500 });
  }
}
