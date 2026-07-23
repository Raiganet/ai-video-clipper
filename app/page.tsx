"use client";

import { useState } from "react";
import { Upload, Play, Sparkles, Download, Loader2, Scissors, Brain } from "lucide-react";
import YouTubeInput from "@/components/YouTubeInput";
import VideoUploader from "@/components/VideoUploader";
import CaptionStyleSelector from "@/components/CaptionStyleSelector";
import SettingsPanel from "@/components/SettingsPanel";
import { trimVideo, getVideoDuration } from "@/lib/ffmpeg";
import { detectViralMoments, ViralMoment } from "@/lib/viralDetector";

type Clip = {
  id: number;
  title: string;
  start: number;
  duration: number;
  blobUrl: string | null;
  processing: boolean;
  isAiDetected: boolean;
};

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"youtube" | "upload">("upload");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [captionStyle, setCaptionStyle] = useState("karaoke");
  const [settings, setSettings] = useState({
    previewCount: 5,
    vibe: "viral",
    crop: "auto",
    aiMode: "transcript",
  });

  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedClip = clips.find((c) => c.id === selectedId) || null;

  const processClip = async (clip: Clip, file: File) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clip.id ? { ...c, processing: true } : c))
    );
    try {
      const blob = await trimVideo(file, clip.start, clip.duration, (p) =>
        setProgress(p)
      );
      const url = URL.createObjectURL(blob);
      setClips((prev) =>
        prev.map((c) =>
          c.id === clip.id ? { ...c, blobUrl: url, processing: false } : c
        )
      );
    } catch (e) {
      setClips((prev) =>
        prev.map((c) => (c.id === clip.id ? { ...c, processing: false } : c))
      );
      throw e;
    }
  };

  const handleFindPreviews = async () => {
    if (!uploadedVideo) {
      alert("Silakan upload video terlebih dahulu");
      return;
    }
    setBusy(true);
    setClips([]);
    setSelectedId(null);
    setProgress(0);

    try {
      setStatus("Membaca durasi video...");
      const duration = await getVideoDuration(uploadedVideo);
      if (!duration || duration <= 0) throw new Error("Durasi video tidak valid");

      let viralMoments: ViralMoment[] = [];

      if (settings.aiMode === "transcript") {
        setStatus("Mentranskripsi audio dengan AI (Groq)...");
        try {
          const formData = new FormData();
          formData.append("file", uploadedVideo);

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Transkripsi gagal");
          }

          const data = await res.json();
          setStatus("Mendeteksi momen viral dari transkripsi...");
          viralMoments = detectViralMoments(data.transcript, duration, settings.previewCount);
        } catch (aiError) {
          console.warn("AI Transcription failed, falling back to basic split:", aiError);
          setStatus("AI gagal, menggunakan pembagian video otomatis...");
          const clipLen = Math.min(30, duration / settings.previewCount);
          viralMoments = Array.from({ length: settings.previewCount }, (_, i) => ({
            start: i * clipLen,
            end: Math.min(duration, (i + 1) * clipLen),
            score: 0.5,
            title: `Bagian ${i + 1}`,
          }));
        }
      } else {
        setStatus("Membagi video secara otomatis...");
        const clipLen = Math.min(30, duration / settings.previewCount);
        viralMoments = Array.from({ length: settings.previewCount }, (_, i) => ({
          start: i * clipLen,
          end: Math.min(duration, (i + 1) * clipLen),
          score: 0.5,
          title: `Bagian ${i + 1}`,
        }));
      }

      const generated: Clip[] = viralMoments.map((moment, i) => ({
        id: i + 1,
        title: moment.title.length > 40 ? moment.title.substring(0, 40) + "..." : moment.title,
        start: moment.start,
        duration: moment.end - moment.start,
        blobUrl: null,
        processing: false,
        isAiDetected: moment.score > 0.8,
      }));

      setClips(generated);

      // Auto-proses klip pertama
      setStatus(`Memproses ${generated[0].title}...`);
      await processClip(generated[0], uploadedVideo);
      setSelectedId(generated[0].id);
      setStatus("Selesai! Klik klip lain untuk memprosesnya.");
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : String(error);
      setStatus("");
      alert(`Gagal memproses: ${msg}`);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const handleSelectClip = async (clip: Clip) => {
    setSelectedId(clip.id);
    if (!clip.blobUrl && uploadedVideo && !clip.processing) {
      setBusy(true);
      setStatus(`Memproses ${clip.title}...`);
      try {
        await processClip(clip, uploadedVideo);
        setStatus("Selesai!");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(`Gagal: ${msg}`);
      } finally {
        setBusy(false);
        setProgress(0);
      }
    }
  };

  const handleDownload = (clip: Clip) => {
    if (!clip.blobUrl) return;
    const a = document.createElement("a");
    a.href = clip.blobUrl;
    a.download = `ai-clip-${clip.id}-${Date.now()}.mp4`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl">AI Clipper</span>
          <span className="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded-full">
            BETA
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 mb-4">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-sm">
              Proses 100% di browser • Gratis & Aman
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Ubah video panjang jadi{" "}
            <span className="text-emerald-500">klip viral</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Upload video, biarkan AI mencari momen terbaik, dan potong langsung di perangkatmu.
          </p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab("youtube")}
              className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === "youtube"
                  ? "bg-red-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              <Play className="w-5 h-5" /> YouTube Link
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === "upload"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              <Upload className="w-5 h-5" /> Upload Video
            </button>
          </div>

          {activeTab === "youtube" ? (
            <YouTubeInput value={videoUrl} onChange={setVideoUrl} />
          ) : (
            <VideoUploader onUpload={setUploadedVideo} video={uploadedVideo} />
          )}

          <div className="mt-8">
            <label className="text-sm text-zinc-400 mb-3 block">
              GAYA CAPTION <span className="text-zinc-600">(Clean disarankan)</span>
            </label>
            <CaptionStyleSelector value={captionStyle} onChange={setCaptionStyle} />
          </div>

          <button
            onClick={handleFindPreviews}
            disabled={busy || !uploadedVideo}
            className="w-full mt-8 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {status || "Memproses..."}
              </>
            ) : (
              <>
                <Brain className="w-5 h-5" /> Cari Momen Viral dengan AI
              </>
            )}
          </button>

          {busy && (
            <div className="mt-4 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <p className="text-center text-zinc-600 text-sm mt-4">
            *Transkripsi AI membutuhkan file &lt; 25MB. Jika lebih besar, sistem akan otomatis membagi video secara merata.
          </p>
        </div>

        {clips.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Scissors className="w-5 h-5 text-emerald-500" />
              Preview Klip ({clips.length})
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {clips.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectClip(c)}
                  className={`text-left p-4 rounded-lg border transition-all ${
                    selectedId === c.id
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <div className="font-semibold text-sm mb-1">{c.title}</div>
                  <div className="text-xs text-zinc-400">
                    {fmt(c.start)} – {fmt(c.start + c.duration)}
                  </div>
                  <div className="text-xs mt-3 flex items-center gap-2">
                    {c.processing ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Memproses...
                      </span>
                    ) : c.blobUrl ? (
                      <span className="text-emerald-400 flex items-center gap-1">✓ Siap Download</span>
                    ) : (
                      <span className="text-zinc-500">Klik untuk proses</span>
                    )}
                  </div>
                  {c.isAiDetected && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                      <Sparkles className="w-3 h-3" /> AI Detected
                    </div>
                  )}
                </button>
              ))}
            </div>

            {selectedClip?.blobUrl && (
              <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                <video
                  src={selectedClip.blobUrl}
                  controls
                  className="w-full rounded-lg bg-black max-h-[400px]"
                />
                <button
                  onClick={() => handleDownload(selectedClip)}
                  className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" /> Download {selectedClip.title}
                </button>
              </div>
            )}
          </div>
        )}

        <SettingsPanel settings={settings} onChange={setSettings} />
      </main>
    </div>
  );
}
