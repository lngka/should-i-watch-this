import { extractVideoId } from "./utils";

export interface SocialMediaData {
  title: string;
  description: string;
  image: string;
  url: string;
  type: 'video' | 'article';
}

/**
 * Generate YouTube video thumbnail URL
 * YouTube provides several thumbnail sizes:
 * - maxresdefault: 1280x720 (best quality, may not exist for all videos)
 * - hqdefault: 480x360 (high quality)
 * - mqdefault: 320x180 (medium quality)
 * - default: 120x90 (low quality)
 */
export function getYouTubeThumbnail(videoUrl: string, quality: 'maxresdefault' | 'hqdefault' | 'mqdefault' | 'default' = 'hqdefault'): string | null {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return null;
  }
  
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Generate social media metadata for a video analysis result
 */
export function generateSocialMediaData(
  videoMetadata: { title: string | null; channel: string | null; url: string },
  analysis?: { oneLiner?: string; trustScore?: number; bulletPoints?: string[] },
  status?: string,
  jobId?: string
): SocialMediaData {
  const baseUrl = process.env.SITE_URL || 'http://localhost:3000';
  const thumbnail = getYouTubeThumbnail(videoMetadata.url, 'hqdefault');
  
  let title = 'ShouldIWatchThis - AI Video Analysis';
  let description = 'Get AI-powered analysis and trust scores for YouTube videos';
  
  if (videoMetadata.title) {
    title = `${videoMetadata.title} - ShouldIWatchThis Analysis`;
  }
  
  if (status === 'COMPLETED' && analysis) {
    // Show analysis results
    if (analysis.oneLiner) {
      description = analysis.oneLiner;
      if (analysis.trustScore !== undefined) {
        description += ` (Trust Score: ${analysis.trustScore}/100)`;
      }
    } else if (analysis.bulletPoints && analysis.bulletPoints.length > 0) {
      description = analysis.bulletPoints[0];
    }
  } else if (status === 'RUNNING') {
    description = `Analyzing "${videoMetadata.title || 'this video'}" with AI...`;
  } else if (status === 'FAILED') {
    description = `Analysis failed for "${videoMetadata.title || 'this video'}"`;
  } else if (videoMetadata.title) {
    description = `AI analysis for "${videoMetadata.title}" by ${videoMetadata.channel || 'Unknown Channel'}`;
  }
  
  // Use jobId for URL (since jobId and videoId are now the same)
  const resultUrl = jobId ? `${baseUrl}/results/${jobId}` : `${baseUrl}/results`;
  
  return {
    title,
    description,
    image: thumbnail || `${baseUrl}/og-default.svg`, // Fallback image
    url: resultUrl,
    type: 'video'
  };
}

/**
 * Generate Open Graph meta tags for social media sharing
 */
export function generateOpenGraphTags(data: SocialMediaData) {
  return {
    title: data.title,
    description: data.description,
    openGraph: {
      title: data.title,
      description: data.description,
      url: data.url,
      siteName: 'ShouldIWatchThis',
      images: [
        {
          url: data.image,
          width: 1200,
          height: 630,
          alt: data.title,
        },
      ],
      type: data.type,
    },
    twitter: {
      card: 'summary_large_image',
      title: data.title,
      description: data.description,
      images: [data.image],
    },
  };
}
