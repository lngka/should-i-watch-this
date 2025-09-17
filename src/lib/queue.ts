export type JobPayload = { videoUrl: string };
export type JobResult = {
	oneLiner: string;
	bulletPoints: string[];
	outline: string[];
	trustScore: number;
	trustSignals: string[];
	claims: Array<{
		text: string;
		confidence: number;
		spotChecks: Array<{ url: string; summary: string; verdict: string }>;
	}>;
};

export interface JobQueue {
	enqueue(payload: JobPayload): Promise<{ jobId: string }>;
	getResult(jobId: string): Promise<JobResult | null>;
	getStatus(jobId: string): Promise<"PENDING" | "RUNNING" | "COMPLETED" | "FAILED">;
}

class MemoryQueue implements JobQueue {
	private jobs = new Map<string, { status: string; result?: JobResult }>();

	async enqueue(payload: JobPayload): Promise<{ jobId: string }> {
		const jobId = crypto.randomUUID();
		this.jobs.set(jobId, { status: "PENDING" });
		// Fire and forget; the API route will call analyzer using in-process worker
		return { jobId };
	}

	async getResult(jobId: string): Promise<JobResult | null> {
		return this.jobs.get(jobId)?.result ?? null;
	}

	async getStatus(jobId: string) {
		return (this.jobs.get(jobId)?.status as any) ?? "PENDING";
	}

	setRunning(jobId: string) {
		const job = this.jobs.get(jobId);
		if (job) job.status = "RUNNING";
	}

	setCompleted(jobId: string, result: JobResult) {
		this.jobs.set(jobId, { status: "COMPLETED", result });
	}

	setFailed(jobId: string) {
		const job = this.jobs.get(jobId);
		if (job) job.status = "FAILED";
	}
}

export const memoryQueue = new MemoryQueue();

export async function enqueueJob(payload: JobPayload) {
	if (process.env.QUEUE_BACKEND === "supabase" && process.env.SUPABASE_WORKER_URL) {
		// Defer to Supabase Edge Function worker
		const res = await fetch(`${process.env.SUPABASE_WORKER_URL}/enqueue`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Worker-Secret": process.env.SUPABASE_WORKER_SECRET || "",
			},
			body: JSON.stringify(payload),
		});
		if (!res.ok) throw new Error(`Worker enqueue failed: ${res.status}`);
		return (await res.json()) as { jobId: string };
	}
	return memoryQueue.enqueue(payload);
}

