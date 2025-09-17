import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
	try {
		// Find jobs that have been running for more than 15 minutes
		const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
		
		const stuckJobs = await prisma.job.findMany({
			where: {
				status: "RUNNING",
				updatedAt: {
					lt: fifteenMinutesAgo
				}
			},
			select: {
				id: true,
				videoUrl: true,
				createdAt: true,
				updatedAt: true,
				status: true
			}
		});

		// Find jobs that have been pending for more than 5 minutes
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
		
		const stuckPendingJobs = await prisma.job.findMany({
			where: {
				status: "PENDING",
				createdAt: {
					lt: fiveMinutesAgo
				}
			},
			select: {
				id: true,
				videoUrl: true,
				createdAt: true,
				updatedAt: true,
				status: true
			}
		});

		// Get overall job statistics
		const jobStats = await prisma.job.groupBy({
			by: ['status'],
			_count: {
				status: true
			}
		});

		return NextResponse.json({
			stuckRunningJobs: stuckJobs,
			stuckPendingJobs: stuckPendingJobs,
			jobStats: jobStats.reduce((acc, stat) => {
				acc[stat.status] = stat._count.status;
				return acc;
			}, {} as Record<string, number>),
			totalStuckJobs: stuckJobs.length + stuckPendingJobs.length
		});
	} catch (error) {
		console.error("Error in health check:", error);
		return NextResponse.json(
			{ error: "Health check failed" }, 
			{ status: 500 }
		);
	}
}

// Endpoint to manually fix stuck jobs
export async function POST(req: Request) {
	try {
		const { action, jobIds } = await req.json();
		
		if (action === "mark_failed") {
			if (!jobIds || !Array.isArray(jobIds)) {
				return NextResponse.json({ error: "jobIds array required" }, { status: 400 });
			}
			
			const result = await prisma.job.updateMany({
				where: {
					id: { in: jobIds },
					status: { in: ["RUNNING", "PENDING"] }
				},
				data: {
					status: "FAILED",
					errorMessage: "Manually marked as failed due to being stuck"
				}
			});
			
			return NextResponse.json({ 
				message: `Marked ${result.count} jobs as failed`,
				affectedJobs: result.count
			});
		}
		
		return NextResponse.json({ error: "Invalid action" }, { status: 400 });
	} catch (error) {
		console.error("Error in health check POST:", error);
		return NextResponse.json(
			{ error: "Failed to process request" }, 
			{ status: 500 }
		);
	}
}
