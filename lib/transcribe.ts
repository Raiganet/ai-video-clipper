// lib/transcribe.ts
export async function transcribeAudio(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model", "whisper-large-v3");
  formData.append("response_format", "text");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "x-groq-api-key": process.env.GROQ_API_KEY || "",
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Transkripsi gagal: ${response.statusText}`);
  }

  return await response.text();
}
