import fs from "fs";

/**
 * Get file size in bytes
 */
export async function getFileSize(audioPath: string): Promise<number> {
	const stats = await fs.promises.stat(audioPath);
	return stats.size;
}

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/youtube\.com\/v\/([^&\n?#]+)/,
		/youtube\.com\/watch\?.*v=([^&\n?#]+)/
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
 * Get basic video info using YouTube oEmbed API (no API key required)
 * This is a lightweight alternative to the ytdlp-based getVideoInfo
 */
export async function getVideoInfo(videoUrl: string): Promise<{ title: string; channel: string } | null> {
	try {
		// Extract video ID from URL
		const videoId = extractVideoId(videoUrl);
		if (!videoId) {
			console.warn(`Could not extract video ID from URL: ${videoUrl}`);
			return null;
		}
		
		// Use YouTube oEmbed API for basic info
		const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
		
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`YouTube oEmbed API error: ${response.status}`);
		}

		const data = await response.json();

		return {
			title: data.title || 'Unknown Title',
			channel: data.author_name || 'Unknown Channel'
		};
	} catch (error) {
		console.warn(`Failed to get video info for ${videoUrl}:`, error);
		return null;
	}
}
