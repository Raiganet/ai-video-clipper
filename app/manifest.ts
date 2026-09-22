import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kastriva AI Video Clipper",
    short_name: "AI Clipper",
    description: "AI video clipper dengan Briefing-Aware Clipper, campaign compliance, speaker diarization, word-level karaoke, cluster render queue, smart framing, Publish Pack, dan subtitle export.",
    start_url: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#059669",
    orientation: "any",
    categories: ["video", "productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
