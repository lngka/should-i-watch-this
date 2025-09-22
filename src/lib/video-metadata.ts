// YouTube metadata extraction using public APIs (Vercel-compatible)

import ytdl from 'ytdl-core';

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

		// Try YouTube Data API v3 first (if API key is available)
		if (process.env.YOUTUBE_API_KEY) {
			try {
				const apiMetadata = await getYouTubeDataApiMetadata(videoId);
				if (apiMetadata) {
					return apiMetadata;
				}
			} catch (apiError) {
				console.warn('YouTube Data API failed, falling back to oEmbed:', apiError);
			}
		}

		// Fallback to YouTube oEmbed API (no API key required)
		const oembedMetadata = await getYouTubeOEmbedMetadata(videoId);
		if (oembedMetadata && oembedMetadata.duration) {
			return oembedMetadata;
		}

		// Additional fallback: Try ytdl-core for duration
		try {
			const ytdlMetadata = await getYtdlCoreMetadata(videoUrl);
			if (ytdlMetadata && ytdlMetadata.duration) {
				// Merge with oEmbed data if available (for title/channel)
				return {
					...oembedMetadata,
					...ytdlMetadata
				};
			}
		} catch (ytdlError) {
			console.warn('ytdl-core metadata extraction failed:', ytdlError);
		}

		// If we have oEmbed data but no duration, return it anyway
		if (oembedMetadata) {
			return oembedMetadata;
		}

		throw new Error('All metadata extraction methods failed');
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

/**
 * Get video metadata using YouTube Data API v3
 * Requires YOUTUBE_API_KEY environment variable
 */
async function getYouTubeDataApiMetadata(videoId: string): Promise<VideoMetadata | null> {
	const apiKey = process.env.YOUTUBE_API_KEY;
	if (!apiKey) {
		return null;
	}

	const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails,statistics&key=${apiKey}`;
	
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`YouTube Data API error: ${response.status}`);
	}

	const data = await response.json();
	if (!data.items || data.items.length === 0) {
		throw new Error('Video not found');
	}

	const video = data.items[0];
	const snippet = video.snippet;
	const statistics = video.statistics;
	const contentDetails = video.contentDetails;

	// Parse duration (ISO 8601 format like PT4M13S)
	const duration = parseISODuration(contentDetails.duration);

	return {
		title: snippet.title || null,
		channel: snippet.channelTitle || null,
		description: snippet.description || null,
		duration: duration,
		viewCount: statistics.viewCount ? parseInt(statistics.viewCount) : null,
		uploadDate: snippet.publishedAt ? snippet.publishedAt.split('T')[0] : null,
	};
}

/**
 * Get basic video metadata using YouTube oEmbed API
 * No API key required, but limited information
 */
async function getYouTubeOEmbedMetadata(videoId: string): Promise<VideoMetadata | null> {
	const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
	
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`YouTube oEmbed API error: ${response.status}`);
	}

	const data = await response.json();

	return {
		title: data.title || null,
		channel: data.author_name || null,
		description: null, // oEmbed doesn't provide description
		duration: null, // oEmbed doesn't provide duration
		viewCount: null, // oEmbed doesn't provide view count
		uploadDate: null, // oEmbed doesn't provide upload date
	};
}

/**
 * Get video metadata using ytdl-core
 * Provides duration and basic video info
 */
async function getYtdlCoreMetadata(videoUrl: string): Promise<VideoMetadata | null> {
	try {
		// Create clean URL
		const videoId = extractVideoId(videoUrl);
		if (!videoId) {
			return null;
		}
		const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;

		// Validate URL
		if (!ytdl.validateURL(cleanVideoUrl)) {
			return null;
		}

		// Get video info
		const videoInfo = await ytdl.getInfo(cleanVideoUrl);
		const details = videoInfo.videoDetails;

		// Extract duration
		const duration = parseInt(details.lengthSeconds) || null;

		return {
			title: details.title || null,
			channel: details.author?.name || null,
			description: details.description || null,
			duration: duration,
			viewCount: details.viewCount ? parseInt(details.viewCount) : null,
			uploadDate: details.publishDate || null,
		};
	} catch (error) {
		console.warn('ytdl-core metadata extraction failed:', error);
		return null;
	}
}

/**
 * Parse ISO 8601 duration format (e.g., PT4M13S) to seconds
 */
function parseISODuration(duration: string): number | null {
	if (!duration) return null;
	
	// Remove PT prefix
	const cleanDuration = duration.replace('PT', '');
	
	let totalSeconds = 0;
	
	// Parse hours
	const hoursMatch = cleanDuration.match(/(\d+)H/);
	if (hoursMatch) {
		totalSeconds += parseInt(hoursMatch[1]) * 3600;
	}
	
	// Parse minutes
	const minutesMatch = cleanDuration.match(/(\d+)M/);
	if (minutesMatch) {
		totalSeconds += parseInt(minutesMatch[1]) * 60;
	}
	
	// Parse seconds
	const secondsMatch = cleanDuration.match(/(\d+)S/);
	if (secondsMatch) {
		totalSeconds += parseInt(secondsMatch[1]);
	}
	
	return totalSeconds;
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
		/youtube\.com\/watch\?.*v=([^&\n?#]+)/,
		/youtube\.com\/live\/([^&\n?#]+)/
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) {
			return match[1];
		}
	}

	return null;
}
