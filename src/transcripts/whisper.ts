import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import OpenAI from "openai";
import path from "path";
import { getFileSize, getVideoInfo } from "./utils";
import { cleanupTempFiles as cleanupYtdlTempFiles, downloadYouTubeAudioWithYtdlCore } from "./ytdl-core-downloader";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cache for transcripts to avoid re-processing
const transcriptCache = new Map<string, { transcript: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Generate cache key from video URL
function getCacheKey(videoUrl: string): string {
	return crypto.createHash('md5').update(videoUrl).digest('hex');
}


export async function transcribeWithWhisper(videoUrl: string): Promise<string> {
	console.log(`Starting Whisper transcription for: ${videoUrl}`);

	// Check cache first
	const cacheKey = getCacheKey(videoUrl);
	const cached = transcriptCache.get(cacheKey);
	if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
		console.log(`Using cached transcript for: ${videoUrl}`);
		return cached.transcript;
	}

	// Try to validate video URL first, but don't fail if it doesn't work
	const videoInfo = await getVideoInfo(videoUrl);
	const videoTitle = videoInfo?.title || "Unknown";
	if (videoInfo) {
		console.log(`Video title: ${videoTitle}`);
	}

	// Download audio using ytdl-core
	const { audioPath, fileSize } = await downloadYouTubeAudioWithYtdlCore(videoUrl, "siwt");
	const compressedPath = path.join(path.dirname(audioPath), "audio-compressed.mp3");

	try {
		// First try: if the downloaded audio is already under the limit, upload directly (no ffmpeg)
		const maxBytes = 24 * 1024 * 1024; // safety margin
		if (fileSize <= maxBytes) {
			console.log(`Uploading audio directly (${Math.round(fileSize / 1024 / 1024)} MB)`);
			const fileStream = fs.createReadStream(audioPath);
			const res = await openai.audio.transcriptions.create({
				file: fileStream,
				model: "whisper-1",
				response_format: "text",
			});
			const transcript = typeof res === "string" ? res : (res as { text?: string }).text || "";
			
			// Cache the result
			transcriptCache.set(cacheKey, { transcript, timestamp: Date.now() });
			console.log(`Cached transcript for: ${videoUrl}`);
			
			return transcript;
		}

		// Prepare ffmpeg if available
		let canUseFfmpeg = false;
		try {
			// Use dynamic import to avoid bundling issues
			const installer = await import("@ffmpeg-installer/ffmpeg");
			if (installer.path) {
				ffmpeg.setFfmpegPath(installer.path);
				canUseFfmpeg = true;
			}
			if (!canUseFfmpeg && process.env.FFMPEG_PATH) {
				ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
				canUseFfmpeg = true;
			}
		} catch (e) {
			console.warn(`ffmpeg path setup failed: ${e}`);
			canUseFfmpeg = false;
		}

		if (!canUseFfmpeg) {
			throw new Error(
				"Audio exceeds 25MB and ffmpeg is unavailable. On Vercel, ensure Node.js runtime and include ffmpeg-static, or provide captions."
			);
		}

		// Re-encode to small mono MP3 to reduce size (16 kHz, 48 kbps)
		await new Promise<void>((resolve, reject) => {
			ffmpeg(audioPath)
				.audioCodec("libmp3lame")
				.audioChannels(1)
				.audioBitrate("48k")
				.audioFrequency(16000)
				.outputOptions(["-vn"])
				.on("error", (err) => reject(err))
				.on("end", () => resolve())
				.save(compressedPath);
		});

		const stats = await fs.promises.stat(compressedPath);
		if (stats.size <= maxBytes) {
			const fileStream = fs.createReadStream(compressedPath);
			const res = await openai.audio.transcriptions.create({
				file: fileStream,
				model: "whisper-1",
				response_format: "text",
			});
			const transcript = typeof res === "string" ? res : (res as { text?: string }).text || "";
			
			// Cache the result
			transcriptCache.set(cacheKey, { transcript, timestamp: Date.now() });
			console.log(`Cached transcript for: ${videoUrl}`);
			
			return transcript;
		}

		// If still large, segment into smaller chunks
		const segmentDir = path.join(path.dirname(audioPath), "segments");
		await fs.promises.mkdir(segmentDir);
		const segmentTemplate = path.join(segmentDir, "part-%03d.mp3");
		const segmentTimeSec = 600; // 10 minutes
		await new Promise<void>((resolve, reject) => {
			ffmpeg(compressedPath)
				.outputOptions([
					"-f",
					"segment",
					"-segment_time",
					String(segmentTimeSec),
					"-reset_timestamps",
					"1",
				])
				.on("error", (err) => reject(err))
				.on("end", () => resolve())
				.save(segmentTemplate);
		});

		const files = (await fs.promises.readdir(segmentDir))
			.filter((f) => f.startsWith("part-") && f.endsWith(".mp3"))
			.sort();
		if (!files.length) {
			throw new Error("Segmentation produced no files");
		}

		// Process chunks in parallel for much faster transcription
		console.log(`Processing ${files.length} chunks in parallel`);
		const chunkPromises = files.map(async (f) => {
			const p = path.join(segmentDir, f);
			const st = await fs.promises.stat(p);
			if (st.size > maxBytes) {
				throw new Error(`Chunk ${f} still exceeds max size after compression`);
			}
			console.log(`Transcribing chunk ${f} (${Math.round(st.size / 1024 / 1024)} MB)`);
			const stream = fs.createReadStream(p);
			const res = await openai.audio.transcriptions.create({
				file: stream,
				model: "whisper-1",
				response_format: "text",
			});
			const text = typeof res === "string" ? res : (res as { text?: string }).text || "";
			return { index: parseInt(f.match(/\d+/)?.[0] || "0"), text: text.trim() };
		});

		const chunkResults = await Promise.all(chunkPromises);
		const fullText = chunkResults
			.sort((a, b) => a.index - b.index)
			.map(r => r.text)
			.join("\n");

		// Cache the result
		transcriptCache.set(cacheKey, { transcript: fullText, timestamp: Date.now() });
		console.log(`Cached transcript for: ${videoUrl}`);

		return fullText;
	} finally {
		await cleanupYtdlTempFiles(audioPath);
	}
}

// New optimized transcription function with streaming
export async function transcribeWithWhisperOptimized(videoUrl: string): Promise<string> {
	console.log(`Starting optimized Whisper transcription for: ${videoUrl}`);

	// Check cache first
	const cacheKey = getCacheKey(videoUrl);
	const cached = transcriptCache.get(cacheKey);
	if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
		console.log(`Using cached transcript for: ${videoUrl}`);
		return cached.transcript;
	}

	let audioPath: string | undefined;
	try {
		// Download audio using ytdl-core
		const { audioPath: downloadedPath } = await downloadYouTubeAudioWithYtdlCore(videoUrl, "whisper-opt");
		audioPath = downloadedPath;
		
		// Check if we need to segment
		const maxBytes = 24 * 1024 * 1024; // 24MB limit
		const stats = await getFileSize(audioPath);
		
		if (stats <= maxBytes) {
			// Direct transcription
			console.log(`Transcribing audio directly (${Math.round(stats / 1024 / 1024)} MB)`);
			const fileStream = fs.createReadStream(audioPath);
			const res = await openai.audio.transcriptions.create({
				file: fileStream,
				model: "whisper-1",
				response_format: "text",
			});
			const transcript = typeof res === "string" ? res : (res as { text?: string }).text || "";
			
			// Cache the result
			transcriptCache.set(cacheKey, { transcript, timestamp: Date.now() });
			console.log(`Cached transcript for: ${videoUrl}`);
			
			return transcript;
		} else {
			// Segment and process in parallel
			const tempDir = path.dirname(audioPath);
			const segmentDir = path.join(tempDir, "segments");
			await fs.promises.mkdir(segmentDir);
			const segmentTemplate = path.join(segmentDir, "part-%03d.mp3");
			
			// Segment into 2-minute chunks for Vercel's 300s limit
			await new Promise<void>((resolve, reject) => {
				ffmpeg(audioPath)
					.outputOptions([
						"-f", "segment",
						"-segment_time", "120", // 2 minutes for faster processing
						"-reset_timestamps", "1",
						"-preset", "ultrafast", // Fastest encoding
					])
					.on("error", (err) => reject(err))
					.on("end", () => resolve())
					.save(segmentTemplate);
			});

			const files = (await fs.promises.readdir(segmentDir))
				.filter((f) => f.startsWith("part-") && f.endsWith(".mp3"))
				.sort();

			if (!files.length) {
				throw new Error("Segmentation produced no files");
			}

			// Process all chunks in parallel
			console.log(`Processing ${files.length} chunks in parallel`);
			const chunkPromises = files.map(async (f) => {
				const p = path.join(segmentDir, f);
				const st = await fs.promises.stat(p);
				console.log(`Transcribing chunk ${f} (${Math.round(st.size / 1024 / 1024)} MB)`);
				const stream = fs.createReadStream(p);
				const res = await openai.audio.transcriptions.create({
					file: stream,
					model: "whisper-1",
					response_format: "text",
				});
				const text = typeof res === "string" ? res : (res as { text?: string }).text || "";
				return { index: parseInt(f.match(/\d+/)?.[0] || "0"), text: text.trim() };
			});

			const chunkResults = await Promise.all(chunkPromises);
			const fullText = chunkResults
				.sort((a, b) => a.index - b.index)
				.map(r => r.text)
				.join("\n");

			// Cache the result
			transcriptCache.set(cacheKey, { transcript: fullText, timestamp: Date.now() });
			console.log(`Cached transcript for: ${videoUrl}`);

			return fullText;
		}
	} finally {
		// Cleanup
		if (audioPath) {
			await cleanupYtdlTempFiles(audioPath);
		}
	}
}

// Vercel-optimized transcription with aggressive time limits
export async function transcribeForVercel(videoUrl: string): Promise<string> {
	console.log(`Starting Vercel-optimized transcription for: ${videoUrl} at ${new Date().toISOString()}`);

	// Check cache first
	const cacheKey = getCacheKey(videoUrl);
	const cached = transcriptCache.get(cacheKey);
	if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
		console.log(`Using cached transcript for: ${videoUrl} at ${new Date().toISOString()}`);
		return cached.transcript;
	}

	// Set aggressive timeouts for Vercel's 300s limit
	const TOTAL_TIMEOUT = 240000; // 4 minutes (leave 1 minute buffer)
	const DOWNLOAD_TIMEOUT = 60000; // 1 minute for download
	const TRANSCRIBE_TIMEOUT = 180000; // 3 minutes for transcription

	const startTime = Date.now();
	let audioPath: string | undefined;

	try {
		// Download with timeout using shared utility
		console.log(`Downloading audio for Vercel transcription at ${new Date().toISOString()}`);
		const downloadStartTime = Date.now();
		const result = await Promise.race([
			downloadYouTubeAudioWithYtdlCore(videoUrl, "vercel", 20 * 1024 * 1024), // 20MB limit for Vercel
			new Promise<never>((_, reject) => 
				setTimeout(() => reject(new Error("Download timeout")), DOWNLOAD_TIMEOUT)
			)
		]);
		audioPath = result.audioPath;
		const downloadEndTime = Date.now();
		console.log(`Audio download completed in ${downloadEndTime - downloadStartTime}ms, size: ${result.fileSize} bytes at ${new Date().toISOString()}`);

		// Check if we have time left
		if (Date.now() - startTime > TOTAL_TIMEOUT) {
			throw new Error("Timeout: Download took too long");
		}

		// Fast compression
		console.log(`Starting FFmpeg compression at ${new Date().toISOString()}`);
		const compressionStartTime = Date.now();
		const compressedPath = path.join(path.dirname(audioPath), "compressed.mp3");
		await new Promise<void>((resolve, reject) => {
			ffmpeg(audioPath)
				.audioCodec("libmp3lame")
				.audioChannels(1)
				.audioBitrate("16k") // Very low bitrate
				.audioFrequency(8000) // Low frequency
				.outputOptions(["-vn", "-preset", "ultrafast"])
				.on("error", (err) => reject(err))
				.on("end", () => resolve())
				.save(compressedPath);
		});
		const compressionEndTime = Date.now();
		console.log(`FFmpeg compression completed in ${compressionEndTime - compressionStartTime}ms at ${new Date().toISOString()}`);

		// Check file size and transcribe
		const stats = await getFileSize(compressedPath);
		const maxBytes = 24 * 1024 * 1024; // 24MB limit
		console.log(`Compressed file size: ${stats} bytes (limit: ${maxBytes} bytes) at ${new Date().toISOString()}`);

		if (stats <= maxBytes) {
				// Direct transcription with timeout
				console.log(`Starting direct transcription at ${new Date().toISOString()}`);
				const transcriptionStartTime = Date.now();
				const transcript = await Promise.race([
					openai.audio.transcriptions.create({
						file: fs.createReadStream(compressedPath),
						model: "whisper-1",
						response_format: "text",
						temperature: 0.0,
						language: "en",
					}).then(res => typeof res === "string" ? res : (res as { text?: string }).text || ""),
					new Promise<never>((_, reject) => 
						setTimeout(() => reject(new Error("Transcription timeout")), TRANSCRIBE_TIMEOUT)
					)
				]);
				const transcriptionEndTime = Date.now();
				console.log(`Direct transcription completed in ${transcriptionEndTime - transcriptionStartTime}ms at ${new Date().toISOString()}`);

				// Cache the result
				transcriptCache.set(cacheKey, { transcript, timestamp: Date.now() });
				console.log(`Vercel transcription completed in ${Date.now() - startTime}ms at ${new Date().toISOString()}`);
				return transcript;
		} else {
			// Segment and process in parallel with time limit
			console.log(`File too large, starting segmentation at ${new Date().toISOString()}`);
			const segmentationStartTime = Date.now();
			const segmentDir = path.join(path.dirname(audioPath), "segments");
			await fs.promises.mkdir(segmentDir);
			const segmentTemplate = path.join(segmentDir, "part-%03d.mp3");
				
				// Fast segmentation
				await new Promise<void>((resolve, reject) => {
					ffmpeg(compressedPath)
						.outputOptions([
							"-f", "segment",
							"-segment_time", "60", // 1-minute chunks for speed
							"-reset_timestamps", "1",
							"-preset", "ultrafast",
						])
						.on("error", (err) => reject(err))
						.on("end", () => resolve())
						.save(segmentTemplate);
				});
			const segmentationEndTime = Date.now();
			console.log(`Segmentation completed in ${segmentationEndTime - segmentationStartTime}ms at ${new Date().toISOString()}`);

				const files = (await fs.promises.readdir(segmentDir))
					.filter((f) => f.startsWith("part-") && f.endsWith(".mp3"))
					.sort();

				if (!files.length) {
					throw new Error("Segmentation failed");
				}

				// Process chunks with aggressive parallelization
				console.log(`Processing ${files.length} chunks in parallel for Vercel at ${new Date().toISOString()}`);
				const chunkStartTime = Date.now();
				const chunkPromises = files.map(async (f) => {
					const p = path.join(segmentDir, f);
					const stream = fs.createReadStream(p);
					const res = await openai.audio.transcriptions.create({
						file: stream,
						model: "whisper-1",
						response_format: "text",
						temperature: 0.0,
						language: "en",
					});
					const text = typeof res === "string" ? res : (res as { text?: string }).text || "";
					return { index: parseInt(f.match(/\d+/)?.[0] || "0"), text: text.trim() };
				});

				// Wait for all chunks with timeout
				const chunkResults = await Promise.race([
					Promise.all(chunkPromises),
					new Promise<never>((_, reject) => 
						setTimeout(() => reject(new Error("Chunk processing timeout")), TRANSCRIBE_TIMEOUT)
					)
				]);
				const chunkEndTime = Date.now();
				console.log(`Chunk processing completed in ${chunkEndTime - chunkStartTime}ms at ${new Date().toISOString()}`);

				const fullText = chunkResults
					.sort((a, b) => a.index - b.index)
					.map(r => r.text)
					.join("\n");

				// Cache the result
				transcriptCache.set(cacheKey, { transcript: fullText, timestamp: Date.now() });
				console.log(`Vercel parallel transcription completed in ${Date.now() - startTime}ms at ${new Date().toISOString()}`);
				return fullText;
			}
	} catch (error) {
		console.error(`Vercel transcription failed after ${Date.now() - startTime}ms:`, error);
		throw error;
	} finally {
		// Cleanup
		if (audioPath) {
			console.log(`Cleaning up temp files at ${new Date().toISOString()}`);
			await cleanupYtdlTempFiles(audioPath);
		}
	}
}

