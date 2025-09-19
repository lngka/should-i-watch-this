import { detectLanguage, getLanguageSpecificPrompts } from "@/lib/language-detection";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Note: Monitor your OpenAI API usage at https://platform.openai.com/usage
// Consider implementing usage tracking and alerts for quota management

export type AnalysisOutput = {
	oneLiner: string;
	bulletPoints: string[];
	outline: string[];
	trustScore: number;
	trustSignals: string[];
	language: string;
	languageCode: string;
	claims: Array<{
		text: string;
		confidence: number;
		spotChecks: Array<{ url: string; summary: string; verdict: string }>;
	}>;
};

export async function analyzeTranscript(transcript: string, videoUrl: string, metadata?: { title?: string | null; description?: string | null }): Promise<AnalysisOutput> {
	// Detect the language of the transcript using metadata as additional context
	const languageInfo = await detectLanguage(transcript, metadata);
	console.log(`Detected language: ${languageInfo.language} (${languageInfo.languageCode}) with confidence ${languageInfo.confidence}`);
	
	// Get language-specific prompts
	const prompts = getLanguageSpecificPrompts(languageInfo);
	
	const system = prompts.system;
	const user = prompts.user.replace('{transcript}', transcript.slice(0, 20000));

	try {
		// Try gpt-4o-mini first, fallback to gpt-3.5-turbo if quota exceeded
		let res;
		try {
			res = await openai.chat.completions.create({
				model: "gpt-4o-mini",
				messages: [
					{ role: "system", content: system },
					{ role: "user", content: user },
				],
				response_format: { type: "json_object" },
				temperature: 0.3,
			});
		} catch (quotaError: any) {
			if (quotaError.status === 429 && quotaError.code === 'insufficient_quota') {
				console.log('gpt-4o-mini quota exceeded, falling back to gpt-3.5-turbo');
				res = await openai.chat.completions.create({
					model: "gpt-3.5-turbo",
					messages: [
						{ role: "system", content: system },
						{ role: "user", content: user },
					],
					response_format: { type: "json_object" },
					temperature: 0.3,
				});
			} else {
				throw quotaError;
			}
		}
		const content = res.choices[0]?.message?.content || "{}";
		const result = JSON.parse(content);
		
		// Add language information to the result
		return {
			...result,
			language: languageInfo.language,
			languageCode: languageInfo.languageCode,
		};
	} catch (error: any) {
		console.error('OpenAI API error:', error);
		
		// Handle specific error types
		if (error.status === 429) {
			if (error.code === 'insufficient_quota') {
				throw new Error('OpenAI API quota exceeded. Please check your billing details and try again later. For more information, visit: https://platform.openai.com/docs/guides/error-codes/api-errors');
			} else if (error.code === 'rate_limit_exceeded') {
				throw new Error('OpenAI API rate limit exceeded. Please wait a moment and try again.');
			} else {
				throw new Error('OpenAI API rate limit exceeded. Please try again later.');
			}
		} else if (error.status === 401) {
			throw new Error('OpenAI API authentication failed. Please check your API key configuration.');
		} else if (error.status === 500) {
			throw new Error('OpenAI API server error. Please try again later.');
		} else if (error.status === 503) {
			throw new Error('OpenAI API service temporarily unavailable. Please try again later.');
		} else {
			// Generic error handling
			const errorMessage = error.message || 'Unknown OpenAI API error';
			throw new Error(`OpenAI API error: ${errorMessage}`);
		}
	}
}

