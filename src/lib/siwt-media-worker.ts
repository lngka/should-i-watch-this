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

// New API interfaces for the updated endpoint
export interface NewSIWTAnalyzeRequest {
	video_id: string;
	force_asr: boolean;
	asr_lang: string;
	prefer_langs: string[];
}

export interface NewSIWTAnalyzeResponse {
	source: string;
	language: string;
	segments: Array<{
		start: number;
		duration: number;
		text: string;
	}>;
	text: string;
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

/**
 * Calls the new SIWT Media Worker analyze endpoint with language detection
 */
export async function analyzeWithNewSIWT(videoId: string, detectedLanguage: string): Promise<NewSIWTAnalyzeResponse> {
	const siwtUrl = 'https://siwt-media-worker-qo5st3hibq-ey.a.run.app'; 

	const requestBody: NewSIWTAnalyzeRequest = {
		video_id: videoId,
		force_asr: false,
		asr_lang: detectedLanguage,
		prefer_langs: [detectedLanguage, 'en'] // Add English as fallback
	};

	const fullUrl = `${siwtUrl}/v1/analyze`;
	console.log(`=== SIWT Media Worker API Call ===`);
	console.log(`URL: ${fullUrl}`);
	console.log(`Video ID: ${videoId}`);
	console.log(`Detected Language: ${detectedLanguage}`);
	console.log(`Request Payload:`, JSON.stringify(requestBody, null, 2));

	const response = await fetch(fullUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Bearer toitrangtrongtherangtoiladovotichsu',
		},
		body: JSON.stringify(requestBody),
	});

	console.log(`Response Status: ${response.status} ${response.statusText}`);
	console.log(`Response Headers:`, Object.fromEntries(response.headers.entries()));

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`=== SIWT API Error Response ===`);
		console.error(`Status: ${response.status} ${response.statusText}`);
		console.error(`Error Body:`, errorText);
		throw new Error(`New SIWT Media Worker analyze request failed: ${response.status} ${response.statusText} - ${errorText}`);
	}

	const result: NewSIWTAnalyzeResponse = await response.json();
	
	console.log(`=== SIWT API Success Response ===`);
	console.log(`Response Body:`, JSON.stringify(result, null, 2));
	console.log(`Source: ${result.source}, Language: ${result.language}, Text Length: ${result.text.length}`);
	
	return result;
}
