import fs from "fs";
import os from "os";
import path from "path";
import { YtDlp } from "ytdlp-nodejs";

// Shared YouTube download utilities

export interface DownloadResult {
	audioPath: string;
	fileSize: number;
}

interface VideoFormat {
	format_id: string;
	filesize?: number;
	vcodec: string;
	acodec: string;
	quality?: number;
}

// Create a global instance of YtDlp
const ytDlp = new YtDlp();

/**
 * Get video info with enhanced headers and retry logic
 */
export async function getVideoInfo(videoUrl: string): Promise<{ title: string; channel: string } | null> {
	try {
		// Extract video ID from URL (handles playlist URLs by getting the main video ID)
		const videoId = extractVideoId(videoUrl);
		if (!videoId) {
			console.warn(`Could not extract video ID from URL: ${videoUrl}`);
			return null;
		}
		
		// Create a clean video URL without playlist parameters
		const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
		
		const info = await ytDlp.getInfoAsync(cleanVideoUrl);
		
		// Check if it's a video (not a playlist)
		if (info._type === 'video') {
			return {
				title: info.title || 'Unknown Title',
				channel: info.uploader || 'Unknown Channel'
			};
		}
		
		console.warn(`URL appears to be a playlist, not a single video: ${videoUrl}`);
		return null;
	} catch (error) {
		console.warn(`Failed to get video info for ${videoUrl}:`, error instanceof Error ? error.message : String(error));
		return null;
	}
}

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/youtube\.com\/v\/([^&\n?#]+)/,
		/youtube\.com\/watch\?.*v=([^&\n?#]+)/
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
 * Get the best audio format for a video based on available formats
 */
async function getBestAudioFormat(videoUrl: string, maxSizeBytes: number): Promise<string | null> {
	try {
		console.log('Discovering available formats...');
		
		// Get video info to see available formats
		const info = await ytDlp.getInfoAsync(videoUrl);
		
		if (info._type !== 'video' || !info.formats) {
			console.warn('No format information available');
			return null;
		}
		
		// Filter for audio-only formats
		const audioFormats = info.formats.filter((format: VideoFormat) => {
			return format.vcodec === 'none' && format.acodec !== 'none';
		});
		
		if (audioFormats.length === 0) {
			console.warn('No audio-only formats found');
			return null;
		}
		
		// Sort by file size (if available) or by quality (lower is better for size)
		const sortedFormats = audioFormats.sort((a: VideoFormat, b: VideoFormat) => {
			// If both have file size info, sort by size
			if (a.filesize && b.filesize) {
				return a.filesize - b.filesize;
			}
			// If only one has file size, prefer the one with size info
			if (a.filesize && !b.filesize) return -1;
			if (!a.filesize && b.filesize) return 1;
			
			// Fall back to sorting by quality (lower quality = smaller file)
			const aQuality = a.quality || 999;
			const bQuality = b.quality || 999;
			return aQuality - bQuality;
		});
		
		// Find the best format that fits within size limit
		for (const format of sortedFormats) {
			if (format.filesize && format.filesize <= maxSizeBytes) {
				console.log(`Selected format: ${format.format_id} (${Math.round(format.filesize / 1024 / 1024)}MB)`);
				return format.format_id;
			}
		}
		
		// If no format fits the size limit, return null to indicate no suitable format
		const smallestFormat = sortedFormats[0];
		const sizeMB = smallestFormat.filesize ? Math.round(smallestFormat.filesize / 1024 / 1024) : 'unknown';
		console.log(`No format fits size limit. Smallest available: ${smallestFormat.format_id} (${sizeMB}MB) - exceeds ${Math.round(maxSizeBytes / 1024 / 1024)}MB limit`);
		return null;
		
	} catch (error) {
		console.warn(`Failed to discover formats: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

/**
 * Download audio from YouTube with enhanced error handling and size monitoring
 */
export async function downloadYouTubeAudio(
	videoUrl: string, 
	prefix: string = "youtube",
	maxSizeBytes: number = 20 * 1024 * 1024
): Promise<DownloadResult> {
	// Extract video ID from URL (handles playlist URLs by getting the main video ID)
	const videoId = extractVideoId(videoUrl);
	if (!videoId) {
		throw new Error('Could not extract video ID from URL');
	}
	
	// Create a clean video URL without playlist parameters
	const cleanVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;
	
	// First, check video duration to avoid downloading very long videos
	try {
		const info = await ytDlp.getInfoAsync(cleanVideoUrl);
		if (info._type === 'video' && info.duration) {
			const durationMinutes = Math.round(info.duration / 60);
			console.log(`Video duration: ${durationMinutes} minutes`);
			
			// Skip videos longer than 20 minutes as they're likely too large for 20MB limit
			// Rough estimate: 1 minute of audio ≈ 1MB, so 20 minutes ≈ 20MB
			if (info.duration > 1200) { // 20 minutes = 1200 seconds
				throw new Error(`Video too long: ${durationMinutes} minutes (max: 20 minutes for 20MB limit)`);
			}
			
			// For videos longer than 10 minutes, be more aggressive with format selection
			if (info.duration > 600) { // 10 minutes = 600 seconds
				console.log(`Long video detected (${durationMinutes} min), using conservative format selection`);
			}
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.warn(`Could not check video duration: ${errorMessage}`);
		
		// If the error is about video being too long, re-throw it to stop the process
		if (errorMessage.includes('Video too long')) {
			throw error;
		}
		// Continue with download attempt only if it's a different error
	}
	
	const tmpRoot = process.env.VERCEL ? "/tmp" : os.tmpdir();
	const tempDir = await fs.promises.mkdtemp(path.join(tmpRoot, `${prefix}-`));
	const audioPath = path.join(tempDir, "audio.mp3");

	// First, try to discover the best format using format discovery
	let discoveredFormat: string | null = null;
	try {
		discoveredFormat = await getBestAudioFormat(cleanVideoUrl, maxSizeBytes);
		if (discoveredFormat === null) {
			throw new Error('No audio format available that fits within size limit');
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.warn(`Format discovery failed: ${errorMessage}`);
		
		// If no suitable format was found, fail early
		if (errorMessage.includes('No audio format available that fits within size limit')) {
			throw new Error(`Video too large: No audio format available under ${Math.round(maxSizeBytes / 1024 / 1024)}MB limit`);
		}
	}

	// Fallback format options if discovery fails
	const fallbackFormatOptions = [
		"worstaudio", // Start with smallest audio format
		"bestaudio[filesize<10M]", // Try to limit by file size (more restrictive)
		"bestaudio[filesize<15M]",
		"bestaudio[filesize<20M]",
		"bestaudio[ext=m4a][filesize<10M]",
		"bestaudio[ext=mp3][filesize<10M]",
		"bestaudio[ext=m4a][filesize<15M]",
		"bestaudio[ext=mp3][filesize<15M]",
		"bestaudio[ext=m4a][filesize<20M]",
		"bestaudio[ext=mp3][filesize<20M]",
		"bestaudio",
		"best[filesize<10M]",
		"best[filesize<15M]",
		"best[filesize<20M]",
		"best",
	];

	// Combine discovered format (if available) with fallback options
	const formatOptions = discoveredFormat ? [discoveredFormat, ...fallbackFormatOptions] : fallbackFormatOptions;

	let lastError: Error | null = null;
	
	for (let i = 0; i < formatOptions.length; i++) {
		const format = formatOptions[i];
		
		try {
			console.log(`Trying download with format:`, format);
			
			// Use ytdlp-nodejs to download audio with timeout and cancellation
			let downloadCancelled = false;
			let progressCount = 0;
			const maxProgressChecks = 5; // Limit progress check spam
			
			// Create a promise that can be cancelled
			const downloadPromise = new Promise<void>((resolve, reject) => {
				// Start the download
				ytDlp.downloadAsync(cleanVideoUrl, {
					format: format,
					output: audioPath,
					onProgress: (progress: { total?: number; downloaded?: number; percentage?: number }) => {
						// Monitor file size during download
						if (progress.total && progress.total > maxSizeBytes) {
							progressCount++;
							if (progressCount <= maxProgressChecks) {
								console.warn(`File too large during download: ${Math.round(progress.total / 1024 / 1024)}MB (limit: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`);
							}
							downloadCancelled = true;
							// Try to cancel by rejecting the promise
							reject(new Error(`File too large during download (limit: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`));
						}
					}
				}).then(() => resolve()).catch(reject);
			});
			
			// Add timeout to prevent hanging downloads (shorter timeout for large files)
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('Download timeout')), 20000); // 20 second timeout
			});
			
			await Promise.race([downloadPromise, timeoutPromise]);
			
			// Check if download was cancelled due to size
			if (downloadCancelled) {
				throw new Error(`File too large during download (limit: ${Math.round(maxSizeBytes / 1024 / 1024)}MB)`);
			}
			
			// Check final file size
			const stats = await fs.promises.stat(audioPath);
			if (stats.size > maxSizeBytes) {
				throw new Error(`Downloaded file too large: ${stats.size} bytes (limit: ${maxSizeBytes})`);
			}
			
			console.log(`Successfully downloaded audio: ${stats.size} bytes`);
			return {
				audioPath,
				fileSize: stats.size
			};
			
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			console.warn(`Download attempt ${i + 1} failed:`, lastError.message);
			
			// Clean up failed download
			try {
				await fs.promises.unlink(audioPath);
			} catch {}
			
			// Wait before retry with exponential backoff
			if (i < formatOptions.length - 1) {
				await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
			}
		}
	}

	// Clean up temp directory on failure
	try {
		await fs.promises.rmdir(tempDir);
	} catch {}

	throw new Error(`All download attempts failed. Last error: ${lastError?.message}`);
}

/**
 * Clean up temporary files and directories
 */
export async function cleanupTempFiles(audioPath: string): Promise<void> {
	try {
		const tempDir = path.dirname(audioPath);
		await fs.promises.unlink(audioPath).catch(() => {});
		
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

/**
 * Get file size in bytes
 */
export async function getFileSize(audioPath: string): Promise<number> {
	const stats = await fs.promises.stat(audioPath);
	return stats.size;
}
