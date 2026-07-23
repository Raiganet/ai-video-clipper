"use client";

import { useState } from "react";
import { Play } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function YouTubeInput({ value, onChange }: Props) {
  const [error, setError] = useState("");

  const validateYouTubeUrl = (url: string) => {
    const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    return pattern.test(url);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (val && !validateYouTubeUrl(val)) {
      setError("Format URL YouTube tidak valid");
    } else {
      setError("");
    }
  };

  return (
    <div>
      <div className="relative">
        <input
          type="url"
          value={value}
          onChange={handleChange}
          placeholder="https://www.youtube.com/watch?v=..."
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 pl-12 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
        />
        <Play className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
      </div>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <div className="flex items-center gap-2 mt-3 text-sm text-zinc-500">
        <input type="checkbox" className="rounded bg-zinc-800 border-zinc-700" defaultChecked />
        <span>Link ini video contoh — video kamu sendiri dibuka setelah berlangganan.</span>
      </div>
    </div>
  );
}