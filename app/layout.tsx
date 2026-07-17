import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Video Clipper - Ubah Video Panjang Jadi Klip Viral",
  description: "AI-powered video clipper untuk membuat viral clips dari video panjang",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${inter.className} bg-black text-white`}>
        {children}
      </body>
    </html>
  );
}