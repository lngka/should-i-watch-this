import OpenAI from "openai";
import { cleanupTempFiles, downloadYouTubeAudio, readAudioBuffer } from "./shared";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Alternative transcription services for better performance
export interface TranscriptionService {
	name: string;
	transcribe(videoUrl: string): Promise<string>;
}

// Deepgram API for faster transcription
export class DeepgramService implements TranscriptionService {
	name = "Deepgram";
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async transcribe(videoUrl: string): Promise<string> {
		// Download audio first
		const { audioPath } = await downloadYouTubeAudio(videoUrl, "deepgram");
		
		try {
			const audioBuffer = await readAudioBuffer(audioPath);
			
			// Comprehensive multilingual detection strategies
			const commonLanguages = [
				{ code: "en", name: "English" },
				{ code: "es", name: "Spanish" },
				{ code: "fr", name: "French" },
				{ code: "de", name: "German" },
				{ code: "it", name: "Italian" },
				{ code: "pt", name: "Portuguese" },
				{ code: "ru", name: "Russian" },
				{ code: "ja", name: "Japanese" },
				{ code: "ko", name: "Korean" },
				{ code: "zh", name: "Chinese" },
				{ code: "ar", name: "Arabic" },
				{ code: "hi", name: "Hindi" },
				{ code: "vi", name: "Vietnamese" },
				{ code: "th", name: "Thai" },
				{ code: "id", name: "Indonesian" },
				{ code: "ms", name: "Malay" },
				{ code: "tl", name: "Filipino" },
				{ code: "nl", name: "Dutch" },
				{ code: "sv", name: "Swedish" },
				{ code: "no", name: "Norwegian" },
				{ code: "da", name: "Danish" },
				{ code: "fi", name: "Finnish" },
				{ code: "pl", name: "Polish" },
				{ code: "tr", name: "Turkish" },
				{ code: "he", name: "Hebrew" },
				{ code: "uk", name: "Ukrainian" },
				{ code: "cs", name: "Czech" },
				{ code: "hu", name: "Hungarian" },
				{ code: "ro", name: "Romanian" },
				{ code: "bg", name: "Bulgarian" },
				{ code: "hr", name: "Croatian" },
				{ code: "sk", name: "Slovak" },
				{ code: "sl", name: "Slovenian" },
				{ code: "et", name: "Estonian" },
				{ code: "lv", name: "Latvian" },
				{ code: "lt", name: "Lithuanian" },
				{ code: "el", name: "Greek" },
				{ code: "is", name: "Icelandic" },
				{ code: "mt", name: "Maltese" },
				{ code: "cy", name: "Welsh" },
				{ code: "ga", name: "Irish" },
				{ code: "eu", name: "Basque" },
				{ code: "ca", name: "Catalan" },
				{ code: "gl", name: "Galician" }
			];

			const strategies = [
				// Strategy 1: Auto-detect with confidence threshold
				{
					params: new URLSearchParams({
						model: "nova-2",
						smart_format: "true",
						detect_language: "true",
						punctuate: "true",
						paragraphs: "true",
						utterances: "true",
						diarize: "true",
						multichannel: "false"
					}),
					name: "auto-detect",
					priority: 1
				}
			];

			// Add specific language strategies for common languages
			commonLanguages.forEach(lang => {
				strategies.push({
					params: new URLSearchParams({
						model: "nova-2",
						smart_format: "true",
						language: lang.code,
						punctuate: "true",
						paragraphs: "true",
						utterances: "true",
						diarize: "true",
						multichannel: "false"
					}),
					name: lang.name,
					priority: 2
				});
			});
			
			let bestTranscript = "";
			let bestLanguage = "";
			let bestConfidence = 0;
			let bestScore = 0;
			
			// Try auto-detect first
			const autoDetectStrategy = strategies[0];
			try {
				console.log(`Trying Deepgram strategy: ${autoDetectStrategy.name}`);
				
				const response = await fetch(`https://api.deepgram.com/v1/listen?${autoDetectStrategy.params}`, {
					method: "POST",
					headers: {
						"Authorization": `Token ${this.apiKey}`,
						"Content-Type": "audio/mp3",
					},
					body: new Uint8Array(audioBuffer),
				});

				if (response.ok) {
					const result = await response.json();
					const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
					const detectedLanguage = result.results?.channels?.[0]?.detected_language;
					const confidence = result.results?.channels?.[0]?.language_confidence || 0;
					
					console.log(`Deepgram auto-detect result:`, {
						language: detectedLanguage,
						confidence: confidence,
						transcriptLength: transcript.length
					});
					
					// If auto-detect has high confidence and good transcript, use it
					if (transcript.length > 100 && confidence > 0.8) {
						console.log(`Using auto-detect result (high confidence: ${confidence})`);
						return transcript;
					}
					
					// Store as baseline
					bestTranscript = transcript;
					bestLanguage = detectedLanguage || "auto-detect";
					bestConfidence = confidence;
					bestScore = transcript.length * confidence;
				}
			} catch (error) {
				console.warn(`Deepgram auto-detect error:`, error instanceof Error ? error.message : String(error));
			}
			
			// If auto-detect didn't work well, try specific languages
			// Prioritize common languages and languages similar to detected language
			const priorityLanguages = this.getPriorityLanguages(bestLanguage, bestConfidence);
			
			for (const langCode of priorityLanguages) {
				const strategy = strategies.find(s => s.name === langCode);
				if (!strategy) continue;
				
				try {
					console.log(`Trying Deepgram strategy: ${strategy.name}`);
					
					const response = await fetch(`https://api.deepgram.com/v1/listen?${strategy.params}`, {
						method: "POST",
						headers: {
							"Authorization": `Token ${this.apiKey}`,
							"Content-Type": "audio/mp3",
						},
						body: new Uint8Array(audioBuffer),
					});

					if (!response.ok) {
						const errorText = await response.text();
						console.warn(`Deepgram ${strategy.name} failed: ${response.status} - ${errorText}`);
						continue;
					}

					const result = await response.json();
					const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
					const detectedLanguage = result.results?.channels?.[0]?.detected_language;
					const confidence = result.results?.channels?.[0]?.language_confidence || 0;
					
					console.log(`Deepgram ${strategy.name} result:`, {
						language: detectedLanguage || strategy.name,
						confidence: confidence,
						transcriptLength: transcript.length
					});
					
					// Calculate score: length * confidence * language match bonus
					const languageMatchBonus = detectedLanguage === langCode ? 1.2 : 1.0;
					const score = transcript.length * confidence * languageMatchBonus;
					
					if (score > bestScore) {
						bestTranscript = transcript;
						bestLanguage = detectedLanguage || strategy.name;
						bestConfidence = confidence;
						bestScore = score;
					}
					
					// If we got a good transcript with reasonable confidence, use it
					if (transcript.length > 200 && confidence > 0.6) {
						console.log(`Using ${strategy.name} result (good quality: confidence=${confidence}, length=${transcript.length})`);
						return transcript;
					}
					
				} catch (error) {
					console.warn(`Deepgram ${strategy.name} error:`, error instanceof Error ? error.message : String(error));
					continue;
				}
			}
			
			// Return the best result we found
			if (bestTranscript) {
				console.log(`Using best result: ${bestLanguage} (confidence: ${bestConfidence}, length: ${bestTranscript.length}, score: ${bestScore})`);
				return bestTranscript;
			}
			
			throw new Error("All Deepgram strategies failed");
			
		} finally {
			await cleanupTempFiles(audioPath);
		}
	}

	private getPriorityLanguages(detectedLanguage: string, confidence: number): string[] {
		// Language families and similar languages for better fallback
		const languageGroups = {
			// Romance languages
			"es": ["es", "pt", "it", "fr", "ca", "gl"],
			"pt": ["pt", "es", "it", "fr", "ca", "gl"],
			"it": ["it", "es", "pt", "fr", "ca", "gl"],
			"fr": ["fr", "es", "pt", "it", "ca", "gl"],
			"ca": ["ca", "es", "pt", "it", "fr", "gl"],
			"gl": ["gl", "es", "pt", "it", "fr", "ca"],
			
			// Germanic languages
			"en": ["en", "de", "nl", "sv", "no", "da", "is"],
			"de": ["de", "en", "nl", "sv", "no", "da", "is"],
			"nl": ["nl", "de", "en", "sv", "no", "da", "is"],
			"sv": ["sv", "no", "da", "de", "nl", "en", "is"],
			"no": ["no", "sv", "da", "de", "nl", "en", "is"],
			"da": ["da", "sv", "no", "de", "nl", "en", "is"],
			"is": ["is", "sv", "no", "da", "de", "nl", "en"],
			
			// Slavic languages
			"ru": ["ru", "uk", "bg", "sr", "hr", "sk", "cs", "pl"],
			"uk": ["uk", "ru", "bg", "sr", "hr", "sk", "cs", "pl"],
			"bg": ["bg", "ru", "uk", "sr", "hr", "sk", "cs", "pl"],
			"sr": ["sr", "hr", "bg", "ru", "uk", "sk", "cs", "pl"],
			"hr": ["hr", "sr", "bg", "ru", "uk", "sk", "cs", "pl"],
			"sk": ["sk", "cs", "pl", "ru", "uk", "bg", "sr", "hr"],
			"cs": ["cs", "sk", "pl", "ru", "uk", "bg", "sr", "hr"],
			"pl": ["pl", "cs", "sk", "ru", "uk", "bg", "sr", "hr"],
			
			// Asian languages
			"zh": ["zh", "ja", "ko", "vi", "th", "id", "ms", "tl"],
			"ja": ["ja", "ko", "zh", "vi", "th", "id", "ms", "tl"],
			"ko": ["ko", "ja", "zh", "vi", "th", "id", "ms", "tl"],
			"vi": ["vi", "th", "id", "ms", "tl", "zh", "ja", "ko"],
			"th": ["th", "vi", "id", "ms", "tl", "zh", "ja", "ko"],
			"id": ["id", "ms", "tl", "vi", "th", "zh", "ja", "ko"],
			"ms": ["ms", "id", "tl", "vi", "th", "zh", "ja", "ko"],
			"tl": ["tl", "id", "ms", "vi", "th", "zh", "ja", "ko"],
			
			// Other common languages
			"ar": ["ar", "he", "tr", "fa", "ur"],
			"he": ["he", "ar", "tr", "fa", "ur"],
			"tr": ["tr", "ar", "he", "fa", "ur"],
			"hi": ["hi", "ur", "bn", "pa", "gu", "mr", "ne"],
			"ur": ["ur", "hi", "bn", "pa", "gu", "mr", "ne"],
			"bn": ["bn", "hi", "ur", "pa", "gu", "mr", "ne"],
			"pa": ["pa", "hi", "ur", "bn", "gu", "mr", "ne"],
			"gu": ["gu", "hi", "ur", "bn", "pa", "mr", "ne"],
			"mr": ["mr", "hi", "ur", "bn", "pa", "gu", "ne"],
			"ne": ["ne", "hi", "ur", "bn", "pa", "gu", "mr"],
			
			// European languages
			"fi": ["fi", "et", "hu"],
			"et": ["et", "fi", "hu"],
			"hu": ["hu", "fi", "et"],
			"ro": ["ro", "bg", "sr", "hr"],
			"el": ["el", "tr", "ar", "he"],
			"mt": ["mt", "ar", "he", "tr"],
			"cy": ["cy", "ga", "en", "de"],
			"ga": ["ga", "cy", "en", "de"],
			"eu": ["eu", "es", "fr", "ca"],
		};
		
		// If we have a detected language with low confidence, try similar languages first
		if (detectedLanguage && confidence < 0.8) {
			const similarLanguages = languageGroups[detectedLanguage as keyof typeof languageGroups] || [];
			if (similarLanguages.length > 0) {
				return similarLanguages;
			}
		}
		
		// Default priority order for common languages
		return [
			"en", "es", "fr", "de", "it", "pt", "ru", "ja", "ko", "zh", 
			"ar", "hi", "vi", "th", "id", "ms", "tl", "nl", "sv", "no", 
			"da", "fi", "pl", "tr", "he", "uk", "cs", "hu", "ro", "bg", 
			"hr", "sk", "sl", "et", "lv", "lt", "el", "is", "mt", "cy", 
			"ga", "eu", "ca", "gl"
		];
	}

}

// AssemblyAI for streaming transcription
export class AssemblyAIService implements TranscriptionService {
	name = "AssemblyAI";
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async transcribe(videoUrl: string): Promise<string> {
		// Download audio first
		const { audioPath } = await downloadYouTubeAudio(videoUrl, "assemblyai");
		
		try {
			// Upload audio file
			const audioBuffer = await readAudioBuffer(audioPath);
				const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
					method: "POST",
					headers: {
						"Authorization": this.apiKey,
					},
					body: new Uint8Array(audioBuffer),
				});

			if (!uploadResponse.ok) {
				throw new Error(`AssemblyAI upload error: ${uploadResponse.status}`);
			}

			const { upload_url } = await uploadResponse.json();

			// Start transcription
			const transcribeResponse = await fetch("https://api.assemblyai.com/v2/transcript", {
				method: "POST",
				headers: {
					"Authorization": this.apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					audio_url: upload_url,
					speaker_labels: true,
					auto_highlights: true,
				}),
			});

			if (!transcribeResponse.ok) {
				throw new Error(`AssemblyAI transcription error: ${transcribeResponse.status}`);
			}

			const { id } = await transcribeResponse.json();

			// Poll for completion
			let attempts = 0;
			const maxAttempts = 60; // 5 minutes max
			
			while (attempts < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
				
				const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
					headers: { "Authorization": this.apiKey },
				});

				if (!statusResponse.ok) {
					throw new Error(`AssemblyAI status error: ${statusResponse.status}`);
				}

				const status = await statusResponse.json();
				
				if (status.status === "completed") {
					return status.text || "";
				} else if (status.status === "error") {
					throw new Error(`AssemblyAI transcription failed: ${status.error}`);
				}
				
				attempts++;
			}

			throw new Error("AssemblyAI transcription timeout");
		} finally {
			await cleanupTempFiles(audioPath);
		}
	}

}

// Whisper API with optimized settings
export class OptimizedWhisperService implements TranscriptionService {
	name = "Optimized Whisper";

	async transcribe(videoUrl: string): Promise<string> {
		console.log(`OptimizedWhisperService starting transcription at ${new Date().toISOString()}`);
		
		// Download audio first
		console.log(`Downloading audio for OptimizedWhisperService at ${new Date().toISOString()}`);
		const downloadStartTime = Date.now();
		const { audioPath, fileSize } = await downloadYouTubeAudio(videoUrl, "whisper-opt");
		const downloadEndTime = Date.now();
		console.log(`Audio download completed in ${downloadEndTime - downloadStartTime}ms, size: ${fileSize} bytes at ${new Date().toISOString()}`);
		
		try {
			console.log(`Reading audio buffer at ${new Date().toISOString()}`);
			const bufferStartTime = Date.now();
			const audioBuffer = await readAudioBuffer(audioPath);
			const bufferEndTime = Date.now();
			console.log(`Audio buffer read in ${bufferEndTime - bufferStartTime}ms, size: ${audioBuffer.length} bytes at ${new Date().toISOString()}`);
				
			// Use optimized Whisper settings
			// Create a File-like object compatible with Node.js
			const file = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mp3" }) as File & { name: string };
			file.name = "audio.mp3";
			
			console.log(`Sending to OpenAI Whisper API at ${new Date().toISOString()}`);
			const apiStartTime = Date.now();
			const response = await openai.audio.transcriptions.create({
				file: file,
				model: "whisper-1",
				response_format: "text",
				temperature: 0.0, // More consistent results
				// Remove language specification to enable auto-detection
			});
			const apiEndTime = Date.now();
			console.log(`OpenAI Whisper API completed in ${apiEndTime - apiStartTime}ms at ${new Date().toISOString()}`);

			const result = typeof response === "string" ? response : (response as { text?: string }).text || "";
			console.log(`OptimizedWhisperService transcription completed, result length: ${result.length} at ${new Date().toISOString()}`);
			return result;
		} finally {
			console.log(`Cleaning up temp files at ${new Date().toISOString()}`);
			await cleanupTempFiles(audioPath);
		}
	}

}

// Service selector based on availability and performance
export async function getBestTranscriptionService(): Promise<TranscriptionService> {
	// Check for Deepgram API key
	if (process.env.DEEPGRAM_API_KEY) {
		return new DeepgramService(process.env.DEEPGRAM_API_KEY);
	}
	
	// Check for AssemblyAI API key
	if (process.env.ASSEMBLYAI_API_KEY) {
		return new AssemblyAIService(process.env.ASSEMBLYAI_API_KEY);
	}
	
	// Fallback to optimized Whisper
	return new OptimizedWhisperService();
}

// Enhanced service selector with fallback for language detection issues
export async function getBestTranscriptionServiceWithFallback(): Promise<TranscriptionService> {
	// Always prefer Whisper for better language detection
	if (process.env.OPENAI_API_KEY) {
		return new OptimizedWhisperService();
	}
	
	// Fallback to other services
	return await getBestTranscriptionService();
}

// Direct transcription without FFmpeg processing for smaller files
export async function transcribeDirect(videoUrl: string): Promise<string> {
	console.log(`transcribeDirect() starting at ${new Date().toISOString()}`);
	
	// Download audio first
	console.log(`Downloading audio for direct transcription at ${new Date().toISOString()}`);
	const downloadStartTime = Date.now();
	const { audioPath, fileSize } = await downloadYouTubeAudio(videoUrl, "direct", 25 * 1024 * 1024); // 25MB limit
	const downloadEndTime = Date.now();
	console.log(`Audio download completed in ${downloadEndTime - downloadStartTime}ms, size: ${fileSize} bytes at ${new Date().toISOString()}`);
	
	try {
		// Check if file is small enough to send directly (under 25MB)
		const maxDirectSize = 25 * 1024 * 1024; // 25MB OpenAI limit
		if (fileSize <= maxDirectSize) {
			console.log(`File size ${fileSize} bytes is under ${maxDirectSize} bytes limit, sending directly to Whisper at ${new Date().toISOString()}`);
			
			const transcriptionStartTime = Date.now();
			const audioBuffer = await readAudioBuffer(audioPath);
			
			// Create a File-like object compatible with Node.js
			const file = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mp3" }) as File & { name: string };
			file.name = "audio.mp3";
			
			const response = await openai.audio.transcriptions.create({
				file: file,
				model: "whisper-1",
				response_format: "text",
				temperature: 0.0,
				// No language specification to enable auto-detection
			});
			
			const transcriptionEndTime = Date.now();
			console.log(`Direct Whisper transcription completed in ${transcriptionEndTime - transcriptionStartTime}ms at ${new Date().toISOString()}`);
			
			const result = typeof response === "string" ? response : (response as { text?: string }).text || "";
			console.log(`transcribeDirect() completed, result length: ${result.length} at ${new Date().toISOString()}`);
			return result;
		} else {
			throw new Error(`File too large for direct transcription: ${fileSize} bytes (limit: ${maxDirectSize} bytes)`);
		}
	} finally {
		console.log(`Cleaning up temp files at ${new Date().toISOString()}`);
		await cleanupTempFiles(audioPath);
	}
}

// Fast transcription with automatic service selection
export async function transcribeFast(videoUrl: string): Promise<string> {
	console.log(`transcribeFast() starting at ${new Date().toISOString()}`);
	
	// First try direct transcription (fastest path)
	try {
		console.log(`Attempting direct transcription first at ${new Date().toISOString()}`);
		const directStartTime = Date.now();
		const result = await transcribeDirect(videoUrl);
		const directEndTime = Date.now();
		console.log(`Direct transcription succeeded in ${directEndTime - directStartTime}ms at ${new Date().toISOString()}`);
		return result;
	} catch (directError) {
		console.log(`Direct transcription failed: ${directError instanceof Error ? directError.message : String(directError)}`);
		console.log(`Falling back to service-based transcription at ${new Date().toISOString()}`);
	}
	
	// Fallback to service-based transcription
	const service = await getBestTranscriptionServiceWithFallback();
	console.log(`Using ${service.name} for transcription at ${new Date().toISOString()}`);
	const startTime = Date.now();
	try {
		const result = await service.transcribe(videoUrl);
		const endTime = Date.now();
		console.log(`${service.name} transcription completed in ${endTime - startTime}ms at ${new Date().toISOString()}`);
		return result;
	} catch (error) {
		const endTime = Date.now();
		console.log(`${service.name} transcription failed after ${endTime - startTime}ms: ${error instanceof Error ? error.message : String(error)}`);
		throw error;
	}
}
