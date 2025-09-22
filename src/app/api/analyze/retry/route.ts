import type { AnalysisOutput } from "@/analyze";
import { analyzeTranscript } from "@/analyze";
import { detectLanguage } from "@/lib/improved-language-detection";
import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
	try {
		const { jobId } = await req.json();
		if (!jobId || typeof jobId !== "string") {
			return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
		}

		console.log(`Retrying analysis for job: ${jobId}`);

		// Get the existing job and its data
		const existingJob = await prisma.job.findUnique({
			where: { id: jobId },
			include: { 
				analysis: {
					include: {
						video: true
					}
				}
			}
		});

		if (!existingJob) {
			return NextResponse.json({ error: "Job not found" }, { status: 404 });
		}

		if (!existingJob.analysis?.video?.transcript) {
			return NextResponse.json({ error: "No transcript available for retry" }, { status: 400 });
		}

		const transcript = existingJob.analysis.video.transcript;
		const videoUrl = existingJob.videoUrl;
		const videoTitle = existingJob.analysis.video.title;
		const videoChannel = existingJob.analysis.video.channel;

		// Redetect language using title + part of transcript for better accuracy
		// Use more text for better accuracy with franc-min, but not too much for performance
		const transcriptSample = transcript.slice(0, 5000); // Use first 5000 characters for language detection
		const combinedText = [
			videoTitle || '',
			transcriptSample
		].filter(Boolean).join(' ');

		console.log(`Redetecting language from title + transcript sample (${combinedText.length} chars)`);
		const languageInfo = await detectLanguage(combinedText, { 
			title: videoTitle, 
			description: null 
		});
		console.log(`Redetected language: ${languageInfo.language} (${languageInfo.languageCode}) with confidence ${languageInfo.confidence}`);

		// Update job status to running
		await prisma.job.update({ 
			where: { id: jobId }, 
			data: { 
				status: "RUNNING",
				errorMessage: null
			} 
		});

		// Redo the analysis with the new language detection
		console.log(`Redoing analysis with new language: ${languageInfo.language}`);
		const analysis: AnalysisOutput = await analyzeTranscript(
			transcript, 
			videoUrl, 
			{ title: videoTitle, description: null }
		);

		console.log(`Retry analysis complete for job ${jobId}`);

		// Validate the analysis result before saving
		if (!analysis.oneLiner || !analysis.bulletPoints || analysis.trustScore === undefined) {
			throw new Error("Invalid analysis result - missing required fields");
		}

		console.log(`Analysis validation passed, saving results to database`);

		// Only save the new results if the analysis was successful
		// Update the existing analysis with new results
		await prisma.analysis.update({
			where: { id: existingJob.analysis.id },
			data: {
				oneLiner: analysis.oneLiner,
				bulletPoints: analysis.bulletPoints as unknown as string[],
				outline: analysis.outline as unknown as string[],
				trustScore: analysis.trustScore,
				trustSignals: analysis.trustSignals as unknown as string[],
				language: analysis.language,
				languageCode: analysis.languageCode,
			}
		});

		// Delete existing claims and spot checks
		await prisma.spotCheck.deleteMany({
			where: {
				claim: {
					analysisId: existingJob.analysis.id
				}
			}
		});
		await prisma.claim.deleteMany({
			where: {
				analysisId: existingJob.analysis.id
			}
		});

		// Save new claims and spot checks
		console.log(`Saving new claims and spot checks`);
		for (const c of analysis.claims) {
			const claim = await prisma.claim.create({
				data: {
					analysisId: existingJob.analysis.id,
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

		// Mark job as completed only after successful save
		await prisma.job.update({ 
			where: { id: jobId }, 
			data: { status: "COMPLETED" } 
		});

		console.log(`Job ${jobId} retry completed successfully and results saved to database`);

		return NextResponse.json({ 
			success: true, 
			message: "Analysis retried successfully and results saved",
			language: analysis.language,
			languageCode: analysis.languageCode
		});

	} catch (error) {
		console.error("Error in POST /api/analyze/retry:", error);
		const message = error instanceof Error ? error.message : "Unknown error occurred";
		
		// Restore job status to completed if retry failed (keep original results)
		try {
			await prisma.job.update({ 
				where: { id: jobId }, 
				data: { 
					status: "COMPLETED", 
					errorMessage: null // Clear any error message since we're keeping original results
				} 
			});
			console.log(`Job ${jobId} status restored to COMPLETED after retry failure`);
		} catch (updateError) {
			console.error("Failed to restore job status after retry error:", updateError);
		}

		return NextResponse.json({ error: message }, { status: 500 });
	}
}
