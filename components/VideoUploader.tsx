"use client";

import { useCallback, useState } from "react";
import { UploadCloud, FileVideo } from "lucide-react";
import { useDropzone } from "react-dropzone";

interface Props {
  onUpload: (file: File | null) => void;
  video: File | null;
}

export default function VideoUploader({ onUpload, video }: Props) {
  const [uploadProgress, setUploadProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      onUpload(file);
      // Simulate upload progress
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        setUploadProgress(progress);
        if (progress >= 100) clearInterval(interval);
      }, 200);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/*": [".mp4", ".webm", ".mov"],
    },
    maxFiles: 1,
  });

  if (video) {
    return (
      <div className="border border-zinc-700 rounded-lg p-6 bg-zinc-800/50">
        <div className="flex items-center gap-4">
          <FileVideo className="w-12 h-12 text-emerald-500" />
          <div className="flex-1">
            <p className="font-medium text-white">{video.name}</p>
            <p className="text-sm text-zinc-400">
              {(video.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            {uploadProgress < 100 && (
              <div className="mt-2 bg-zinc-700 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => onUpload(null)}
          className="text-sm text-red-400 hover:text-red-300 mt-4"
        >
          Hapus video
        </button>
      </div>
    );
  }

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
        isDragActive
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-zinc-700 hover:border-zinc-600"
      }`}
    >
      <input {...getInputProps()} />
      <UploadCloud className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
      <p className="text-white font-medium mb-2">
        {isDragActive ? "Lepaskan file di sini" : "Upload MP4, WebM, atau MOV"}
      </p>
      <p className="text-zinc-500 text-sm">
        atau drag & drop file video di sini
      </p>
      <p className="text-zinc-600 text-xs mt-4">
        Upload dan video kamu sendiri dibuka untuk subscriber beta.
      </p>
    </div>
  );
}