
export interface LanguageInfo {
	language: string;
	languageCode: string;
	confidence: number;
}

export async function detectLanguage(text: string, metadata?: { title?: string | null; description?: string | null }): Promise<LanguageInfo> {
	try {
		// Combine text with metadata for better detection
		const combinedText = [
			text,
			metadata?.title || '',
			metadata?.description || ''
		].filter(Boolean).join(' ');

		// Simple heuristic-based detection for common languages
		const languagePatterns = {
			'Vietnamese': /[ạảãâầấậẩẫăằắặẳẵệểễịỉĩọỏõôồốộổỗơờớợởỡụủũưừứựửữỵỷỹđ]/i,
			'English': /^[a-zA-Z\s.,!?'"()-]+$/,
			'Spanish': /[ñáéíóúü]/i,
			'French': /[àâäéèêëïîôöùûüÿç]/i,
			'German': /[äöüß]/i,
			'Italian': /[àèéìíîòóù]/i,
			'Portuguese': /[ãõç]/i,
			'Russian': /[а-яё]/i,
			'Chinese': /[\u4e00-\u9fff]/,
			'Japanese': /[\u3040-\u309f\u30a0-\u30ff]/,
			'Korean': /[\uac00-\ud7af]/,
			'Arabic': /[\u0600-\u06ff]/,
			'Hindi': /[\u0900-\u097f]/,
		};

		// Check for Vietnamese first (has unique diacritics that might be confused with other languages)
		if (languagePatterns.Vietnamese.test(combinedText)) {
			return { language: 'Vietnamese', languageCode: 'vi', confidence: 0.9 };
		}

		// Check for non-Latin scripts
		if (languagePatterns.Chinese.test(combinedText)) {
			return { language: 'Chinese', languageCode: 'zh', confidence: 0.9 };
		}
		if (languagePatterns.Japanese.test(combinedText)) {
			return { language: 'Japanese', languageCode: 'ja', confidence: 0.9 };
		}
		if (languagePatterns.Korean.test(combinedText)) {
			return { language: 'Korean', languageCode: 'ko', confidence: 0.9 };
		}
		if (languagePatterns.Arabic.test(combinedText)) {
			return { language: 'Arabic', languageCode: 'ar', confidence: 0.9 };
		}
		if (languagePatterns.Hindi.test(combinedText)) {
			return { language: 'Hindi', languageCode: 'hi', confidence: 0.9 };
		}
		if (languagePatterns.Russian.test(combinedText)) {
			return { language: 'Russian', languageCode: 'ru', confidence: 0.9 };
		}

		// Check for Latin-based languages
		if (languagePatterns.Spanish.test(combinedText)) {
			return { language: 'Spanish', languageCode: 'es', confidence: 0.8 };
		}
		if (languagePatterns.French.test(combinedText)) {
			return { language: 'French', languageCode: 'fr', confidence: 0.8 };
		}
		if (languagePatterns.German.test(combinedText)) {
			return { language: 'German', languageCode: 'de', confidence: 0.8 };
		}
		if (languagePatterns.Italian.test(combinedText)) {
			return { language: 'Italian', languageCode: 'it', confidence: 0.8 };
		}
		if (languagePatterns.Portuguese.test(combinedText)) {
			return { language: 'Portuguese', languageCode: 'pt', confidence: 0.8 };
		}

		// Default to English if no specific patterns match
		return { language: 'English', languageCode: 'en', confidence: 0.7 };
	} catch (error) {
		console.error('Language detection failed:', error);
		return { language: 'English', languageCode: 'en', confidence: 0.5 };
	}
}

export function getLanguageSpecificPrompts(languageInfo: LanguageInfo) {
	const language = languageInfo.language;
	
	if (language === 'English') {
		return {
			system: `You are an assistant that summarizes YouTube videos and evaluates trustworthiness. Return JSON. Avoid markdown.`,
			user: `Transcript:\n{transcript}\n\nReturn a JSON with keys: oneLiner, bulletPoints (5-7), outline (sections), trustScore (0-100), trustSignals (array), claims (2-5, each {text, confidence 0-100, spotChecks: 2-3 items {url, summary, verdict}}). Consider web spot-checks using general knowledge, include plausible URLs to reputable sources if unsure.`
		};
	}

	// For non-English languages, provide instructions in the detected language
	const languageInstructions = {
		'Spanish': {
			system: `Eres un asistente que resume videos de YouTube y evalúa la confiabilidad. Devuelve JSON. Evita markdown.`,
			user: `Transcripción:\n{transcript}\n\nDevuelve un JSON con claves: oneLiner, bulletPoints (5-7), outline (secciones), trustScore (0-100), trustSignals (array), claims (2-5, cada uno {text, confidence 0-100, spotChecks: 2-3 elementos {url, summary, verdict}}). Considera verificaciones web usando conocimiento general, incluye URLs plausibles a fuentes confiables si no estás seguro.`
		},
		'French': {
			system: `Vous êtes un assistant qui résume les vidéos YouTube et évalue la fiabilité. Retournez JSON. Évitez markdown.`,
			user: `Transcription:\n{transcript}\n\nRetournez un JSON avec les clés: oneLiner, bulletPoints (5-7), outline (sections), trustScore (0-100), trustSignals (array), claims (2-5, chacun {text, confidence 0-100, spotChecks: 2-3 éléments {url, summary, verdict}}). Considérez les vérifications web en utilisant les connaissances générales, incluez des URLs plausibles vers des sources réputées si vous n'êtes pas sûr.`
		},
		'German': {
			system: `Sie sind ein Assistent, der YouTube-Videos zusammenfasst und die Vertrauenswürdigkeit bewertet. Geben Sie JSON zurück. Vermeiden Sie Markdown.`,
			user: `Transkript:\n{transcript}\n\nGeben Sie ein JSON mit Schlüsseln zurück: oneLiner, bulletPoints (5-7), outline (Abschnitte), trustScore (0-100), trustSignals (Array), claims (2-5, jeder {text, confidence 0-100, spotChecks: 2-3 Elemente {url, summary, verdict}}). Berücksichtigen Sie Web-Überprüfungen mit allgemeinem Wissen, fügen Sie plausible URLs zu seriösen Quellen hinzu, wenn Sie unsicher sind.`
		},
		'Chinese': {
			system: `你是一个助手，负责总结YouTube视频并评估可信度。返回JSON格式。避免使用markdown。`,
			user: `转录文本:\n{transcript}\n\n返回一个JSON，包含以下键: oneLiner, bulletPoints (5-7个), outline (章节), trustScore (0-100), trustSignals (数组), claims (2-5个，每个包含 {text, confidence 0-100, spotChecks: 2-3个 {url, summary, verdict}})。考虑使用一般知识进行网络验证，如果不确定，请包含指向可靠来源的合理URL。`
		},
		'Japanese': {
			system: `あなたはYouTube動画を要約し、信頼性を評価するアシスタントです。JSONを返してください。Markdownは避けてください。`,
			user: `転写:\n{transcript}\n\n以下のキーを持つJSONを返してください: oneLiner, bulletPoints (5-7個), outline (セクション), trustScore (0-100), trustSignals (配列), claims (2-5個、それぞれ {text, confidence 0-100, spotChecks: 2-3個 {url, summary, verdict}})。一般的な知識を使用したウェブ検証を考慮し、不明な場合は信頼できるソースへの妥当なURLを含めてください。`
		},
		'Korean': {
			system: `당신은 YouTube 동영상을 요약하고 신뢰성을 평가하는 어시스턴트입니다. JSON을 반환하세요. Markdown을 피하세요.`,
			user: `전사:\n{transcript}\n\n다음 키를 가진 JSON을 반환하세요: oneLiner, bulletPoints (5-7개), outline (섹션), trustScore (0-100), trustSignals (배열), claims (2-5개, 각각 {text, confidence 0-100, spotChecks: 2-3개 {url, summary, verdict}}). 일반 지식을 사용한 웹 검증을 고려하고, 확실하지 않은 경우 신뢰할 수 있는 소스에 대한 합리적인 URL을 포함하세요.`
		},
		'Vietnamese': {
			system: `Bạn là một trợ lý tóm tắt video YouTube và đánh giá độ tin cậy. Trả về JSON. Tránh markdown.`,
			user: `Bản ghi:\n{transcript}\n\nTrả về JSON với các khóa: oneLiner, bulletPoints (5-7), outline (các phần), trustScore (0-100), trustSignals (mảng), claims (2-5, mỗi {text, confidence 0-100, spotChecks: 2-3 {url, summary, verdict}}). Xem xét việc kiểm tra web bằng kiến thức chung, bao gồm các URL hợp lý đến các nguồn đáng tin cậy nếu không chắc chắn.`
		}
	};

	return languageInstructions[language as keyof typeof languageInstructions] || languageInstructions['Spanish'];
}
