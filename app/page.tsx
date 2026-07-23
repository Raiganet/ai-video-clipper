"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Play, Sparkles, Download, Loader2 } from "lucide-react";
import YouTubeInput from "@/components/YouTubeInput";
import VideoUploader from "@/components/VideoUploader";
import CaptionStyleSelector from "@/components/CaptionStyleSelector";
import SettingsPanel from "@/components/SettingsPanel";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"youtube" | "upload">("youtube");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [captionStyle, setCaptionStyle] = useState("karaoke");
  const [settings, setSettings] = useState({
    previewCount: 5,
    vibe: "viral",
    crop: "auto",
    aiMode: "transcript",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null);
  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load FFmpeg saat component mount
  useEffect(() => {
    const loadFFmpeg = async () => {
      const ffmpegInstance = new FFmpeg();
      await ffmpegInstance.load({
        coreURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
        wasmURL: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm"
      });
      setFfmpeg(ffmpegInstance);
    };
    loadFFmpeg();
  }, []);

  const handleProcess = async () => {
    if (!uploadedVideo) {
      alert("Silakan upload video terlebih dahulu");
      return;
    }

    if (!ffmpeg) {
      alert("FFmpeg belum siap. Mohon tunggu sebentar...");
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessedVideoUrl(null);

    try {
      // Tulis file ke memory FFmpeg
      await ffmpeg.writeFile("input.mp4", await fetchFile(uploadedVideo));

      // Proses trim video (detik 0-30 sebagai contoh)
      // Di sini nanti bisa diganti dengan AI logic untuk detect momen viral
      await ffmpeg.exec([
        "-i", "input.mp4",
        "-ss", "0",
        "-t", "30",
        "-c", "copy",
        "output.mp4"
      ]);

      // Baca hasil
      const data = await ffmpeg.readFile("output.mp4");
      
      // Buat blob URL untuk preview
      const blob = new Blob([data], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setProcessedVideoUrl(url);

      // Cleanup
      await ffmpeg.deleteFile("input.mp4");
      await ffmpeg.deleteFile("output.mp4");

      setProcessingProgress(100);
      
    } catch (error) {
      console.error("Error processing video:", error);
      alert(`Terjadi kesalahan: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!processedVideoUrl) return;
    
    const a = document.createElement("a");
    a.href = processedVideoUrl;
    a.download = `ai-clip-${Date.now()}.mp4`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl">AI Clipper</span>
            <span className="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded-full">
              BETA
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 mb-4">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-emerald-400 text-sm">
              Mode demo • hasil asli dari video contoh
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Ubah video panjang jadi{" "}
            <span className="text-emerald-500">klip viral</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Tempel link, klik sekali. AI yang cariin momen terbaiknya.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8">
          {/* Tabs */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setActiveTab("youtube")}
              className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === "youtube"
                  ? "bg-red-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              <Play className="w-5 h-5" />
              YouTube
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
                activeTab === "upload"
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              <Upload className="w-5 h-5" />
              Upload video
            </button>
          </div>

          {/* Content */}
          {activeTab === "youtube" ? (
            <YouTubeInput value={videoUrl} onChange={setVideoUrl} />
          ) : (
            <VideoUploader onUpload={setUploadedVideo} video={uploadedVideo} />
          )}

          {/* Caption Style */}
          <div className="mt-8">
            <label className="text-sm text-zinc-400 mb-3 block">
              GAYA CAPTION <span className="text-zinc-600">(Clean disarankan)</span>
            </label>
            <CaptionStyleSelector value={captionStyle} onChange={setCaptionStyle} />
          </div>

          {/* Process Button */}
          <button
            onClick={handleProcess}
            disabled={isProcessing || !uploadedVideo || !ffmpeg}
            className="w-full mt-8 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Memproses... {processingProgress}%
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Cari Preview
              </>
            )}
          </button>

          {/* Progress Bar */}
          {isProcessing && (
            <div className="mt-4 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
          )}

          {/* Video Preview */}
          {processedVideoUrl && (
            <div className="mt-8 p-6 bg-zinc-800/50 rounded-lg border border-zinc-700">
              <h3 className="text-xl font-bold mb-4">Preview Klip</h3>
              <video
                ref={videoRef}
                src={processedVideoUrl}
                controls
                className="w-full rounded-lg bg-black"
              />
              <button
                onClick={handleDownload}
                className="btn-primary w-full mt-4"
              >
                <Download className="w-5 h-5" />
                Download Video
              </button>
            </div>
          )}

          <p className="text-center text-zinc-600 text-sm mt-4">
            Tonton demo gratis • download & video sendiri untuk subscriber
          </p>
        </div>

        {/* Settings */}
        <SettingsPanel settings={settings} onChange={setSettings} />
      </main>
    </div>
  );
}