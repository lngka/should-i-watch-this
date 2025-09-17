import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type AnalysisOutput = {
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

export async function analyzeTranscript(transcript: string, videoUrl: string): Promise<AnalysisOutput> {
	const system = `You are an assistant that summarizes YouTube videos and evaluates trustworthiness. Return JSON. Avoid markdown.`;
	const user = `Transcript:\n${transcript.slice(0, 20000)}\n\nReturn a JSON with keys: oneLiner, bulletPoints (5-7), outline (sections), trustScore (0-100), trustSignals (array), claims (2-5, each {text, confidence 0-100, spotChecks: 2-3 items {url, summary, verdict}}). Consider web spot-checks using general knowledge, include plausible URLs to reputable sources if unsure.`;

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
	return JSON.parse(content);
}

