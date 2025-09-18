import prisma from "@/lib/prisma";
import { extractVideoMetadata } from "@/lib/video-metadata";
import { NextResponse } from "next/server";

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
	const { jobId } = await params;
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
	
	if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
	
	// Calculate elapsed time
	const elapsedTime = Date.now() - job.createdAt.getTime();
	
	// Get video metadata - try from database first, then extract from URL if not available
	let videoMetadata = {
		title: job.analysis?.video?.title || null,
		channel: job.analysis?.video?.channel || null,
		url: job.videoUrl
	};
	
	// If we don't have video metadata in the database, try to extract it from the URL
	if (!videoMetadata.title || !videoMetadata.channel) {
		try {
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
	
	// Add elapsed time, transcript, and video metadata to response
	const response = {
		...job,
		elapsedTime,
		transcript: job.analysis?.video?.transcript || null,
		videoMetadata
	};
	
	return NextResponse.json(response);
}

