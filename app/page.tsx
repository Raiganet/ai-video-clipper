"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Play, Sparkles } from "lucide-react";
import YouTubeInput from "@/components/YouTubeInput";
import VideoUploader from "@/components/VideoUploader";
import CaptionStyleSelector from "@/components/CaptionStyleSelector";
import SettingsPanel from "@/components/SettingsPanel";

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

  const handleProcess = async () => {
    setIsProcessing(true);
    // Simulasi proses AI (nanti diganti dengan API call sesungguhnya)
    setTimeout(() => {
      setIsProcessing(false);
      alert("Video berhasil diproses! (Mode Demo)");
    }, 3000);
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
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 mb-4">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span className="text-emerald-400 text-sm">
              Mode demo • hasil asli dari video contoh
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Ubah video panjang jadi{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">
              klip viral
            </span>
          </h1>
          <p className="text-zinc-400 text-lg">
            Tempel link, klik sekali. AI yang cariin momen terbaiknya.
          </p>
        </motion.div>

        {/* Main Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-8"
        >
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

          {/* Content based on active tab */}
          {activeTab === "youtube" ? (
            <YouTubeInput value={videoUrl} onChange={setVideoUrl} />
          ) : (
            <VideoUploader onUpload={setUploadedVideo} video={uploadedVideo} />
          )}

          {/* Caption Style Selector */}
          <div className="mt-8">
            <label className="text-sm text-zinc-400 mb-3 block">
              GAYA CAPTION <span className="text-zinc-600">(Clean disarankan)</span>
            </label>
            <CaptionStyleSelector value={captionStyle} onChange={setCaptionStyle} />
          </div>

          {/* Process Button */}
          <button
            onClick={handleProcess}
            disabled={isProcessing || (!videoUrl && !uploadedVideo)}
            className="w-full mt-8 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Cari Preview
              </>
            )}
          </button>

          <p className="text-center text-zinc-600 text-sm mt-4">
            Tonton demo gratis • download & video sendiri untuk subscriber
          </p>
        </motion.div>

        {/* Advanced Settings */}
        <SettingsPanel settings={settings} onChange={setSettings} />
      </main>
    </div>
  );
}