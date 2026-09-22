"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState<DeferredInstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker registration failed", error));
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as DeferredInstallPrompt);
    };
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return <span className="hidden md:flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2"><Smartphone className="w-4 h-4" /> Terpasang</span>;
  }
  if (!promptEvent) return null;

  return (
    <button type="button" onClick={async () => {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
    }} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm flex items-center gap-2">
      <Download className="w-4 h-4" /><span className="hidden sm:inline">Install</span>
    </button>
  );
}
