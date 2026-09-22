import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kastriva AI Video Clipper - Ubah Video Panjang Jadi Klip Viral",
  description: "AI video clipper dengan Briefing-Aware Clipper, campaign compliance, speaker diarization, word-level karaoke, cluster render queue, smart framing, AI Publish Pack, subtitle export, dan cloud draft sync.",
  applicationName: "Kastriva AI Video Clipper",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "AI Clipper" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = { themeColor: "#059669", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-black text-white antialiased`}>{children}</body>
    </html>
  );
}
