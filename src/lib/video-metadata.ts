import { YtDlp } from "ytdlp-nodejs";

// Create a global instance of YtDlp
const ytDlp = new YtDlp();

export interface VideoMetadata {
	title: string | null;
	channel: string | null;
	description: string | null;
	duration: number | null;
	viewCount: number | null;
	uploadDate: string | null;
}

export async function extractVideoMetadata(videoUrl: string): Promise<VideoMetadata> {
	try {
		// Extract video ID from URL (handles playlist URLs by getting the main video ID)
		const videoId = extractVideoId(videoUrl);
		if (!videoId) {
			throw new Error('Could not extract video ID from URL');
		}
		
		// Create a clean video URL without playlist parameters
		const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
		
		const info = await ytDlp.getInfoAsync(cleanVideoUrl);
		
		// Check if it's a video (not a playlist)
		if (info._type !== 'video') {
			throw new Error('URL is not a single video');
		}

		return {
			title: info.title || null,
			channel: info.uploader || null,
			description: info.description || null,
			duration: info.duration ? Math.round(info.duration) : null,
			viewCount: info.view_count || null,
			uploadDate: info.upload_date || null,
		};
	} catch (error) {
		console.error(`Failed to extract video metadata for ${videoUrl}:`, error);
		return {
			title: null,
			channel: null,
			description: null,
			duration: null,
			viewCount: null,
			uploadDate: null,
		};
	}
}

export function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	} else {
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}
}

export function formatViewCount(count: number): string {
	if (count >= 1000000) {
		return `${(count / 1000000).toFixed(1)}M views`;
	} else if (count >= 1000) {
		return `${(count / 1000).toFixed(1)}K views`;
	} else {
		return `${count} views`;
	}
}

export function getYouTubeEmbedUrl(videoUrl: string): string {
	// Extract video ID from various YouTube URL formats
	const videoId = extractVideoId(videoUrl);
	if (!videoId) return videoUrl;
	
	return `https://www.youtube.com/embed/${videoId}`;
}

export function extractVideoId(url: string): string | null {
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
