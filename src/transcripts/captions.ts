import { YoutubeTranscript } from "youtube-transcript";

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

export async function fetchCaptions(videoUrl: string): Promise<string | null> {
	const maxRetries = 3;
	const retryDelay = 1000; // 1 second
	
	// Extract video ID from URL (handles playlist URLs by getting the main video ID)
	const videoId = extractVideoId(videoUrl);
	if (!videoId) {
		console.warn(`Could not extract video ID from URL: ${videoUrl}`);
		return null;
	}
	
	// Create a clean video URL without playlist parameters
	const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
	
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`Attempting to fetch captions for: ${cleanVideoUrl} (attempt ${attempt}/${maxRetries})`);
			
			// Add timeout to the transcript fetch
			const transcript = await Promise.race([
				YoutubeTranscript.fetchTranscript(cleanVideoUrl),
				new Promise<never>((_, reject) => 
					setTimeout(() => reject(new Error("Caption fetch timeout")), 15000) // 15 second timeout
				)
			]);
			
			if (!transcript?.length) {
				console.log("No captions found");
				return null;
			}
			
			const text = transcript.map((t) => t.text).join(" ").trim();
			console.log(`Found captions, length: ${text.length}`);
			return text;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.log(`Caption fetch attempt ${attempt} failed: ${errorMessage}`);
			
			// If this is the last attempt, return null
			if (attempt === maxRetries) {
				console.log(`All ${maxRetries} caption fetch attempts failed`);
				return null;
			}
			
			// Wait before retrying
			await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
		}
	}
	
	return null;
}

