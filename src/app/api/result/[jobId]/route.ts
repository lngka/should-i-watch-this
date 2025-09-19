import prisma from "@/lib/prisma";
import { extractVideoMetadata } from "@/lib/video-metadata";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
	try {
		const { jobId } = await params;
		console.log(`Fetching result for job ID: ${jobId}`);
		
		const job = await prisma.job.findUnique({ 
			where: { id: jobId }, 
			include: { 
				analysis: { 
					include: { 
						claims: { 
							include: { 
								spotChecks: true 
							} 
						},
						video: true
					} 
				} 
			} 
		});
		
		if (!job) {
			console.log(`Job not found: ${jobId}`);
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}
		
		console.log(`Found job: ${jobId}, status: ${job.status}`);
		
		// Calculate elapsed time
		const elapsedTime = Date.now() - job.createdAt.getTime();
		
		// Check for video record independently of analysis (for transcripts saved during running jobs)
		let videoRecord = null;
		try {
			videoRecord = await prisma.video.findUnique({
				where: { url: job.videoUrl }
			});
		} catch (error) {
			console.error('Failed to fetch video record:', error);
		}
		
		// Get video metadata - try from database first, then extract from URL if not available
		let videoMetadata = {
			title: job.analysis?.video?.title || videoRecord?.title || null,
			channel: job.analysis?.video?.channel || videoRecord?.channel || null,
			url: job.videoUrl
		};
		
		// If we don't have video metadata in the database, try to extract it from the URL
		if (!videoMetadata.title || !videoMetadata.channel) {
			try {
				console.log(`Extracting video metadata for: ${job.videoUrl}`);
				const extractedMetadata = await extractVideoMetadata(job.videoUrl);
				videoMetadata = {
					title: videoMetadata.title || extractedMetadata.title,
					channel: videoMetadata.channel || extractedMetadata.channel,
					url: job.videoUrl
				};
			} catch (error) {
				console.error('Failed to extract video metadata:', error);
				// Keep the existing metadata (which might be null)
			}
		}
		
		// Get transcript from either completed analysis or saved video record
		const transcript = job.analysis?.video?.transcript || videoRecord?.transcript || null;
		
		// Add elapsed time, transcript, and video metadata to response
		const response = {
			...job,
			elapsedTime,
			transcript,
			videoMetadata
		};
		
		console.log(`Returning response for job ${jobId}`);
		return NextResponse.json(response);
	} catch (error) {
		console.error('Error in GET /api/result/[jobId]:', error);
		return NextResponse.json(
			{ error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
}

