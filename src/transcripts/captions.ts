import { YoutubeTranscript } from "youtube-transcript";

export async function fetchCaptions(videoUrl: string): Promise<string | null> {
	const maxRetries = 3;
	const retryDelay = 1000; // 1 second
	
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`Attempting to fetch captions for: ${videoUrl} (attempt ${attempt}/${maxRetries})`);
			
			// Add timeout to the transcript fetch
			const transcript = await Promise.race([
				YoutubeTranscript.fetchTranscript(videoUrl),
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

