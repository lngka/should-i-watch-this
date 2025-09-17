import type { AnalysisOutput } from "@/analyze";
import { analyzeTranscript } from "@/analyze";
import prisma from "@/lib/prisma";
import { enqueueJob, memoryQueue } from "@/lib/queue";
import { fetchCaptions } from "@/transcripts/captions";
import { transcribeWithWhisper } from "@/transcripts/whisper";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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
		const JOB_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes timeout
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
						data: { status: "FAILED", errorMessage: "Job timed out after 10 minutes" } 
					});
					memoryQueue.setFailed(job.id);
				} catch (timeoutError) {
					console.error(`Failed to update job ${job.id} status after timeout:`, timeoutError);
				}
			}, JOB_TIMEOUT_MS);
			
			console.log(`Starting analysis for job ${job.id}`);
			
			// Step 1: Fetch captions with timeout
			console.log(`Step 1: Fetching captions for ${url}`);
			let transcript = await Promise.race([
				fetchCaptions(url),
				new Promise<string | null>((_, reject) => 
					setTimeout(() => reject(new Error("Caption fetch timeout")), 30000)
				)
			]);
			
			if (!transcript) {
				console.log(`No captions found for ${url}, falling back to Whisper`);
				// Step 2: Whisper transcription with timeout
				console.log(`Step 2: Starting Whisper transcription`);
				transcript = await Promise.race([
					transcribeWithWhisper(url),
					new Promise<string>((_, reject) => 
						setTimeout(() => reject(new Error("Whisper transcription timeout")), 8 * 60 * 1000) // 8 minutes for Whisper
					)
				]);
			}
			
			console.log(`Got transcript, length: ${transcript.length}`);
			
			// Step 3: Analysis with timeout
			console.log(`Step 3: Starting analysis`);
			const analysis: AnalysisOutput = await Promise.race([
				analyzeTranscript(transcript, url),
				new Promise<AnalysisOutput>((_, reject) => 
					setTimeout(() => reject(new Error("Analysis timeout")), 2 * 60 * 1000) // 2 minutes for analysis
				)
			]);
			
			console.log(`Analysis complete for job ${job.id}`);
			
			// Step 4: Save to database
			console.log(`Step 4: Saving analysis to database`);
			const created = await prisma.analysis.create({
				data: {
					oneLiner: analysis.oneLiner,
					bulletPoints: analysis.bulletPoints as unknown as string[],
					outline: analysis.outline as unknown as string[],
					trustScore: analysis.trustScore,
					trustSignals: analysis.trustSignals as unknown as string[],
					job: { connect: { id: job.id } },
				},
			});
			
			// Step 5: Save claims and spot checks
			console.log(`Step 5: Saving claims and spot checks`);
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

