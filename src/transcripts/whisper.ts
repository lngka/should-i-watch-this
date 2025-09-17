import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import OpenAI from "openai";
import os from "os";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeWithWhisper(videoUrl: string): Promise<string> {
	console.log(`Starting Whisper transcription for: ${videoUrl}`);

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
		const info = await ytdl.getInfo(videoUrl, { requestOptions: { headers: requestHeaders } as any });
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
			{ filter: "audioonly", quality: "highestaudio", highWaterMark: 1 << 25 },
			{ filter: "audioonly", highWaterMark: 1 << 25 },
			{ quality: "lowestaudio", highWaterMark: 1 << 25 },
			{ highWaterMark: 1 << 25 },
		];

		let success = false;
		for (let i = 0; i < attempts.length; i++) {
			const base = attempts[i] as any;
			const options = {
				...base,
				requestOptions: { headers: requestHeaders },
			} as any;
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
				file: fileStream as any,
				model: "whisper-1",
				response_format: "text",
			});
			return typeof res === "string" ? res : (res as any).text || "";
		}

		// Prepare ffmpeg if available
		let canUseFfmpeg = false;
		try {
			// Use runtime require to avoid Turbopack bundling platform subpackages
			const req: any = (eval as any)("require");
			const installer = req("@ffmpeg-installer/ffmpeg");
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
				file: fileStream as any,
				model: "whisper-1",
				response_format: "text",
			});
			return typeof res === "string" ? res : (res as any).text || "";
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

		let fullText = "";
		for (const f of files) {
			const p = path.join(segmentDir, f);
			const st = await fs.promises.stat(p);
			if (st.size > maxBytes) {
				throw new Error(`Chunk ${f} still exceeds max size after compression`);
			}
			console.log(`Transcribing chunk ${f} (${Math.round(st.size / 1024 / 1024)} MB)`);
			const stream = fs.createReadStream(p);
			const res = await openai.audio.transcriptions.create({
				file: stream as any,
				model: "whisper-1",
				response_format: "text",
			});
			const text = typeof res === "string" ? res : (res as any).text || "";
			fullText += (fullText ? "\n" : "") + text.trim();
		}

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

