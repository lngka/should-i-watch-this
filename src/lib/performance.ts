// Performance monitoring utilities for Vercel optimization

export interface PerformanceMetrics {
	operation: string;
	duration: number;
	timestamp: number;
	success: boolean;
	error?: string;
}

class PerformanceMonitor {
	private metrics: PerformanceMetrics[] = [];
	private readonly maxMetrics = 100; // Keep last 100 metrics

	record(operation: string, duration: number, success: boolean, error?: string): void {
		const metric: PerformanceMetrics = {
			operation,
			duration,
			timestamp: Date.now(),
			success,
			error,
		};

		this.metrics.push(metric);
		
		// Keep only the most recent metrics
		if (this.metrics.length > this.maxMetrics) {
			this.metrics = this.metrics.slice(-this.maxMetrics);
		}

		// Log performance warnings
		if (duration > 60000) { // 1 minute
			console.warn(`Slow operation: ${operation} took ${duration}ms`);
		}
	}

	getMetrics(): PerformanceMetrics[] {
		return [...this.metrics];
	}

	getAverageTime(operation: string): number {
		const operationMetrics = this.metrics.filter(m => m.operation === operation && m.success);
		if (operationMetrics.length === 0) return 0;
		
		const total = operationMetrics.reduce((sum, m) => sum + m.duration, 0);
		return total / operationMetrics.length;
	}

	getSuccessRate(operation: string): number {
		const operationMetrics = this.metrics.filter(m => m.operation === operation);
		if (operationMetrics.length === 0) return 0;
		
		const successful = operationMetrics.filter(m => m.success).length;
		return (successful / operationMetrics.length) * 100;
	}

	clear(): void {
		this.metrics = [];
	}
}

export const performanceMonitor = new PerformanceMonitor();

// Utility function to measure async operations
export async function measureAsync<T>(
	operation: string,
	fn: () => Promise<T>
): Promise<T> {
	const start = Date.now();
	let success = false;
	let error: string | undefined;

	try {
		const result = await fn();
		success = true;
		return result;
	} catch (err) {
		error = err instanceof Error ? err.message : String(err);
		throw err;
	} finally {
		const duration = Date.now() - start;
		performanceMonitor.record(operation, duration, success, error);
	}
}

// Vercel-specific performance optimizations
export const VERCEL_LIMITS = {
	MAX_DURATION: 300000, // 5 minutes in milliseconds
	SAFE_DURATION: 240000, // 4 minutes (leave 1 minute buffer)
	DOWNLOAD_TIMEOUT: 60000, // 1 minute for downloads
	TRANSCRIBE_TIMEOUT: 180000, // 3 minutes for transcription
	ANALYSIS_TIMEOUT: 60000, // 1 minute for analysis
} as const;

// Check if we're approaching time limits
export function checkTimeLimit(startTime: number, operation: string): void {
	const elapsed = Date.now() - startTime;
	const remaining = VERCEL_LIMITS.SAFE_DURATION - elapsed;
	
	if (remaining < 30000) { // Less than 30 seconds left
		console.warn(`Time limit approaching for ${operation}: ${remaining}ms remaining`);
	}
	
	if (remaining <= 0) {
		throw new Error(`Time limit exceeded for ${operation}`);
	}
}

// Get recommended chunk size based on remaining time
export function getOptimalChunkSize(remainingTime: number, totalChunks: number): number {
	const timePerChunk = remainingTime / totalChunks;
	
	// Adjust chunk size based on available time
	if (timePerChunk > 30000) { // More than 30 seconds per chunk
		return 120; // 2-minute chunks
	} else if (timePerChunk > 15000) { // More than 15 seconds per chunk
		return 60; // 1-minute chunks
	} else {
		return 30; // 30-second chunks
	}
}
