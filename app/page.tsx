'use client';

import { useState } from 'react';
import { Sparkles, Play, Check } from 'lucide-react';
import YouTubeInput from '@/components/YouTubeInput';
import CaptionStyleSelector from '@/components/CaptionStyleSelector';
import SettingsPanel from '@/components/SettingsPanel';

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [captionStyle, setCaptionStyle] = useState('karaoke');
  const [isProcessing, setIsProcessing] = useState(false);
  const [settings, setSettings] = useState({
    previewCount: 5,
    vibe: 'viral',
    crop: 'auto',
    aiMode: 'fast',
  });

  const handleUrlSubmit = (url: string) => {
    setVideoUrl(url);
    setUploadedFile(null);
  };

  const handleFileUpload = (file: File) => {
    setUploadedFile(file);
    setVideoUrl('');
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    // Simulasi proses
    await new Promise(resolve => setTimeout(resolve, 3000));
    setIsProcessing(false);
    alert('Video sedang diproses! Fitur ini akan terhubung dengan backend.');
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Sparkles className="text-white" size={20} />
            </div>
            <div>
              <h1 className="font-bold text-lg">QREED</h1>
              <p className="text-xs text-gray-400">AI Clipper</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-500 text-xs rounded">BETA</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Demo Mode Badge */}
        <div className="flex justify-center mb-6">
          <span className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm flex items-center gap-2">
            <Check size={16} />
            Mode demo • hasil asli dari video contoh
          </span>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Ubah video panjang jadi{' '}
            <span className="gradient-text">klip viral</span>
          </h2>
          <p className="text-gray-400 text-lg">
            Tempel link, klik sekali. QREED yang cariin momen terbaiknya.
          </p>
        </div>

        {/* Main Card */}
        <div className="space-y-6">
          {/* Video Input */}
          <YouTubeInput
            onUrlSubmit={handleUrlSubmit}
            onFileUpload={handleFileUpload}
          />

          {/* Video Info */}
          {(videoUrl || uploadedFile) && (
            <div className="card bg-gray-800/50">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Play size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">
                    {videoUrl || uploadedFile?.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {videoUrl 
                      ? 'Link ini video contoh — video kamu sendiri dibuka setelah berlangganan.'
                      : 'File siap diproses'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Caption Style */}
          <div className="card">
            <CaptionStyleSelector
              selectedStyle={captionStyle}
              onSelectStyle={setCaptionStyle}
            />
          </div>

          {/* Process Button */}
          <button
            onClick={handleProcess}
            disabled={isProcessing || (!videoUrl && !uploadedFile)}
            className="btn-primary w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <Sparkles size={20} />
                Cari Preview
              </>
            )}
          </button>

          <p className="text-center text-xs text-gray-500">
            Tonton demo gratis • download & video sendiri untuk subscriber
          </p>

          {/* Settings Panel */}
          <SettingsPanel
            settings={settings}
            onUpdateSettings={setSettings}
          />
        </div>
      </main>
    </div>
  );
}