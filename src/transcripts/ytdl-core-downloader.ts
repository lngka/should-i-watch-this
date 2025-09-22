import fs from "fs";
import os from "os";
import path from "path";
import ytdl from "ytdl-core";

export interface DownloadResult {
	audioPath: string;
	fileSize: number;
}

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/youtube\.com\/v\/([^&\n?#]+)/,
		/youtube\.com\/watch\?.*v=([^&\n?#]+)/,
		/youtube\.com\/live\/([^&\n?#]+)/
	];

	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match) {
			return match[1];
		}
	}

	return null;
}

/**
 * Validate video accessibility and requirements before attempting download
 */
export async function validateVideoForProcessing(videoUrl: string): Promise<{
	isValid: boolean;
	error?: string;
	videoInfo?: any;
}> {
	try {
		// Extract video ID
		const videoId = extractVideoId(videoUrl);
		if (!videoId) {
			return { isValid: false, error: 'Could not extract video ID from URL' };
		}
		
		// Create clean URL
		const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
		
		// Validate URL format
		if (!ytdl.validateURL(cleanVideoUrl)) {
			return { isValid: false, error: 'Invalid YouTube URL format' };
		}
		
		// Get video info
		const videoInfo = await ytdl.getInfo(cleanVideoUrl);
		const details = videoInfo.videoDetails;
		
		// Check if video is accessible
		if (details.isPrivate) {
			return { 
				isValid: false, 
				error: 'This video is private and cannot be processed. Please use a public video.',
				videoInfo 
			};
		}
		
		if (details.isLiveContent) {
			return { 
				isValid: false, 
				error: 'Live streams cannot be processed. Please use a regular video.',
				videoInfo 
			};
		}
		
		// Check video duration
		const duration = parseInt(details.lengthSeconds);
		if (duration > 1200) { // 20 minutes
			const durationMinutes = Math.round(duration / 60);
			return { 
				isValid: false, 
				error: `Video is too long: ${durationMinutes} minutes (maximum: 20 minutes)`,
				videoInfo 
			};
		}
		
		// Check if video has audio formats
		const audioFormats = ytdl.filterFormats(videoInfo.formats, 'audioonly');
		if (audioFormats.length === 0) {
			// Try alternative format detection - look for any format with audio
			const formatsWithAudio = videoInfo.formats.filter((format: any) => 
				format.audioCodec && format.audioCodec !== 'none' && format.hasAudio
			);
			
			if (formatsWithAudio.length === 0) {
				return { 
					isValid: false, 
					error: `This video does not have any audio tracks available for processing. The video might be silent or have restricted audio access.`,
					videoInfo 
				};
			} else {
				// Check if we have video formats with audio (our fallback strategy)
				const videoFormatsWithAudio = formatsWithAudio.filter((format: any) => 
					format.hasVideo && format.hasAudio
				);
				
				if (videoFormatsWithAudio.length === 0) {
					return { 
						isValid: false, 
						error: `This video has audio but no suitable formats for processing. The audio might be in an unsupported format.`,
						videoInfo 
					};
				}
			}
		}
		
		return { isValid: true, videoInfo };
		
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		// Provide specific error messages for common issues
		if (errorMessage.includes('Video unavailable')) {
			return { 
				isValid: false, 
				error: 'This video is unavailable. It may have been deleted, made private, or is not accessible in your region.' 
			};
		}
		
		if (errorMessage.includes('Sign in to confirm your age')) {
			return { 
				isValid: false, 
				error: 'This video requires age verification and cannot be processed automatically.' 
			};
		}
		
		if (errorMessage.includes('This video is not available')) {
			return { 
				isValid: false, 
				error: 'This video is not available. It may be region-restricted or have been removed.' 
			};
		}
		
		return { 
			isValid: false, 
			error: `Failed to validate video: ${errorMessage}` 
		};
	}
}

/**
 * Extract audio from video file using ffmpeg
 */
async function extractAudioFromVideo(videoPath: string, audioPath: string): Promise<void> {
	// DISABLED: ffmpeg dependency removed
	throw new Error("extractAudioFromVideo is disabled: ffmpeg dependency was removed. Use the new SIWT Media Worker API instead.");
}

/**
 * Download YouTube audio using ytdl-core (Vercel-compatible)
 */
export async function downloadYouTubeAudioWithYtdlCore(
	videoUrl: string, 
	prefix: string = "youtube",
	maxSizeBytes: number = 20 * 1024 * 1024
): Promise<DownloadResult> {
	// Extract video ID from URL
	const videoId = extractVideoId(videoUrl);
	if (!videoId) {
		throw new Error('Could not extract video ID from URL');
	}
	
	// Create a clean video URL
	const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
	
	// Validate URL
	if (!ytdl.validateURL(cleanVideoUrl)) {
		throw new Error('Invalid YouTube URL');
	}

	// Get video info to check duration and availability
	let videoInfo;
	try {
		videoInfo = await ytdl.getInfo(cleanVideoUrl);
		const duration = parseInt(videoInfo.videoDetails.lengthSeconds);
		const durationMinutes = Math.round(duration / 60);
		
		console.log(`Video title: ${videoInfo.videoDetails.title}`);
		console.log(`Video duration: ${durationMinutes} minutes`);
		console.log(`Video is private: ${videoInfo.videoDetails.isPrivate}`);
		console.log(`Video is live: ${videoInfo.videoDetails.isLiveContent}`);
		
		// Check if video is accessible
		if (videoInfo.videoDetails.isPrivate) {
			throw new Error('This video is private and cannot be processed');
		}
		
		if (videoInfo.videoDetails.isLiveContent) {
			throw new Error('Live streams cannot be processed. Please use a regular video.');
		}
		
		// Skip videos longer than 20 minutes as they're likely too large
		if (duration > 1200) { // 20 minutes = 1200 seconds
			throw new Error(`Video too long: ${durationMinutes} minutes (max: 20 minutes for 20MB limit)`);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		if (errorMessage.includes('Video too long') || errorMessage.includes('private') || errorMessage.includes('Live streams')) {
			throw error;
		}
		console.warn(`Could not get video info: ${errorMessage}`);
		// Continue without video info - we'll try to get formats directly
	}

	// Create temp directory
	const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
	const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, `${prefix}-`));
	const audioPath = path.join(tempDir, "audio.mp3");

	try {
		// Get audio format - try multiple approaches
		let audioFormats: any[] = [];
		
		// First try: use video info if available
		if (videoInfo?.formats) {
			audioFormats = ytdl.filterFormats(videoInfo.formats, 'audioonly');
			console.log(`Found ${audioFormats.length} audio formats from video info`);
		}
		
		// Second try: get fresh info if no formats found
		if (audioFormats.length === 0) {
			console.log('No audio formats found in video info, trying direct format discovery...');
			try {
				const directInfo = await ytdl.getInfo(cleanVideoUrl);
				audioFormats = ytdl.filterFormats(directInfo.formats, 'audioonly');
				console.log(`Found ${audioFormats.length} audio formats from direct discovery`);
			} catch (directError) {
				console.warn('Direct format discovery failed:', directError);
			}
		}
		
		// Third try: look for video formats with audio (smaller file sizes)
		if (audioFormats.length === 0) {
			console.log('No audio-only formats found, looking for video formats with audio...');
			try {
				const info = videoInfo || await ytdl.getInfo(cleanVideoUrl);
				const allFormats = info.formats || [];
				
				// Look for video formats that have audio codec and are reasonably small
				const videoFormatsWithAudio = allFormats.filter(format => 
					format.audioCodec && 
					format.audioCodec !== 'none' && 
					format.hasAudio && 
					format.hasVideo && // Must have video
					format.container && 
					format.container !== 'webm' && // Prefer mp4 over webm for better compatibility
					format.contentLength && 
					parseInt(format.contentLength) <= maxSizeBytes * 2 // Allow 2x size since we'll extract audio
				);
				
				if (videoFormatsWithAudio.length > 0) {
					// Sort by file size (smallest first) and prefer mp4
					videoFormatsWithAudio.sort((a, b) => {
						const aSize = parseInt(a.contentLength || '0');
						const bSize = parseInt(b.contentLength || '0');
						if (aSize !== bSize) return aSize - bSize;
						// Prefer mp4 over other containers
						if (a.container === 'mp4' && b.container !== 'mp4') return -1;
						if (b.container === 'mp4' && a.container !== 'mp4') return 1;
						return 0;
					});
					
					audioFormats = videoFormatsWithAudio;
					console.log(`Found ${audioFormats.length} video formats with audio (will extract audio track)`);
				} else {
					// Fallback: any format with audio, regardless of size
					audioFormats = allFormats.filter(format => 
						format.audioCodec && format.audioCodec !== 'none' && format.hasAudio
					);
					console.log(`Found ${audioFormats.length} formats with audio codec (fallback)`);
				}
			} catch (fallbackError) {
				console.warn('Fallback format discovery failed:', fallbackError);
			}
		}
		
		// Fourth try: use ytdl's built-in format selection
		if (audioFormats.length === 0) {
			console.log('No formats with audio found, trying ytdl format selection...');
			try {
				// Try to get a format using ytdl's built-in selection
				const testStream = ytdl(cleanVideoUrl, { quality: 'highestaudio' });
				// If we can create a stream, the video has audio
				audioFormats = [{ itag: 'highestaudio', hasAudio: true }];
				testStream.destroy(); // Clean up the test stream
				console.log('Successfully created audio stream, using highestaudio format');
			} catch (streamError) {
				console.warn('Stream creation failed:', streamError);
			}
		}
		
		if (audioFormats.length === 0) {
			// Provide more specific error message
			const videoTitle = videoInfo?.videoDetails?.title || 'Unknown';
			throw new Error(`No audio formats available for this video: "${videoTitle}". This could be because the video is private, region-restricted, or doesn't contain audio. Please try a different video.`);
		}

		console.log(`Found ${audioFormats.length} audio formats`);

		// Choose the best audio format (highest quality that's not too large)
		const bestFormat = audioFormats.reduce((best, current) => {
			// Handle special case for fallback format
			if (current.itag === 'highestaudio') {
				return current;
			}
			if (best.itag === 'highestaudio') {
				return best;
			}
			
			// Prefer formats with known bitrate and size info
			if (current.audioBitrate && current.contentLength) {
				const currentSize = parseInt(current.contentLength);
				const bestSize = best.contentLength ? parseInt(best.contentLength) : Infinity;
				
				// Choose smaller file if both are under limit, otherwise choose best quality
				if (currentSize <= maxSizeBytes && bestSize <= maxSizeBytes) {
					return currentSize < bestSize ? current : best;
				} else if (currentSize <= maxSizeBytes) {
					return current;
				} else if (bestSize <= maxSizeBytes) {
					return best;
				}
			}
			
			// Fallback to highest bitrate
			return (current.audioBitrate || 0) > (best.audioBitrate || 0) ? current : best;
		});

		console.log(`Selected format: ${bestFormat.itag}, bitrate: ${bestFormat.audioBitrate}, size: ${bestFormat.contentLength}, hasVideo: ${bestFormat.hasVideo}`);

		// Determine if we need to extract audio from video
		const isVideoFormat = bestFormat.hasVideo && bestFormat.hasAudio;
		const downloadPath = isVideoFormat ? 
			path.join(path.dirname(audioPath), "video.mp4") : 
			audioPath;

		// Download audio or video
		return new Promise((resolve, reject) => {
			const stream = ytdl(cleanVideoUrl, { 
				format: bestFormat.itag === 'highestaudio' ? 'highestaudio' : bestFormat,
				quality: 'highestaudio'
			});

			const writeStream = fs.createWriteStream(downloadPath);
			let downloadedBytes = 0;

			stream.on('data', (chunk) => {
				downloadedBytes += chunk.length;
				
				// Check size during download
				if (downloadedBytes > maxSizeBytes) {
					stream.destroy();
					writeStream.destroy();
					reject(new Error(`File too large during download: ${Math.round(downloadedBytes / 1024 / 1024)}MB (limit: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`));
					return;
				}
			});

			stream.on('error', (error) => {
				writeStream.destroy();
				reject(error);
			});

			writeStream.on('error', (error) => {
				stream.destroy();
				reject(error);
			});

			writeStream.on('finish', async () => {
				try {
					const stats = await fs.promises.stat(downloadPath);
					if (stats.size > maxSizeBytes) {
						reject(new Error(`Downloaded file too large: ${stats.size} bytes (limit: ${maxSizeBytes})`));
						return;
					}
					
					console.log(`Successfully downloaded ${isVideoFormat ? 'video' : 'audio'}: ${stats.size} bytes`);
					
					// If we downloaded a video, extract audio from it
					if (isVideoFormat) {
						console.log('Extracting audio from video file...');
						await extractAudioFromVideo(downloadPath, audioPath);
						
						// Get final audio file stats
						const audioStats = await fs.promises.stat(audioPath);
						console.log(`Audio extraction complete: ${audioStats.size} bytes`);
						
						resolve({
							audioPath,
							fileSize: audioStats.size
						});
					} else {
						resolve({
							audioPath,
							fileSize: stats.size
						});
					}
				} catch (error) {
					reject(error);
				}
			});

			stream.pipe(writeStream);
		});

	} catch (error) {
		// Clean up temp directory on failure
		try {
			// Remove any downloaded files
			await fs.promises.unlink(audioPath).catch(() => {});
			await fs.promises.unlink(path.join(path.dirname(audioPath), "video.mp4")).catch(() => {});
			await fs.promises.rmdir(tempDir);
		} catch {}
		throw error;
	}
}

/**
 * Clean up temporary files and directories
 */
export async function cleanupTempFiles(audioPath: string): Promise<void> {
	try {
		const tempDir = path.dirname(audioPath);
		
		// Remove audio file
		await fs.promises.unlink(audioPath).catch(() => {});
		
		// Remove video file if it exists (from video+audio extraction)
		await fs.promises.unlink(path.join(tempDir, "video.mp4")).catch(() => {});
		
		// Clean up segments directory if it exists
		const segmentDir = path.join(tempDir, "segments");
		const exists = await fs.promises.stat(segmentDir).then(() => true).catch(() => false);
		if (exists) {
			const entries = await fs.promises.readdir(segmentDir);
			await Promise.all(entries.map((e) => fs.promises.unlink(path.join(segmentDir, e)).catch(() => {})));
			await fs.promises.rmdir(segmentDir).catch(() => {});
		}
		
		await fs.promises.rmdir(tempDir).catch(() => {});
	} catch (error) {
		console.warn(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Read audio file as buffer
 */
export async function readAudioBuffer(audioPath: string): Promise<Buffer> {
	return await fs.promises.readFile(audioPath);
}
