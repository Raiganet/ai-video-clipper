'use client';

interface CaptionStyle {
  id: string;
  name: string;
  label: string;
  description?: string;
  badge?: string;
}

const captionStyles: CaptionStyle[] = [
  { id: 'none', name: 'Tanpa', label: 'Ø' },
  {
    id: 'clean',
    name: 'WAJIB NONTON',
    label: 'Clean',
    description: 'Saran',
  },
  {
    id: 'karaoke',
    name: 'WAJIB NONTON',
    label: 'Karaoke ✓',
    badge: 'recommended',
  },
  {
    id: 'highlight',
    name: 'WAJIB',
    label: 'Pili',
  },
  {
    id: 'pop',
    name: 'NONTON',
    label: 'Pop',
  },
];

interface CaptionStyleSelectorProps {
  selectedStyle: string;
  onSelectStyle: (style: string) => void;
}

export default function CaptionStyleSelector({
  selectedStyle,
  onSelectStyle,
}: CaptionStyleSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">GAYA CAPTION</h3>
        <span className="text-xs text-gray-500">Clean disarankan</span>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {captionStyles.map((style) => (
          <button
            key={style.id}
            onClick={() => onSelectStyle(style.id)}
            className={`relative p-4 rounded-xl border-2 transition-all duration-200 ${
              selectedStyle === style.id
                ? 'border-emerald-500 bg-emerald-500/10'
                : 'border-gray-700 hover:border-gray-600 bg-gray-800'
            }`}
          >
            {style.badge && (
              <div className="absolute -top-2 -right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">{style.name}</div>
              <div className="font-semibold text-sm">{style.label}</div>
              {style.description && (
                <div className="text-xs text-gray-500 mt-1">{style.description}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}