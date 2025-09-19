import type { AnalysisOutput } from "@/analyze";
import { analyzeTranscript } from "@/analyze";
import { detectLanguage } from "@/lib/language-detection";
import prisma from "@/lib/prisma";
import { enqueueJob, memoryQueue } from "@/lib/queue";
import { analyzeWithNewSIWT } from "@/lib/siwt-media-worker";
import { extractVideoId, extractVideoMetadata } from "@/lib/video-metadata";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Maximum video duration in seconds (15 minutes)
const MAX_VIDEO_DURATION_SECONDS = 15 * 60; // 900 seconds

export async function POST(req: Request) {
	try {
		const { url } = await req.json();
		if (!url || typeof url !== "string") return NextResponse.json({ error: "Missing url" }, { status: 400 });

		// Basic YouTube URL validation
		if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
			return NextResponse.json({ error: "Please provide a valid YouTube URL" }, { status: 400 });
		}

		console.log(`Creating job for URL: ${url}`);
		
		// Check if required environment variables are set
		if (!process.env.OPENAI_API_KEY) {
			console.error("OPENAI_API_KEY environment variable is not set");
			return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
		}

		const job = await prisma.job.create({ data: { videoUrl: url } });

	// In-memory worker path: run in background with timeout
	(async () => {
		const JOB_TIMEOUT_MS = 4.5 * 60 * 1000; // 4.5 minutes timeout (leave buffer for Vercel's 300s limit)
		let timeoutId: NodeJS.Timeout | null = null;
		
		try {
			await prisma.job.update({ where: { id: job.id }, data: { status: "RUNNING" } });
			memoryQueue.setRunning(job.id);
			
			// Set up timeout to prevent jobs from hanging indefinitely
			timeoutId = setTimeout(async () => {
				console.error(`Job ${job.id} timed out after ${JOB_TIMEOUT_MS}ms`);
				try {
					await prisma.job.update({ 
						where: { id: job.id }, 
						data: { status: "FAILED", errorMessage: "Job timed out after 4.5 minutes (Vercel limit)" } 
					});
					memoryQueue.setFailed(job.id);
				} catch (timeoutError) {
					console.error(`Failed to update job ${job.id} status after timeout:`, timeoutError);
				}
			}, JOB_TIMEOUT_MS);
			
			console.log(`Starting analysis for job ${job.id}`);
			
		// Step 1: Extract video metadata
		console.log(`Step 1: Extracting video metadata for ${url}`);
		const videoMetadata = await extractVideoMetadata(url);
		console.log(`Video metadata extracted: ${videoMetadata.title} by ${videoMetadata.channel}`);
		
		// Check video duration limit
		if (videoMetadata.duration && videoMetadata.duration > MAX_VIDEO_DURATION_SECONDS) {
			const durationMinutes = Math.round(videoMetadata.duration / 60);
			console.log(`Video duration ${durationMinutes} minutes exceeds 15-minute limit`);
			await prisma.job.update({ 
				where: { id: job.id }, 
				data: { 
					status: "FAILED", 
					errorMessage: `Video duration (${durationMinutes} minutes) exceeds the 15-minute limit. Please provide a shorter video.` 
				} 
			});
			memoryQueue.setFailed(job.id);
			return;
		}
			
			// Step 2: Try new SIWT Media Worker API first, then fall back to local transcription
			console.log(`Step 2: Attempting transcription with new SIWT Media Worker API for ${url}`);
			let transcript: string | null = null;
			let siwtMetadata = null;
			let detectedLanguage = 'en'; // Default to English
			
			// Extract video ID for SIWT Media Worker
			const videoId = extractVideoId(url);
			if (videoId) {
				try {
					// First, detect language from video metadata
					console.log(`Detecting language from video metadata for ${url}`);
					const languageInfo = await detectLanguage('', { title: videoMetadata.title, description: videoMetadata.description });
					detectedLanguage = languageInfo.languageCode;
					console.log(`Detected language: ${languageInfo.language} (${languageInfo.languageCode}) with confidence ${languageInfo.confidence}`);
					
					console.log(`Calling new SIWT Media Worker analyze API for video ID: ${videoId} with language: ${detectedLanguage}`);
					const siwtStartTime = Date.now();
					const newSiwtResponse = await Promise.race([
						analyzeWithNewSIWT(videoId, detectedLanguage),
						new Promise<never>((_, reject) => 
							setTimeout(() => reject(new Error("New SIWT Media Worker timeout")), 5 * 60 * 1000) // 5 minutes timeout
						)
					]);
					const siwtEndTime = Date.now();
					console.log(`New SIWT Media Worker analyze API completed successfully in ${siwtEndTime - siwtStartTime}ms`);
					
					// Use the text from the new API response
					transcript = newSiwtResponse.text;
					siwtMetadata = {
						transcript: newSiwtResponse.text,
						title: videoMetadata.title, // Fallback to extracted metadata
						channel: videoMetadata.channel, // Fallback to extracted metadata
						language: newSiwtResponse.language,
						source: newSiwtResponse.source
					};
				} catch (siwtError) {
					console.error(`SIWT Media Worker analyze API failed:`, siwtError);
					const errorMessage = siwtError instanceof Error ? siwtError.message : String(siwtError);
					throw new Error(`SIWT Media Worker failed: ${errorMessage}`);
				}
			} else {
				throw new Error(`Could not extract video ID from URL: ${url}`);
			}
			
			console.log(`Got transcript, length: ${transcript.length}`);
			
			// Step 4: Analysis with timeout
			console.log(`Step 4: Starting analysis`);
			const analysis: AnalysisOutput = await Promise.race([
				analyzeTranscript(transcript, url, { title: videoMetadata.title, description: videoMetadata.description }),
				new Promise<AnalysisOutput>((_, reject) => 
					setTimeout(() => reject(new Error("Analysis timeout")), 2 * 60 * 1000) // 2 minutes for analysis
				)
			]);
			
			console.log(`Analysis complete for job ${job.id}`);
			
			// Step 5: Create or update video record with metadata
			console.log(`Step 5: Saving video metadata to database`);
			// Use SIWT metadata if available, otherwise fall back to extracted metadata
			const finalTitle = siwtMetadata?.title || videoMetadata.title;
			const finalChannel = siwtMetadata?.channel || videoMetadata.channel;
			
			const video = await prisma.video.upsert({
				where: { url },
				update: {
					title: finalTitle,
					channel: finalChannel,
					transcript: transcript,
				},
				create: {
					url,
					title: finalTitle,
					channel: finalChannel,
					transcript: transcript,
				},
			});
			
			// Step 6: Save analysis to database
			console.log(`Step 6: Saving analysis to database`);
			const analysisData = {
				oneLiner: analysis.oneLiner,
				bulletPoints: analysis.bulletPoints as unknown as string[],
				outline: analysis.outline as unknown as string[],
				trustScore: analysis.trustScore,
				trustSignals: analysis.trustSignals as unknown as string[],
				language: analysis.language,
				languageCode: analysis.languageCode,
				jobId: job.id,
				videoId: video.id,
			};
			const created = await prisma.analysis.create({
				data: analysisData,
			});
			
			// Step 7: Save claims and spot checks
			console.log(`Step 7: Saving claims and spot checks`);
			for (const c of analysis.claims) {
				const claim = await prisma.claim.create({
					data: {
						analysisId: created.id,
						text: c.text,
						confidence: c.confidence,
					},
				});
				for (const s of c.spotChecks) {
					await prisma.spotCheck.create({
						data: { claimId: claim.id, url: s.url, summary: s.summary, verdict: s.verdict },
					});
				}
			}
			
			// Clear timeout and mark as completed
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			
			await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
			memoryQueue.setCompleted(job.id, analysis);
			console.log(`Job ${job.id} completed successfully`);
		} catch (e) {
			console.error(`Job ${job.id} failed:`, e);
			const message = (e instanceof Error) ? e.message : String(e);
			
			// Clear timeout if it exists
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
			
			try {
				await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: message } });
				memoryQueue.setFailed(job.id);
			} catch (dbError) {
				console.error(`Failed to update job ${job.id} status in database:`, dbError);
			}
		}
	})();

		await enqueueJob({ videoUrl: url });
		return NextResponse.json({ jobId: job.id }, { status: 202 });
	} catch (error) {
		console.error("Error in POST /api/analyze:", error);
		const message = error instanceof Error ? error.message : "Unknown error occurred";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

