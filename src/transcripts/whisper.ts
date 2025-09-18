import ytdl from "@distube/ytdl-core";
import crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import OpenAI from "openai";
import os from "os";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cache for transcripts to avoid re-processing
const transcriptCache = new Map<string, { transcript: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Generate cache key from video URL
function getCacheKey(videoUrl: string): string {
	return crypto.createHash('md5').update(videoUrl).digest('hex');
}

// Optimized audio processing with streaming compression for Vercel
async function processAudioStream(videoUrl: string, requestHeaders: Record<string, string>): Promise<string> {
	const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
	const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, "siwt-stream-"));
	const outputPath = path.join(tempDir, "optimized-audio.mp3");
	
	try {
		// Use aggressive compression settings for Vercel's 300s limit
		const options = {
			filter: "audioonly" as const,
			quality: "lowestaudio" as const, // Use lowest quality for speed
			highWaterMark: 1 << 20, // Smaller buffer for faster processing
			requestOptions: { headers: requestHeaders }
		};

		await new Promise<void>((resolve, reject) => {
			const stream = ytdl(videoUrl, options);
			
			// Aggressive compression for speed
			ffmpeg()
				.input(stream)
				.audioCodec("libmp3lame")
				.audioChannels(1)
				.audioBitrate("16k") // Very low bitrate for speed
				.audioFrequency(8000) // Lower frequency for speed
				.outputOptions(["-vn", "-f", "mp3", "-preset", "ultrafast"])
				.on("error", (err) => {
					console.error(`FFmpeg error: ${err}`);
					reject(err);
				})
				.on("end", () => {
					console.log(`Fast compression complete: ${outputPath}`);
					resolve();
				})
				.save(outputPath);

			stream.on("error", (err) => {
				console.error(`Stream error: ${err}`);
				reject(err);
			});
		});

		return outputPath;
	} catch (error) {
		// Cleanup on error
		try { await fs.promises.unlink(outputPath); } catch {}
		try { await fs.promises.rmdir(tempDir); } catch {}
		throw error;
	}
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

	// Prepare request headers; allow override via env for better success rates
	const defaultUA =
		process.env.YOUTUBE_USER_AGENT ||
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
	const requestHeaders: Record<string, string> = {
		"User-Agent": defaultUA,
		"Accept-Language": "en-US,en;q=0.9",
	};
	if (process.env.YOUTUBE_COOKIE) {
		requestHeaders["cookie"] = process.env.YOUTUBE_COOKIE;
	}

	// Try to validate video URL first, but don't fail if it doesn't work
	let videoTitle = "Unknown";
	try {
		const info = await ytdl.getInfo(videoUrl, { requestOptions: { headers: requestHeaders } });
		videoTitle = info.videoDetails.title;
		console.log(`Video title: ${videoTitle}`);
	} catch (error) {
		console.warn(`Could not get video info, proceeding anyway: ${error}`);
		// Don't throw here, try to proceed with download
	}

	const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
	const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, "siwt-"));
	const audioPath = path.join(tempDir, "audio-source.mp4");
	const compressedPath = path.join(tempDir, "audio-compressed.mp3");
	try {
		// Try with retries, tuned headers, and larger buffer
		const attempts = [
			{ filter: "audioonly" as const, quality: "highestaudio" as const, highWaterMark: 1 << 25 },
			{ filter: "audioonly" as const, highWaterMark: 1 << 25 },
			{ quality: "lowestaudio" as const, highWaterMark: 1 << 25 },
			{ highWaterMark: 1 << 25 },
		];

		let success = false;
		for (let i = 0; i < attempts.length; i++) {
			const base = attempts[i];
			const options = {
				...base,
				requestOptions: { headers: requestHeaders },
			};
			try {
				console.log(`Trying ytdl attempt ${i + 1}/${attempts.length} with options`, options);
				await new Promise<void>((resolve, reject) => {
					const stream = ytdl(videoUrl, options);
					const write = fs.createWriteStream(audioPath, { highWaterMark: 1 << 20 });
					stream.on("error", (err) => {
						console.error(`ytdl stream error: ${err}`);
						reject(err);
					});
					write.on("error", (err) => {
						console.error(`File write error: ${err}`);
						reject(err);
					});
					write.on("finish", () => {
						console.log(`Audio downloaded to: ${audioPath}`);
						resolve();
					});
					stream.pipe(write);
				});
				success = true;
				break;
			} catch (err) {
				console.warn(`Attempt ${i + 1} failed: ${err}`);
				await new Promise((r) => setTimeout(r, 500 * (i + 1)));
			}
		}

		if (!success) {
			throw new Error("All ytdl download attempts failed (403). Provide YOUTUBE_COOKIE env from your browser session to improve success.");
		}

		// First try: if the downloaded audio is already under the limit, upload directly (no ffmpeg)
		const maxBytes = 24 * 1024 * 1024; // safety margin
		const downloadedStats = await fs.promises.stat(audioPath);
		if (downloadedStats.size <= maxBytes) {
			console.log(`Uploading audio directly (${Math.round(downloadedStats.size / 1024 / 1024)} MB)`);
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
			// Use runtime require to avoid Turbopack bundling platform subpackages
			const req = (eval as (code: string) => unknown)("require") as (module: string) => unknown;
			const installer = req("@ffmpeg-installer/ffmpeg") as { path?: string };
			if (installer?.path) {
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
		const segmentDir = path.join(tempDir, "segments");
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
		try { await fs.promises.unlink(audioPath); } catch {}
		try { await fs.promises.unlink(compressedPath); } catch {}
		try {
			const segDir = path.join(tempDir, "segments");
			const exists = await fs.promises
				.stat(segDir)
				.then(() => true)
				.catch(() => false);
			if (exists) {
				const entries = await fs.promises.readdir(segDir);
				await Promise.all(entries.map((e) => fs.promises.unlink(path.join(segDir, e)).catch(() => {})));
				await fs.promises.rmdir(segDir).catch(() => {});
			}
		} catch {}
		try { await fs.promises.rmdir(tempDir); } catch {}
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

	// Prepare request headers
	const defaultUA =
		process.env.YOUTUBE_USER_AGENT ||
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
	const requestHeaders: Record<string, string> = {
		"User-Agent": defaultUA,
		"Accept-Language": "en-US,en;q=0.9",
	};
	if (process.env.YOUTUBE_COOKIE) {
		requestHeaders["cookie"] = process.env.YOUTUBE_COOKIE;
	}

	let audioPath: string | undefined;
	try {
		// Use streaming compression for better performance
		audioPath = await processAudioStream(videoUrl, requestHeaders);
		
		// Check if we need to segment
		const maxBytes = 24 * 1024 * 1024; // 24MB limit
		const stats = await fs.promises.stat(audioPath);
		
		if (stats.size <= maxBytes) {
			// Direct transcription
			console.log(`Transcribing audio directly (${Math.round(stats.size / 1024 / 1024)} MB)`);
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
			try {
				const tempDir = path.dirname(audioPath);
				await fs.promises.unlink(audioPath).catch(() => {});
				const segmentDir = path.join(tempDir, "segments");
				const exists = await fs.promises.stat(segmentDir).then(() => true).catch(() => false);
				if (exists) {
					const entries = await fs.promises.readdir(segmentDir);
					await Promise.all(entries.map((e) => fs.promises.unlink(path.join(segmentDir, e)).catch(() => {})));
					await fs.promises.rmdir(segmentDir).catch(() => {});
				}
				await fs.promises.rmdir(tempDir).catch(() => {});
			} catch {}
		}
	}
}

// Vercel-optimized transcription with aggressive time limits
export async function transcribeForVercel(videoUrl: string): Promise<string> {
	console.log(`Starting Vercel-optimized transcription for: ${videoUrl}`);

	// Check cache first
	const cacheKey = getCacheKey(videoUrl);
	const cached = transcriptCache.get(cacheKey);
	if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
		console.log(`Using cached transcript for: ${videoUrl}`);
		return cached.transcript;
	}

	// Set aggressive timeouts for Vercel's 300s limit
	const TOTAL_TIMEOUT = 240000; // 4 minutes (leave 1 minute buffer)
	const DOWNLOAD_TIMEOUT = 60000; // 1 minute for download
	const TRANSCRIBE_TIMEOUT = 180000; // 3 minutes for transcription

	const startTime = Date.now();

	try {
		// Prepare request headers
		const defaultUA =
			process.env.YOUTUBE_USER_AGENT ||
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
		const requestHeaders: Record<string, string> = {
			"User-Agent": defaultUA,
			"Accept-Language": "en-US,en;q=0.9",
		};
		if (process.env.YOUTUBE_COOKIE) {
			requestHeaders["cookie"] = process.env.YOUTUBE_COOKIE;
		}

		// Fast download with timeout
		const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
		const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, "vercel-"));
		const audioPath = path.join(tempDir, "fast-audio.mp3");

		try {
			// Download with aggressive settings and timeout
			await Promise.race([
				new Promise<void>((resolve, reject) => {
					const stream = ytdl(videoUrl, {
						filter: "audioonly",
						quality: "lowestaudio", // Fastest download
						highWaterMark: 1 << 18, // Small buffer
						requestOptions: { headers: requestHeaders }
					});
					
					const write = fs.createWriteStream(audioPath);
					stream.pipe(write);
					write.on("finish", resolve);
					write.on("error", reject);
					stream.on("error", reject);
				}),
				new Promise<never>((_, reject) => 
					setTimeout(() => reject(new Error("Download timeout")), DOWNLOAD_TIMEOUT)
				)
			]);

			// Check if we have time left
			if (Date.now() - startTime > TOTAL_TIMEOUT) {
				throw new Error("Timeout: Download took too long");
			}

			// Fast compression
			const compressedPath = path.join(tempDir, "compressed.mp3");
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

			// Check file size and transcribe
			const stats = await fs.promises.stat(compressedPath);
			const maxBytes = 24 * 1024 * 1024; // 24MB limit

			if (stats.size <= maxBytes) {
				// Direct transcription with timeout
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

				// Cache the result
				transcriptCache.set(cacheKey, { transcript, timestamp: Date.now() });
				console.log(`Vercel transcription completed in ${Date.now() - startTime}ms`);
				return transcript;
			} else {
				// Segment and process in parallel with time limit
				const segmentDir = path.join(tempDir, "segments");
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

				const files = (await fs.promises.readdir(segmentDir))
					.filter((f) => f.startsWith("part-") && f.endsWith(".mp3"))
					.sort();

				if (!files.length) {
					throw new Error("Segmentation failed");
				}

				// Process chunks with aggressive parallelization
				console.log(`Processing ${files.length} chunks in parallel for Vercel`);
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

				const fullText = chunkResults
					.sort((a, b) => a.index - b.index)
					.map(r => r.text)
					.join("\n");

				// Cache the result
				transcriptCache.set(cacheKey, { transcript: fullText, timestamp: Date.now() });
				console.log(`Vercel parallel transcription completed in ${Date.now() - startTime}ms`);
				return fullText;
			}
		} finally {
			// Cleanup
			try {
				await fs.promises.unlink(audioPath).catch(() => {});
				const compressedPath = path.join(tempDir, "compressed.mp3");
				await fs.promises.unlink(compressedPath).catch(() => {});
				const segmentDir = path.join(tempDir, "segments");
				const exists = await fs.promises.stat(segmentDir).then(() => true).catch(() => false);
				if (exists) {
					const entries = await fs.promises.readdir(segmentDir);
					await Promise.all(entries.map((e) => fs.promises.unlink(path.join(segmentDir, e)).catch(() => {})));
					await fs.promises.rmdir(segmentDir).catch(() => {});
				}
				await fs.promises.rmdir(tempDir).catch(() => {});
			} catch {}
		}
	} catch (error) {
		console.error(`Vercel transcription failed after ${Date.now() - startTime}ms:`, error);
		throw error;
	}
}

