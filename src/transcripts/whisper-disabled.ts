// DISABLED: This file has been disabled due to ffmpeg dependency removal
// Use the new SIWT Media Worker API instead

export async function transcribeWithWhisper(videoUrl: string): Promise<string> {
	throw new Error("transcribeWithWhisper is disabled: ffmpeg dependency was removed. Use the new SIWT Media Worker API instead.");
}

export async function transcribeWithWhisperOptimized(videoUrl: string): Promise<string> {
	throw new Error("transcribeWithWhisperOptimized is disabled: ffmpeg dependency was removed. Use the new SIWT Media Worker API instead.");
}

export async function transcribeForVercel(videoUrl: string): Promise<string> {
	throw new Error("transcribeForVercel is disabled: ffmpeg dependency was removed. Use the new SIWT Media Worker API instead.");
}
