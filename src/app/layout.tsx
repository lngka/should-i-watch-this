import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShouldIWatchThis – AI YouTube Summary & Trust Review Tool",
  description:
    "AI YouTube summary and trust review. YouTube transcript, should I watch this, video trust score, AI video analysis.",
  keywords: [
    "youtube summary",
    "youtube transcript",
    "should I watch this",
    "video trust score",
    "ai video analysis",
  ],
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  openGraph: {
    title: "ShouldIWatchThis – AI YouTube Summary & Trust Review Tool",
    description: "AI YouTube summary and trust review. YouTube transcript, should I watch this, video trust score, AI video analysis.",
    siteName: "ShouldIWatchThis",
    type: "website",
    images: [
      {
        url: "/og-default.svg",
        width: 1200,
        height: 630,
        alt: "ShouldIWatchThis - AI YouTube Video Analysis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ShouldIWatchThis – AI YouTube Summary & Trust Review Tool",
    description: "AI YouTube summary and trust review. YouTube transcript, should I watch this, video trust score, AI video analysis.",
    images: ["/og-default.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
