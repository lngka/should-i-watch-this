import prisma from "@/lib/prisma";
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
	
	// Add elapsed time and transcript to response
	const response = {
		...job,
		elapsedTime,
		transcript: job.analysis?.video?.transcript || null
	};
	
	return NextResponse.json(response);
}

