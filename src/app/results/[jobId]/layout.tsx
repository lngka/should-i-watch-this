import prisma from "@/lib/prisma";
import { generateOpenGraphTags, generateSocialMediaData } from "@/lib/social-sharing";
import { extractVideoMetadata } from "@/lib/video-metadata";
import { Metadata } from "next";

type Props = {
  params: Promise<{ jobId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { jobId } = await params;
    
    // Fetch job data
    const job = await prisma.job.findUnique({ 
      where: { id: jobId }, 
      include: { 
        analysis: { 
          include: { 
            claims: { 
              include: { 
                spotChecks: true 
              } 
            },
            video: true
          } 
        } 
      } 
    });
    
    if (!job) {
      // Return default metadata if job not found
      return {
        title: "Video Analysis - ShouldIWatchThis",
        description: "AI-powered YouTube video analysis and trust scoring",
      };
    }
    
    // Get video metadata
    let videoMetadata = {
      title: job.analysis?.video?.title || null,
      channel: job.analysis?.video?.channel || null,
      url: job.videoUrl
    };
    
    // If we don't have video metadata in the database, try to extract it from the URL
    if (!videoMetadata.title || !videoMetadata.channel) {
      try {
        const extractedMetadata = await extractVideoMetadata(job.videoUrl);
        videoMetadata = {
          title: videoMetadata.title || extractedMetadata.title,
          channel: videoMetadata.channel || extractedMetadata.channel,
          url: job.videoUrl
        };
      } catch (error) {
        console.error('Failed to extract video metadata for social sharing:', error);
      }
    }
    
    // Generate social media data
    const socialData = generateSocialMediaData(
      videoMetadata,
      job.analysis ? {
        oneLiner: job.analysis.oneLiner,
        trustScore: job.analysis.trustScore,
        bulletPoints: Array.isArray(job.analysis.bulletPoints) ? job.analysis.bulletPoints as string[] : []
      } : undefined,
      job.status,
      jobId
    );
    
    // Generate Open Graph tags
    const ogTags = generateOpenGraphTags(socialData);
    
    return {
      ...ogTags,
      // Add additional meta tags
      robots: {
        index: true,
        follow: true,
      },
    };
  } catch (error) {
    console.error('Error generating metadata for result page:', error);
    
    // Return fallback metadata
    return {
      title: "Video Analysis - ShouldIWatchThis",
      description: "AI-powered YouTube video analysis and trust scoring",
      openGraph: {
        title: "Video Analysis - ShouldIWatchThis",
        description: "AI-powered YouTube video analysis and trust scoring",
        siteName: "ShouldIWatchThis",
        type: "website",
      },
    };
  }
}

export default function ResultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
