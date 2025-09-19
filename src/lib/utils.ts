import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Generate a job ID that can be shared across users for the same video
 * Uses video ID for YouTube videos, falls back to random UUID for others
 */
export function generateJobId(videoUrl: string): string {
  const videoId = extractVideoId(videoUrl);
  if (videoId) {
    // Use video ID as job ID for sharing across users
    return videoId;
  }
  // Fallback to random ID for non-YouTube URLs
  return crypto.randomUUID();
}
