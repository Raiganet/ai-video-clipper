import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kastriva AI Video Clipper",
    short_name: "AI Clipper",
    description: "AI video clipper dengan multi-video Campaign Workspace, Campaign Submission Manager, Briefing-Aware Clipper, campaign compliance, versioning approval, speaker diarization per source, cluster render queue, Publish Pack, dan final submission export.",
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
