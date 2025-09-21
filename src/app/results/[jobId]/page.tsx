import { generateOpenGraphTags, generateSocialMediaData } from "@/lib/social-sharing";
import { Metadata } from "next";
import ResultPageClient from "./ResultPageClient";

type Props = {
  params: Promise<{ jobId: string }>;
};

// Generate dynamic metadata with actual video data
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { jobId } = await params;
  
  try {
    // Fetch the actual job data to generate proper metadata
    const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/result/${jobId}`, {
      cache: 'no-store' // Ensure we get fresh data
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Generate social media data with actual video information
      const socialData = generateSocialMediaData(
        data.videoMetadata || { title: null, channel: null, url: '' },
        data.analysis,
        data.status,
        jobId
      );
      
      // Generate proper Open Graph tags
      return generateOpenGraphTags(socialData);
    }
  } catch (error) {
    console.error('Failed to fetch job data for metadata:', error);
  }
  
  // Fallback to basic metadata if fetching fails
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