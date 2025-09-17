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

	// In-memory worker path: run in background
	(async () => {
		try {
			await prisma.job.update({ where: { id: job.id }, data: { status: "RUNNING" } });
			memoryQueue.setRunning(job.id);
			
			console.log(`Starting analysis for job ${job.id}`);
			let transcript = await fetchCaptions(url);
			if (!transcript) {
				console.log(`No captions found for ${url}, falling back to Whisper`);
				transcript = await transcribeWithWhisper(url);
			}
			console.log(`Got transcript, length: ${transcript.length}`);
			
			const analysis: AnalysisOutput = await analyzeTranscript(transcript, url);
			console.log(`Analysis complete for job ${job.id}`);
			
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
			
			await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
			memoryQueue.setCompleted(job.id, analysis);
			console.log(`Job ${job.id} completed successfully`);
		} catch (e) {
			console.error(`Job ${job.id} failed:`, e);
			const message = (e instanceof Error) ? e.message : String(e);
			await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", errorMessage: message } });
			memoryQueue.setFailed(job.id);
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

