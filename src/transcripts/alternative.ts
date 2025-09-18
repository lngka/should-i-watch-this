import OpenAI from "openai";
import ytdl from "@distube/ytdl-core";
import fs from "fs";
import path from "path";
import os from "os";

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
		const audioPath = await this.downloadAudio(videoUrl);
		
			try {
				const audioBuffer = await fs.promises.readFile(audioPath);
				
				const response = await fetch("https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", {
					method: "POST",
					headers: {
						"Authorization": `Token ${this.apiKey}`,
						"Content-Type": "audio/mp3",
					},
					body: new Uint8Array(audioBuffer),
				});

			if (!response.ok) {
				throw new Error(`Deepgram API error: ${response.status}`);
			}

			const result = await response.json();
			return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
		} finally {
			await fs.promises.unlink(audioPath).catch(() => {});
		}
	}

	private async downloadAudio(videoUrl: string): Promise<string> {
		const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
		const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, "deepgram-"));
		const audioPath = path.join(tempDir, "audio.mp3");

		await new Promise<void>((resolve, reject) => {
			const stream = ytdl(videoUrl, { filter: "audioonly", quality: "highestaudio" });
			const write = fs.createWriteStream(audioPath);
			stream.pipe(write);
			write.on("finish", resolve);
			write.on("error", reject);
			stream.on("error", reject);
		});

		return audioPath;
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
		const audioPath = await this.downloadAudio(videoUrl);
		
			try {
				// Upload audio file
				const audioBuffer = await fs.promises.readFile(audioPath);
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
			await fs.promises.unlink(audioPath).catch(() => {});
		}
	}

	private async downloadAudio(videoUrl: string): Promise<string> {
		const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
		const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, "assemblyai-"));
		const audioPath = path.join(tempDir, "audio.mp3");

		await new Promise<void>((resolve, reject) => {
			const stream = ytdl(videoUrl, { filter: "audioonly", quality: "highestaudio" });
			const write = fs.createWriteStream(audioPath);
			stream.pipe(write);
			write.on("finish", resolve);
			write.on("error", reject);
			stream.on("error", reject);
		});

		return audioPath;
	}
}

// Whisper API with optimized settings
export class OptimizedWhisperService implements TranscriptionService {
	name = "Optimized Whisper";

	async transcribe(videoUrl: string): Promise<string> {
		// Download audio first
		const audioPath = await this.downloadAudio(videoUrl);
		
			try {
				const audioBuffer = await fs.promises.readFile(audioPath);
				
				// Use optimized Whisper settings
				// Create a File-like object compatible with Node.js
				const file = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mp3" }) as any;
				file.name = "audio.mp3";
			
			const response = await openai.audio.transcriptions.create({
				file: file,
				model: "whisper-1",
				response_format: "text",
				temperature: 0.0, // More consistent results
				language: "en", // Specify language for faster processing
			});

			return typeof response === "string" ? response : (response as { text?: string }).text || "";
		} finally {
			await fs.promises.unlink(audioPath).catch(() => {});
		}
	}

	private async downloadAudio(videoUrl: string): Promise<string> {
		const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
		const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, "whisper-opt-"));
		const audioPath = path.join(tempDir, "audio.mp3");

		await new Promise<void>((resolve, reject) => {
			const stream = ytdl(videoUrl, { filter: "audioonly", quality: "highestaudio" });
			const write = fs.createWriteStream(audioPath);
			stream.pipe(write);
			write.on("finish", resolve);
			write.on("error", reject);
			stream.on("error", reject);
		});

		return audioPath;
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

// Fast transcription with automatic service selection
export async function transcribeFast(videoUrl: string): Promise<string> {
	const service = await getBestTranscriptionService();
	console.log(`Using ${service.name} for transcription`);
	return service.transcribe(videoUrl);
}
