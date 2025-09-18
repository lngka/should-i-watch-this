import { detectLanguage, getLanguageSpecificPrompts } from "@/lib/language-detection";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export async function analyzeTranscript(transcript: string, videoUrl: string): Promise<AnalysisOutput> {
	// Detect the language of the transcript
	const languageInfo = await detectLanguage(transcript);
	console.log(`Detected language: ${languageInfo.language} (${languageInfo.languageCode}) with confidence ${languageInfo.confidence}`);
	
	// Get language-specific prompts
	const prompts = getLanguageSpecificPrompts(languageInfo);
	
	const system = prompts.system;
	const user = prompts.user.replace('{transcript}', transcript.slice(0, 20000));

	const res = await openai.chat.completions.create({
		model: "gpt-4o-mini",
		messages: [
			{ role: "system", content: system },
			{ role: "user", content: user },
		],
		response_format: { type: "json_object" },
		temperature: 0.3,
	});
	const content = res.choices[0]?.message?.content || "{}";
	const result = JSON.parse(content);
	
	// Add language information to the result
	return {
		...result,
		language: languageInfo.language,
		languageCode: languageInfo.languageCode,
	};
}

