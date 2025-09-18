import { EventEmitter } from "events";
import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import os from "os";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface StreamingTranscriptionOptions {
	chunkSizeSeconds?: number;
	overlapSeconds?: number;
	onProgress?: (progress: { chunk: number; total: number; text: string }) => void;
	onComplete?: (fullText: string) => void;
	onError?: (error: Error) => void;
}

export class StreamingTranscription extends EventEmitter {
	private videoUrl: string;
	private options: StreamingTranscriptionOptions;
	private isProcessing = false;
	private currentChunk = 0;
	private totalChunks = 0;
	private fullText = "";

	constructor(videoUrl: string, options: StreamingTranscriptionOptions = {}) {
		super();
		this.videoUrl = videoUrl;
		this.options = {
			chunkSizeSeconds: 30, // 30-second chunks
			overlapSeconds: 2, // 2-second overlap
			...options,
		};
	}

	async start(): Promise<void> {
		if (this.isProcessing) {
			throw new Error("Transcription already in progress");
		}

		this.isProcessing = true;
		this.currentChunk = 0;
		this.fullText = "";

		try {
			// Download and segment audio
			const segments = await this.prepareAudioSegments();
			this.totalChunks = segments.length;

			// Process segments with streaming
			await this.processSegmentsStreaming(segments);

			this.options.onComplete?.(this.fullText);
			this.emit("complete", this.fullText);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this.options.onError?.(err);
			this.emit("error", err);
			throw err;
		} finally {
			this.isProcessing = false;
		}
	}

	private async prepareAudioSegments(): Promise<string[]> {
		const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
		const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, "streaming-"));
		const audioPath = path.join(tempDir, "audio.mp3");
		const segmentDir = path.join(tempDir, "segments");

		try {
			// Download audio
			await this.downloadAudio(audioPath);

			// Create segments directory
			await fs.promises.mkdir(segmentDir);

			// Segment audio with overlap
			const segmentTemplate = path.join(segmentDir, "chunk-%03d.mp3");
			await new Promise<void>((resolve, reject) => {
				ffmpeg(audioPath)
					.outputOptions([
						"-f", "segment",
						"-segment_time", String(this.options.chunkSizeSeconds),
						"-segment_list_flags", "+live",
						"-reset_timestamps", "1",
					])
					.on("error", reject)
					.on("end", resolve)
					.save(segmentTemplate);
			});

			// Get segment files
			const files = (await fs.promises.readdir(segmentDir))
				.filter((f) => f.startsWith("chunk-") && f.endsWith(".mp3"))
				.sort()
				.map((f) => path.join(segmentDir, f));

			return files;
		} catch (error) {
			// Cleanup on error
			try {
				await fs.promises.unlink(audioPath).catch(() => {});
				const exists = await fs.promises.stat(segmentDir).then(() => true).catch(() => false);
				if (exists) {
					const entries = await fs.promises.readdir(segmentDir);
					await Promise.all(entries.map((e) => fs.promises.unlink(path.join(segmentDir, e)).catch(() => {})));
					await fs.promises.rmdir(segmentDir).catch(() => {});
				}
				await fs.promises.rmdir(tempDir).catch(() => {});
			} catch {}
			throw error;
		}
	}

	private async downloadAudio(outputPath: string): Promise<void> {
		const requestHeaders: Record<string, string> = {
			"User-Agent": process.env.YOUTUBE_USER_AGENT || 
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
			"Accept-Language": "en-US,en;q=0.9",
		};
		if (process.env.YOUTUBE_COOKIE) {
			requestHeaders["cookie"] = process.env.YOUTUBE_COOKIE;
		}

		await new Promise<void>((resolve, reject) => {
			const stream = ytdl(this.videoUrl, {
				filter: "audioonly",
				quality: "highestaudio",
				requestOptions: { headers: requestHeaders },
			});
			
			const write = fs.createWriteStream(outputPath);
			stream.pipe(write);
			write.on("finish", resolve);
			write.on("error", reject);
			stream.on("error", reject);
		});
	}

	private async processSegmentsStreaming(segments: string[]): Promise<void> {
		// Process segments in batches for better performance
		const batchSize = 3; // Process 3 segments at a time
		
		for (let i = 0; i < segments.length; i += batchSize) {
			const batch = segments.slice(i, i + batchSize);
			
			// Process batch in parallel
			const batchPromises = batch.map(async (segmentPath, batchIndex) => {
				const chunkIndex = i + batchIndex;
				return this.transcribeSegment(segmentPath, chunkIndex);
			});

			const batchResults = await Promise.all(batchPromises);
			
			// Emit progress for each completed chunk
			for (const result of batchResults) {
				this.currentChunk++;
				this.fullText += (this.fullText ? "\n" : "") + result.text;
				
				this.options.onProgress?.({
					chunk: this.currentChunk,
					total: this.totalChunks,
					text: result.text,
				});
				
				this.emit("progress", {
					chunk: this.currentChunk,
					total: this.totalChunks,
					text: result.text,
					fullText: this.fullText,
				});
			}
		}
	}

	private async transcribeSegment(segmentPath: string, chunkIndex: number): Promise<{ text: string }> {
		try {
			const fileStream = fs.createReadStream(segmentPath);
			const response = await openai.audio.transcriptions.create({
				file: fileStream,
				model: "whisper-1",
				response_format: "text",
				temperature: 0.0,
				language: "en",
			});

			const text = typeof response === "string" ? response : (response as { text?: string }).text || "";
			return { text: text.trim() };
		} catch (error) {
			console.error(`Error transcribing chunk ${chunkIndex}:`, error);
			return { text: "" };
		}
	}

	stop(): void {
		this.isProcessing = false;
		this.emit("stopped");
	}

	getProgress(): { chunk: number; total: number; percentage: number } {
		return {
			chunk: this.currentChunk,
			total: this.totalChunks,
			percentage: this.totalChunks > 0 ? (this.currentChunk / this.totalChunks) * 100 : 0,
		};
	}
}

// Convenience function for streaming transcription
export async function transcribeStreaming(
	videoUrl: string,
	options: StreamingTranscriptionOptions = {}
): Promise<StreamingTranscription> {
	const transcription = new StreamingTranscription(videoUrl, options);
	await transcription.start();
	return transcription;
}

// WebSocket-based streaming for real-time results
export class WebSocketStreamingTranscription extends StreamingTranscription {
	private ws: WebSocket | null = null;

	constructor(videoUrl: string, ws: WebSocket, options: StreamingTranscriptionOptions = {}) {
		super(videoUrl, {
			...options,
			onProgress: (progress) => {
				// Send progress via WebSocket
				if (this.ws && this.ws.readyState === WebSocket.OPEN) {
					this.ws.send(JSON.stringify({
						type: "progress",
						data: progress,
					}));
				}
				options.onProgress?.(progress);
			},
			onComplete: (fullText) => {
				// Send completion via WebSocket
				if (this.ws && this.ws.readyState === WebSocket.OPEN) {
					this.ws.send(JSON.stringify({
						type: "complete",
						data: { fullText },
					}));
				}
				options.onComplete?.(fullText);
			},
			onError: (error) => {
				// Send error via WebSocket
				if (this.ws && this.ws.readyState === WebSocket.OPEN) {
					this.ws.send(JSON.stringify({
						type: "error",
						data: { error: error.message },
					}));
				}
				options.onError?.(error);
			},
		});
		this.ws = ws;
	}
}
