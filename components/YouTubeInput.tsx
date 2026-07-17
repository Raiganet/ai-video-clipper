'use client';

import { useState } from 'react';
import { Youtube, Upload } from 'lucide-react';

interface YouTubeInputProps {
  onUrlSubmit: (url: string) => void;
  onFileUpload: (file: File) => void;
}

export default function YouTubeInput({ onUrlSubmit, onFileUpload }: YouTubeInputProps) {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'youtube' | 'upload'>('youtube');
  const [isDragging, setIsDragging] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (youtubeUrl.trim()) {
      onUrlSubmit(youtubeUrl);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (validTypes.includes(file.type)) {
      onFileUpload(file);
    } else {
      alert('Format video tidak didukung. Gunakan MP4, WebM, atau MOV.');
    }
  };

  return (
    <div className="card">
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('youtube')}
          className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeTab === 'youtube'
              ? 'bg-red-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Youtube size={20} />
          YouTube
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeTab === 'upload'
              ? 'bg-emerald-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          <Upload size={20} />
          Upload video
        </button>
      </div>

      {activeTab === 'youtube' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="input-field pl-12"
            />
            <Youtube className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500" size={20} />
          </div>
          <button type="submit" className="btn-primary w-full">
            Proses Video
          </button>
        </form>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
            isDragging
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <Upload className="mx-auto mb-4 text-gray-400" size={48} />
          <p className="text-gray-300 mb-2">Upload MP4, WebM, atau MOV</p>
          <p className="text-sm text-gray-500">atau klik untuk memilih file</p>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            className="hidden"
            id="video-upload"
          />
          <label
            htmlFor="video-upload"
            className="mt-4 inline-block px-6 py-2 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700 transition-all"
          >
            Pilih File
          </label>
        </div>
      )}
    </div>
  );
}