// SIWT Media Worker integration for transcription

export interface SIWTTranscriptionResponse {
	source: string;
	language: string;
	transcript: string;
	title: string;
	channel: string;
	durationSec: number;
	thumbnail: string;
	videoUrl: string;
}

export interface SIWTTranscriptionRequest {
	videoId: string;
}

/**
 * Calls the SIWT Media Worker to transcribe a YouTube video
 */
export async function transcribeWithSIWT(videoId: string): Promise<SIWTTranscriptionResponse> {
	const siwtUrl = process.env.SIWT_MEDIA_WORKER_URL;
	if (!siwtUrl) {
		throw new Error('SIWT_MEDIA_WORKER_URL environment variable is not set');
	}

	const requestBody: SIWTTranscriptionRequest = {
		videoId
	};

	console.log(`Calling SIWT Media Worker for video ID: ${videoId}`);
	
	const response = await fetch(`${siwtUrl}/transcribe`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`SIWT Media Worker request failed: ${response.status} ${response.statusText} - ${errorText}`);
	}

	const result: SIWTTranscriptionResponse = await response.json();
	
	console.log(`SIWT Media Worker response: source=${result.source}, language=${result.language}, transcript length=${result.transcript.length}`);
	
	return result;
}
