'use client';

interface SettingsPanelProps {
  settings: {
    previewCount: number;
    vibe: string;
    crop: string;
    aiMode: string;
  };
  onUpdateSettings: (settings: any) => void;
}

const previewCounts = [3, 5, 8, 10];
const vibes = [
  { id: 'viral', label: 'Viral' },
  { id: 'education', label: 'Edukasi' },
  { id: 'sales', label: 'Jualan' },
  { id: 'summary', label: 'Ringkas' },
];
const crops = [
  { id: 'auto', label: 'Auto' },
  { id: '1:1', label: '1:1' },
  { id: 'full', label: 'Utuh' },
];
const aiModes = [
  { id: 'fast', label: 'Transkrip cepat' },
  { id: 'complete', label: 'Visual lengkap' },
];

export default function SettingsPanel({ settings, onUpdateSettings }: SettingsPanelProps) {
  return (
    <div className="card mt-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-medium text-gray-400">Atur sendiri (opsional)</h3>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Jumlah Preview */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-3">JUMLAH PREVIEW</h4>
          <div className="flex gap-2">
            {previewCounts.map((count) => (
              <button
                key={count}
                onClick={() => onUpdateSettings({ ...settings, previewCount: count })}
                className={`w-10 h-10 rounded-lg transition-all ${
                  settings.previewCount === count
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        {/* Vibe */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-3">VIBE</h4>
          <div className="flex flex-wrap gap-2">
            {vibes.map((vibe) => (
              <button
                key={vibe.id}
                onClick={() => onUpdateSettings({ ...settings, vibe: vibe.id })}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${
                  settings.vibe === vibe.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {vibe.label}
              </button>
            ))}
          </div>
        </div>

        {/* Crop */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-3">CROP</h4>
          <div className="flex gap-2">
            {crops.map((crop) => (
              <button
                key={crop.id}
                onClick={() => onUpdateSettings({ ...settings, crop: crop.id })}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${
                  settings.crop === crop.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {crop.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mode AI */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 mb-3">MODE AI</h4>
          <div className="flex flex-wrap gap-2">
            {aiModes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => onUpdateSettings({ ...settings, aiMode: mode.id })}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${
                  settings.aiMode === mode.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}