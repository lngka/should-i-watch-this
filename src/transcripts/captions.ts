import { YoutubeTranscript } from "youtube-transcript";

export async function fetchCaptions(videoUrl: string): Promise<string | null> {
	try {
		console.log(`Attempting to fetch captions for: ${videoUrl}`);
		const transcript = await YoutubeTranscript.fetchTranscript(videoUrl);
		if (!transcript?.length) {
			console.log("No captions found");
			return null;
		}
		const text = transcript.map((t) => t.text).join(" ").trim();
		console.log(`Found captions, length: ${text.length}`);
		return text;
	} catch (error) {
		console.log(`Caption fetch failed: ${error}`);
		return null;
	}
}

