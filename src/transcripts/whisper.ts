import crypto from "crypto";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Cache for transcripts to avoid re-processing
const transcriptCache = new Map<string, { transcript: string; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Generate cache key from video URL
function getCacheKey(videoUrl: string): string {
	return crypto.createHash('md5').update(videoUrl).digest('hex');
}

export async function transcribeWithWhisper(videoUrl: string): Promise<string> {
	// DISABLED: ffmpeg dependency removed
	throw new Error("transcribeWithWhisper is disabled: ffmpeg dependency was removed. Use the new SIWT Media Worker API instead.");
}

// New optimized transcription function with streaming
export async function transcribeWithWhisperOptimized(videoUrl: string): Promise<string> {
	// DISABLED: ffmpeg dependency removed
	throw new Error("transcribeWithWhisperOptimized is disabled: ffmpeg dependency was removed. Use the new SIWT Media Worker API instead.");
}

// Vercel-optimized transcription with aggressive time limits
export async function transcribeForVercel(videoUrl: string): Promise<string> {
	// DISABLED: ffmpeg dependency removed
	throw new Error("transcribeForVercel is disabled: ffmpeg dependency was removed. Use the new SIWT Media Worker API instead.");
}