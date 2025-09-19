import { Metadata } from "next";
import ResultPageClient from "./ResultPageClient";

type Props = {
  params: Promise<{ jobId: string }>;
};

// Generate basic metadata without database calls
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { jobId } = await params;
  
  return {
    title: "Video Analysis - ShouldIWatchThis",
    description: "AI-powered YouTube video analysis and trust scoring",
    openGraph: {
      title: "Video Analysis - ShouldIWatchThis",
      description: "AI-powered YouTube video analysis and trust scoring",
      url: `${process.env.SITE_URL || 'http://localhost:3000'}/results/${jobId}`,
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
      title: "Video Analysis - ShouldIWatchThis",
      description: "AI-powered YouTube video analysis and trust scoring",
      images: ["/og-default.svg"],
    },
  };
}

export default function ResultPage({ params }: Props) {
  return <ResultPageClient params={params} />;
}