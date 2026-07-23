"use client";

import { useState, useRef } from "react";
import { Download, Loader2 } from "lucide-react";

interface Props {
  videoBlob: Blob | null;
  isProcessing: boolean;
}

export default function VideoPreview({ videoBlob, isProcessing }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!videoBlob && !isProcessing) return null;

  const handleDownload = () => {
    if (!videoBlob) return;
    
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-clip-${Date.now()}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-8">
      <h3 className="text-xl font-bold mb-4">Preview Klip</h3>
      
      {isProcessing ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
          <p className="text-zinc-400">Sedang memproses video...</p>
        </div>
      ) : videoBlob ? (
        <div>
          <video
            ref={videoRef}
            src={URL.createObjectURL(videoBlob)}
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
      ) : null}
    </div>
  );
}