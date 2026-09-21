"use client";

import { useCallback } from "react";
import { UploadCloud, FileVideo, X } from "lucide-react";
import { useDropzone, FileRejection } from "react-dropzone";

interface Props {
  onUpload: (file: File | null) => void;
  video: File | null;
}

const MAX_BROWSER_FILE = 1.5 * 1024 * 1024 * 1024;

export default function VideoUploader({ onUpload, video }: Props) {
  const onDrop = useCallback((acceptedFiles: File[], rejected: FileRejection[]) => {
    const file = acceptedFiles[0];
    if (file) onUpload(file);
    if (!file && rejected.length > 0) {
      alert("File tidak didukung atau terlalu besar. Gunakan MP4/WebM/MOV hingga 1,5 GB.");
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".webm", ".mov", ".m4v"] },
    maxFiles: 1,
    maxSize: MAX_BROWSER_FILE,
  });

  if (video) {
    return (
      <div className="border border-zinc-700 rounded-lg p-5 bg-zinc-800/50">
        <div className="flex items-center gap-4">
          <FileVideo className="w-11 h-11 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-white truncate" title={video.name}>{video.name}</p>
            <p className="text-sm text-zinc-400">{(video.size / (1024 * 1024)).toFixed(2)} MB • diproses lokal untuk clipping</p>
          </div>
          <button type="button" onClick={() => onUpload(null)} className="p-2 text-zinc-500 hover:text-red-400" aria-label="Hapus video"><X className="w-5 h-5" /></button>
        </div>
      </div>
    );
  }

  return (
    <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all ${isDragActive ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-700 hover:border-zinc-600"}`}>
      <input {...getInputProps()} />
      <UploadCloud className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
      <p className="text-white font-medium mb-2">{isDragActive ? "Lepaskan file di sini" : "Upload MP4, WebM, MOV, atau M4V"}</p>
      <p className="text-zinc-500 text-sm">atau drag & drop file video di sini</p>
      <p className="text-zinc-600 text-xs mt-4">File video tetap di browser untuk proses clipping. Hanya audio terkompresi yang dikirim saat AI digunakan.</p>
    </div>
  );
}
