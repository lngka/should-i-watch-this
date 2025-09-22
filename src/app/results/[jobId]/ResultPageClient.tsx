"use client";
import TopNavigation from "@/components/TopNavigation";
import { addSearchToHistory } from "@/lib/user-session";
import { extractVideoId } from "@/lib/utils";
import { AlertTriangle, ArrowRight, CheckCircle, Clock, Copy, ExternalLink, FileText, Loader2, Shield, Sparkles, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

type JobResponse = {
	status: string;
	createdAt: string;
	elapsedTime: number;
	transcript?: string;
	videoMetadata?: {
		title: string | null;
		channel: string | null;
		url: string;
	};
	analysis?: {
		oneLiner: string;
		bulletPoints: string[];
		trustScore: number;
		language?: string;
		languageCode?: string;
		claims: Array<{
			id: string;
			text: string;
			confidence: number;
			spotChecks: Array<{
				url: string;
				verdict: string;
			}>;
		}>;
	};
	errorMessage?: string;
};

export default function ResultPageClient({ params }: { params: Promise<{ jobId: string }> }) {
	const { jobId } = use(params);
	const router = useRouter();
	const [data, setData] = useState<JobResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentStep, setCurrentStep] = useState<string>("Starting analysis...");
	const [progressPercent, setProgressPercent] = useState(0);
	const [copySuccess, setCopySuccess] = useState(false);
	const [isRetrying, setIsRetrying] = useState(false);
	const [isRetryingLanguage, setIsRetryingLanguage] = useState(false);
	const pollCountRef = useRef(0);

	const formatElapsedTime = (milliseconds: number) => {
		const seconds = Math.floor(milliseconds / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		
		if (hours > 0) {
			return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	};


	const copyToClipboard = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			setCopySuccess(true);
			setTimeout(() => setCopySuccess(false), 2000);
		} catch (err) {
			console.error('Failed to copy text: ', err);
		}
	};

	const retryLanguageDetection = async () => {
		if (!data?.analysis || isRetryingLanguage) return;
		
		setIsRetryingLanguage(true);
		try {
			const res = await fetch("/api/analyze/retry", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ jobId }),
			});
			
			if (res.ok) {
				const result = await res.json();
				console.log("Language retry successful:", result);
				
				// Refresh the data by polling again
				if (pollOnceRef.current) {
					pollOnceRef.current();
				}
			} else {
				const errorData = await res.json();
				console.error("Language retry failed:", errorData);
				setError(errorData.error || "Failed to retry language detection");
			}
		} catch (error) {
			console.error("Language retry error:", error);
			setError("Failed to retry language detection");
		} finally {
			setIsRetryingLanguage(false);
		}
	};

	const formatTranscript = (transcript: string) => {
		// Preserve natural line breaks and paragraphs from the original transcript
		return transcript
			.split(/\n\s*\n/) // Split on double line breaks (paragraph breaks)
			.map(paragraph => paragraph.trim())
			.filter(paragraph => paragraph.length > 0)
			.map(paragraph => {
				// Clean up single line breaks within paragraphs and normalize whitespace
				return paragraph
					.replace(/\n+/g, ' ') // Replace line breaks with spaces within paragraphs
					.replace(/\s+/g, ' ') // Normalize multiple spaces to single spaces
					.trim();
			});
	};

	// Create a ref to store the polling function so it can be called from retry button
	const pollOnceRef = useRef<(() => Promise<void>) | null>(null);

	useEffect(() => {
		let cancelled = false;
		let timer: NodeJS.Timeout | undefined;
		let pollInterval = 2000; // Start with 2 seconds
		
		async function pollOnce() {
			try {
				pollCountRef.current += 1;
				const res = await fetch(`/api/result/${jobId}`, { cache: "no-store" });
				if (cancelled) return;
				
				if (res.status === 404) {
					// Not yet created; keep polling with progressive steps
					updateProgressStep();
					timer = setTimeout(pollOnce, pollInterval);
					return;
				}
				
				let json;
				try {
					json = await res.json();
				} catch (parseError) {
					console.error('Failed to parse JSON response:', parseError);
					const text = await res.text();
					console.error('Response text:', text);
					throw new Error(`Server returned invalid response: ${text.substring(0, 100)}...`);
				}
				
				setData(json);
				setLoading(false);
				const status = json?.status;
				
				// Update search history when analysis completes
				if (status === "COMPLETED") {
					addSearchToHistory({
						videoUrl: json.videoMetadata?.url || '',
						jobId: jobId,
						status: 'completed',
						videoTitle: json.videoMetadata?.title,
						videoChannel: json.videoMetadata?.channel,
						trustScore: json.analysis?.trustScore,
						oneLiner: json.analysis?.oneLiner
					});
				} else if (status === "FAILED") {
					addSearchToHistory({
						videoUrl: json.videoMetadata?.url || '',
						jobId: jobId,
						status: 'failed'
					});
				}
				
				if (status === "COMPLETED" || status === "FAILED") {
					return; // stop polling
				}
				
				// Increase polling interval for running jobs to reduce server load
				if (status === "RUNNING") {
					pollInterval = Math.min(pollInterval * 1.1, 5000); // Max 5 seconds
				}
				
				updateProgressStep(status);
				timer = setTimeout(pollOnce, pollInterval);
			} catch (e: unknown) {
				if (cancelled) return;
				setError((e as Error)?.message || "Failed to load");
				setLoading(false);
			}
		}
		
		function updateProgressStep(status?: string) {
			if (status === "RUNNING") {
				// Estimate progress based on poll count and typical processing times
				if (pollCountRef.current < 3) {
					setCurrentStep("🔍 Fetching video captions...");
					setProgressPercent(15);
				} else if (pollCountRef.current < 6) {
					setCurrentStep("📥 Downloading video metadata...");
					setProgressPercent(25);
				} else if (pollCountRef.current < 9) {
					setCurrentStep("🎵 Extracting audio track...");
					setProgressPercent(35);
				} else if (pollCountRef.current < 12) {
					setCurrentStep("🎤 Transcribing audio with AI...");
					setProgressPercent(50);
				} else if (pollCountRef.current < 18) {
					setCurrentStep("📝 Processing transcript...");
					setProgressPercent(65);
				} else if (pollCountRef.current < 22) {
					setCurrentStep("🔍 Identifying key claims...");
					setProgressPercent(75);
				} else if (pollCountRef.current < 26) {
					setCurrentStep("🧠 Analyzing content and checking facts...");
					setProgressPercent(85);
				} else {
					setCurrentStep("✨ Finalizing analysis...");
					setProgressPercent(95);
				}
			} else {
				setCurrentStep("⏳ Initializing analysis...");
				setProgressPercent(10);
			}
		}
		
		// Store the polling function in the ref so it can be called from retry button
		pollOnceRef.current = pollOnce;
		
		pollOnce();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [jobId]);

	if (loading) return (
		<div className="min-h-screen bg-background">
			<TopNavigation />
			<div className="container mx-auto px-4 py-8">
				<div className="max-w-4xl mx-auto">
					{/* Header */}
					<div className="text-center mb-12">
						<div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
							<Loader2 className="w-8 h-8 text-primary animate-spin" />
						</div>
						<h1 className="text-4xl font-bold text-foreground mb-4">Analyzing Your Video</h1>
						<p className="text-xl text-muted-foreground mb-2">{currentStep}</p>
						<p className="text-sm text-muted-foreground">Job ID: {jobId}</p>
					</div>

					{/* Progress Card */}
					<div className="bg-card rounded-2xl shadow-xl border border-border p-8 mb-8">
						<div className="space-y-6">
							{/* Progress Bar */}
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-sm font-medium text-muted-foreground">Progress</span>
									<span className="text-sm font-bold text-primary">{progressPercent}%</span>
								</div>
								<div className="w-full bg-muted rounded-full h-3 overflow-hidden">
									<div 
										className="bg-gradient-to-r from-pink-500 to-red-500 h-full rounded-full transition-all duration-500 ease-out"
										style={{ width: `${progressPercent}%` }}
									></div>
								</div>
							</div>

							{/* Status Info */}
							<div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
								<div className="flex items-center space-x-3">
									<Clock className="w-5 h-5 text-primary" />
									<div>
										<p className="text-sm font-medium text-foreground">Processing in Background</p>
										<p className="text-xs text-muted-foreground">This usually takes 2-5 minutes. We&apos;re working hard to analyze your content.</p>
									</div>
								</div>
							</div>
						</div>
					</div>

					{/* Features Preview */}
					<div className="grid md:grid-cols-3 gap-6">
						<div className="bg-card rounded-xl p-6 shadow-lg border border-border text-center">
							<div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
								<Shield className="w-6 h-6 text-green-500" />
							</div>
							<h3 className="font-semibold text-foreground mb-2">Fact-Checking</h3>
							<p className="text-sm text-muted-foreground">Verifying claims against reliable sources</p>
						</div>
						<div className="bg-card rounded-xl p-6 shadow-lg border border-border text-center">
							<div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
								<Sparkles className="w-6 h-6 text-purple-500" />
							</div>
							<h3 className="font-semibold text-foreground mb-2">AI Analysis</h3>
							<p className="text-sm text-muted-foreground">Advanced content analysis and insights</p>
						</div>
						<div className="bg-card rounded-xl p-6 shadow-lg border border-border text-center">
							<div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
								<FileText className="w-6 h-6 text-orange-500" />
							</div>
							<h3 className="font-semibold text-foreground mb-2">Full Transcript</h3>
							<p className="text-sm text-muted-foreground">Complete video transcript with copy feature</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	);

	if (error) return (
		<div className="min-h-screen bg-background">
			<TopNavigation />
			<div className="container mx-auto px-4 py-8">
				<div className="max-w-2xl mx-auto">
					<div className="text-center mb-8">
						<div className="inline-flex items-center justify-center w-16 h-16 bg-destructive/10 rounded-full mb-6">
							<XCircle className="w-8 h-8 text-destructive" />
						</div>
						<h1 className="text-3xl font-bold text-foreground mb-4">Analysis Error</h1>
					</div>
					<div className="bg-card rounded-2xl shadow-xl border border-border p-8">
						<div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
							<div className="flex items-start space-x-3">
								<XCircle className="w-6 h-6 text-destructive mt-0.5" />
								<div>
									<h3 className="font-semibold text-destructive mb-2">Something went wrong</h3>
									<p className="text-destructive">{error}</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);

	if (!data) return null;

	const analysis = data?.analysis;
	const status = data?.status;
	
	const getStatusBadge = (status: string) => {
		switch (status) {
			case "COMPLETED":
				return (
					<span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
						<CheckCircle className="w-4 h-4 mr-2" />
						Completed
					</span>
				);
			case "FAILED":
				return (
					<span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">
						<XCircle className="w-4 h-4 mr-2" />
						Failed
					</span>
				);
			case "RUNNING":
				return (
					<span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
						<Clock className="w-4 h-4 mr-2" />
						Running
					</span>
				);
			default:
				return (
					<span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
						{status}
					</span>
				);
		}
	};

	const getTrustScoreColor = (score: number) => {
		if (score >= 80) return "text-green-600";
		if (score >= 60) return "text-yellow-600";
		return "text-red-600";
	};

	const getTrustScoreBg = (score: number) => {
		if (score >= 80) return "bg-green-500/10 border-green-500/20";
		if (score >= 60) return "bg-yellow-500/10 border-yellow-500/20";
		return "bg-red-500/10 border-red-500/20";
	};

	return (
		<div className="min-h-screen bg-background">
			<TopNavigation />
			<div className="container mx-auto px-4 py-8">
				<div className="max-w-6xl mx-auto">


					{/* Error State */}
					{status === "FAILED" && data?.errorMessage && (
						<div className="space-y-8">
							{/* Error Message */}
							<div className="bg-card rounded-2xl shadow-xl border border-border p-8">
								<div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
									<div className="flex items-start space-x-3">
										<XCircle className="w-6 h-6 text-destructive mt-0.5" />
										<div className="flex-1">
											<h3 className="font-semibold text-destructive mb-2">Analysis Failed</h3>
										{data.errorMessage.includes("403") ? (
											<div>
												<p className="text-destructive mb-2">YouTube blocked the download request. This can happen due to:</p>
												<ul className="list-disc pl-5 space-y-1 text-destructive/80">
													<li>Video is private or restricted</li>
													<li>Geographic restrictions</li>
													<li>Rate limiting from YouTube</li>
												</ul>
												<p className="mt-2 text-destructive">Try again in a few minutes or use a different video.</p>
											</div>
										) : data.errorMessage.includes("timeout") ? (
											<div>
												<p className="text-destructive mb-2">The analysis took too long to complete. This might be due to:</p>
												<ul className="list-disc pl-5 space-y-1 text-destructive/80">
													<li>Very long video content</li>
													<li>High server load</li>
													<li>Network issues</li>
												</ul>
												<p className="mt-2 text-destructive">Try again with a shorter video or try again later.</p>
											</div>
										) : data.errorMessage.includes("quota exceeded") || data.errorMessage.includes("insufficient_quota") ? (
											<div>
												<p className="text-destructive mb-2">OpenAI API quota exceeded. This means:</p>
												<ul className="list-disc pl-5 space-y-1 text-destructive/80">
													<li>The service has reached its monthly API usage limit</li>
													<li>Billing details may need to be updated</li>
													<li>Usage limits may need to be increased</li>
												</ul>
												<p className="mt-2 text-destructive">Please try again later or contact the service administrator.</p>
											</div>
										) : data.errorMessage.includes("rate limit") ? (
											<div>
												<p className="text-destructive mb-2">API rate limit exceeded. This means:</p>
												<ul className="list-disc pl-5 space-y-1 text-destructive/80">
													<li>Too many requests were made in a short time</li>
													<li>The service is temporarily throttling requests</li>
												</ul>
												<p className="mt-2 text-destructive">Please wait a few minutes and try again.</p>
											</div>
										) : data.errorMessage.includes("Video too long for analysis") ? (
											<div>
												<p className="text-destructive mb-2">This video is too long for analysis. Our service currently supports videos up to 120 minutes.</p>
												<ul className="list-disc pl-5 space-y-1 text-destructive/80">
													<li>Try with a shorter video (under 2 hours)</li>
													<li>Consider using a video excerpt or summary</li>
													<li>Long-form content may be processed in the future</li>
												</ul>
												<p className="mt-2 text-destructive">Please try with a shorter video.</p>
											</div>
										) : (
											<div>
												<p className="text-destructive mb-2">An unexpected error occurred: {data.errorMessage}</p>
												<p className="text-destructive">Please try again or contact support if the issue persists.</p>
											</div>
										)}
										
										{/* Retry Button */}
										<div className="mt-4">
											<button
												onClick={async () => {
													if (data?.videoMetadata?.url) {
														setIsRetrying(true);
														setLoading(true);
														setError(null);
														setCurrentStep("Retrying analysis...");
														setProgressPercent(0);
														pollCountRef.current = 0;
														
														try {
															// Create a new analysis for the same video
															const res = await fetch("/api/analyze", {
																method: "POST",
																headers: { "Content-Type": "application/json" },
																body: JSON.stringify({ url: data.videoMetadata.url }),
															});
															
															if (res.ok) {
																let responseData;
																try {
																	responseData = await res.json();
																} catch (parseError) {
																	console.error('Failed to parse retry response:', parseError);
																	const text = await res.text();
																	console.error('Retry response text:', text);
																	throw new Error(`Server returned invalid response: ${text.substring(0, 100)}...`);
																}
																const { jobId: newJobId } = responseData;
																
																// If it's the same job ID, restart polling for the same job
																if (newJobId === jobId) {
																	// Reset state and start polling again
																	setData(null);
																	setIsRetrying(false);
																	// Manually restart polling by calling the stored function
																	if (pollOnceRef.current) {
																		pollOnceRef.current();
																	}
																} else {
																	// Navigate to the new job
																	router.push(`/results/${newJobId}`);
																}
															} else {
																// If API call fails, show error
																setError("Failed to retry analysis. Please try again later.");
																setIsRetrying(false);
																setLoading(false);
															}
														} catch (error) {
															console.error('Retry failed:', error);
															setError("Failed to retry analysis. Please try again later.");
															setIsRetrying(false);
															setLoading(false);
														}
													} else {
														// No video URL available, go to home page
														router.push('/');
													}
												}}
												disabled={isRetrying}
												className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-lg hover:from-pink-600 hover:to-red-600 transition-colors gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
											>
												{isRetrying ? (
													<>
														<Loader2 className="w-4 h-4 animate-spin" />
														Retrying...
													</>
												) : (
													<>
														<ArrowRight className="w-4 h-4" />
														Try Again
													</>
												)}
											</button>
										</div>
									</div>
								</div>
							</div>
							</div>
							
							{/* Video Information - Show even for failed analyses */}
							{data.videoMetadata && (
								<div className="bg-card rounded-2xl shadow-xl border border-border p-8">
									<div className="mb-8">
										<h1 className="text-3xl font-bold text-foreground mb-2">Video Information</h1>
										<p className="text-muted-foreground">Job ID: {jobId}</p>
									</div>

									<div className="grid lg:grid-cols-2 gap-8">
										{/* Video Metadata */}
										<div className="space-y-6">
											{/* Status Indicator */}
											<div className="flex items-center space-x-3">
												<div className="flex items-center justify-center w-12 h-12 bg-gradient-to-r from-red-500 to-red-600 rounded-full">
													<XCircle className="w-6 h-6 text-white" />
												</div>
												<div>
													<div className="flex items-center space-x-2">
														{getStatusBadge(status)}
													</div>
													<p className="text-sm text-muted-foreground mt-1">
														Analysis failed - transcript available below
													</p>
												</div>
											</div>

											{/* Video Information */}
											<div className="space-y-4">
												{data.videoMetadata.title && (
													<h2 className="text-2xl font-bold text-foreground leading-tight">
														{data.videoMetadata.title}
													</h2>
												)}
												{data.videoMetadata.channel && (
													<p className="text-muted-foreground">
														by <span className="font-medium text-foreground">{data.videoMetadata.channel}</span>
													</p>
												)}
											</div>

											{/* Action Button */}
											<a 
												href={data.videoMetadata.url}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-lg hover:from-pink-600 hover:to-red-600 transition-colors gap-2"
											>
												<ExternalLink className="w-4 h-4" />
												Watch on YouTube
											</a>
										</div>

										{/* Embedded Video Player */}
										<div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
											<iframe
												src={`https://www.youtube.com/embed/${extractVideoId(data.videoMetadata.url)}`}
												title={data.videoMetadata.title || "YouTube Video"}
												className="absolute top-0 left-0 w-full h-full rounded-xl border border-border"
												allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
												allowFullScreen
											/>
										</div>
									</div>
								</div>
							)}

						</div>
					)}

					{/* Progress Details - Show when running */}
					{status === "RUNNING" && (
						<div className="bg-card rounded-2xl shadow-xl border border-border p-6 mb-8">
							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center space-x-3">
										<Loader2 className="w-5 h-5 text-primary animate-spin" />
										<span className="font-medium text-foreground">{currentStep}</span>
									</div>
									<div className="flex items-center space-x-2 text-sm text-muted-foreground">
										<Clock className="w-4 h-4" />
										<span>{formatElapsedTime(data.elapsedTime)}</span>
									</div>
								</div>
								<div className="space-y-2">
									<div className="flex justify-between items-center">
										<span className="text-sm text-muted-foreground">Progress</span>
										<span className="text-sm font-bold text-primary">{progressPercent}%</span>
									</div>
									<div className="w-full bg-muted rounded-full h-2 overflow-hidden">
										<div 
											className="bg-gradient-to-r from-pink-500 to-red-500 h-full rounded-full transition-all duration-500 ease-out"
											style={{ width: `${progressPercent}%` }}
										></div>
									</div>
								</div>
							</div>
						</div>
					)}


					{/* Video Information Section */}
					{data.videoMetadata && (
						<div className="bg-card rounded-2xl shadow-xl border border-border p-8 mb-8">
							{/* Header Section */}
							<div className="mb-8">
								<h1 className="text-3xl font-bold text-foreground mb-2">Video Analysis</h1>
								<p className="text-muted-foreground">Job ID: {jobId}</p>
							</div>

							{/* Video Information Header */}
							<div className="mb-8">
								{/* Video Title and Channel */}
								<div className="mb-6">
									{data.videoMetadata.title && (
										<h2 className="text-3xl font-bold text-foreground leading-tight mb-3">
											{data.videoMetadata.title}
										</h2>
									)}
									{data.videoMetadata.channel && (
										<p className="text-lg text-muted-foreground mb-4">
											by <span className="font-medium text-foreground">{data.videoMetadata.channel}</span>
										</p>
									)}
								</div>

								{/* Status and Metadata Row */}
								<div className="flex flex-wrap items-center gap-4 mb-6">
									{/* Status Indicator */}
									<div className="flex items-center space-x-3">
										<div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-pink-500 to-red-500 rounded-full">
											{status === "COMPLETED" ? (
												<Sparkles className="w-5 h-5 text-white" />
											) : status === "FAILED" ? (
												<XCircle className="w-5 h-5 text-white" />
											) : (
												<Loader2 className="w-5 h-5 text-white animate-spin" />
											)}
										</div>
										<div>
											<div className="flex items-center space-x-2">
												{getStatusBadge(status)}
												{status === "COMPLETED" && (
													<span className="text-sm text-muted-foreground">
														• Processed in {formatElapsedTime(data.elapsedTime)}
													</span>
												)}
											</div>
											<p className="text-sm text-muted-foreground">
												{status === "COMPLETED" ? "Analysis complete" : 
												 status === "FAILED" ? "Analysis failed" :
												 status === "RUNNING" ? "Analyzing content..." : "Initializing..."}
											</p>
										</div>
									</div>

									{/* Language Badge */}
									{analysis?.language && (
										<span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
											🌐 {analysis.language}
										</span>
									)}

									{/* Action Button */}
									<a 
										href={data.videoMetadata.url}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-lg hover:from-pink-600 hover:to-red-600 transition-colors gap-2"
									>
										<ExternalLink className="w-4 h-4" />
										Watch on YouTube
									</a>
								</div>
							</div>

							{/* Video Transcript Preview */}
							{data.transcript && (
								<div className="mb-8">
									<div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 border border-primary/20">
										<div className="flex items-start justify-between mb-4">
											<h3 className="text-lg font-semibold text-foreground">Video Transcript</h3>
											<button 
												onClick={() => copyToClipboard(data.transcript!)}
												className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-lg hover:from-pink-600 hover:to-red-600 transition-colors gap-2 text-sm"
											>
												{copySuccess ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
												{copySuccess ? "Copied!" : "Copy"}
											</button>
										</div>
										<div className="bg-muted/50 rounded-lg border border-border p-4 max-h-[200px] overflow-y-auto">
											<div className="space-y-2">
												{formatTranscript(data.transcript).slice(0, 3).map((paragraph, index) => (
													<p 
														key={index} 
														className="text-xs leading-relaxed text-muted-foreground first-letter:capitalize"
													>
														{paragraph}
													</p>
												))}
												{formatTranscript(data.transcript).length > 3 && (
													<p className="text-xs text-muted-foreground italic">
														... and {formatTranscript(data.transcript).length - 3} more paragraphs
													</p>
												)}
											</div>
										</div>
									</div>
								</div>
							)}

							{/* Running Analysis Preview */}
							{status === "RUNNING" && (
								<div className="mb-8">
									<div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6">
										<div className="flex items-center space-x-3 mb-3">
											<Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
											<h3 className="text-lg font-semibold text-foreground">Analysis in Progress</h3>
										</div>
										<p className="text-muted-foreground">
											We&apos;re analyzing this video with AI to provide you with a comprehensive summary, 
											trust score, and fact-checked claims. This usually takes 2-5 minutes.
										</p>
									</div>
								</div>
							)}

							{/* Embedded Video Player */}
							<div className="relative w-full mb-8" style={{ paddingBottom: '56.25%' }}>
								<iframe
									src={`https://www.youtube.com/embed/${extractVideoId(data.videoMetadata.url)}`}
									title={data.videoMetadata.title || "YouTube Video"}
									className="absolute top-0 left-0 w-full h-full rounded-xl border border-border"
									allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
									allowFullScreen
								/>
							</div>

							{/* Scroll indicator for completed analysis */}
							{status === "COMPLETED" && analysis && (
								<div className="text-center mb-8">
									<div className="inline-flex items-center space-x-2 text-sm text-muted-foreground">
										<span>Scroll down for detailed analysis</span>
										<svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
										</svg>
									</div>
								</div>
							)}
						</div>
					)}


					{/* Analysis Section - Show only when completed */}
					{status === "COMPLETED" && analysis && (
						<div className="space-y-8">
							{/* Visual separator */}
							<div className="border-t border-border/50 pt-8">
								<div className="text-center mb-8">
									<h2 className="text-2xl font-semibold text-foreground mb-2">Detailed Analysis</h2>
									<p className="text-muted-foreground">Complete breakdown of the video content and fact-checking results</p>
								</div>
							</div>
							{/* Summary Section */}
							<div className="bg-card rounded-2xl shadow-xl border border-border p-8">
								<div className="flex items-center justify-between mb-6">
									<h2 className="text-3xl font-bold text-foreground">Complete Analysis</h2>
									{analysis.language && analysis.language !== 'English' && (
										<div className="flex items-center gap-3">
											<span className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-muted-foreground">
												🌐 Content analyzed in {analysis.language}
											</span>
											<button
												onClick={retryLanguageDetection}
												disabled={isRetryingLanguage}
												className="inline-flex items-center px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 rounded-md transition-colors gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
												title="Redetect language and redo analysis"
											>
												{isRetryingLanguage ? (
													<>
														<Loader2 className="w-3 h-3 animate-spin" />
														Retrying...
													</>
												) : (
													<>
														<ArrowRight className="w-3 h-3" />
														Retry
													</>
												)}
											</button>
										</div>
									)}
								</div>
								
								{/* One-liner */}
								<div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 mb-8 border border-primary/20">
									<p className="text-xl font-medium leading-relaxed text-foreground">{analysis.oneLiner}</p>
								</div>
								
								{/* Trust Score and Key Points */}
								<div className="grid md:grid-cols-2 gap-8">
									{/* Trust Score */}
									<div className={`${getTrustScoreBg(analysis.trustScore)} rounded-xl p-6 border`}>
										<div className="text-center">
											<h3 className="text-lg font-semibold text-foreground mb-4">Trust Score</h3>
											<div className={`text-5xl font-bold ${getTrustScoreColor(analysis.trustScore)} mb-4`}>
												{analysis.trustScore}/100
											</div>
											<div className="w-full bg-muted rounded-full h-3 overflow-hidden">
												<div 
													className={`h-full rounded-full transition-all duration-500 ${
														analysis.trustScore >= 80 ? 'bg-green-500' : 
														analysis.trustScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
													}`}
													style={{ width: `${analysis.trustScore}%` }}
												></div>
											</div>
										</div>
									</div>

									{/* Key Points */}
									<div className="bg-muted/50 rounded-xl p-6 border border-border">
										<h3 className="text-lg font-semibold text-foreground mb-4">Key Points</h3>
										<ul className="space-y-3">
											{(analysis.bulletPoints || []).map((point: string, i: number) => (
												<li key={i} className="flex items-start space-x-3">
													<div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
													<span className="text-sm text-muted-foreground leading-relaxed">{point}</span>
												</li>
											))}
										</ul>
									</div>
								</div>
							</div>

							{/* Claims Section */}
							{analysis.claims && analysis.claims.length > 0 && (
								<div className="bg-card rounded-2xl shadow-xl border border-border p-8">
									<h2 className="text-3xl font-bold text-foreground mb-6">Fact-Checked Claims</h2>
									<div className="space-y-6">
										{analysis.claims.map((claim) => (
											<div key={claim.id} className="border-l-4 border-l-primary bg-muted/50 rounded-xl p-6">
												<div className="space-y-4">
													<div className="flex items-start justify-between">
														<p className="font-medium text-lg leading-relaxed text-foreground flex-1">{claim.text}</p>
														<span className="ml-4 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20">
															{claim.confidence}% confidence
														</span>
													</div>
													
													{claim.spotChecks && claim.spotChecks.length > 0 && (
														<div className="space-y-3">
															<h4 className="font-medium text-sm text-muted-foreground">Source Verifications:</h4>
															<div className="space-y-2">
																{claim.spotChecks.map((check, i) => (
																	<div key={i} className="flex items-center space-x-3 p-3 bg-card rounded-lg border border-border">
																		<ExternalLink className="w-4 h-4 text-primary flex-shrink-0" />
																		<a 
																			href={check.url} 
																			target="_blank" 
																			rel="noreferrer"
																			className="text-sm text-primary hover:underline flex-1 truncate"
																		>
																			{check.url}
																		</a>
																		<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
																			{check.verdict}
																		</span>
																	</div>
																))}
															</div>
														</div>
													)}
												</div>
											</div>
										))}
									</div>
								</div>
							)}
						</div>
					)}

					{/* No Analysis State */}
					{status !== "COMPLETED" && status !== "FAILED" && status !== "RUNNING" && (
						<div className="bg-card rounded-2xl shadow-xl border border-border p-8 text-center">
							<AlertTriangle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
							<h3 className="text-xl font-semibold text-foreground mb-2">No Analysis Available</h3>
							<p className="text-muted-foreground">Please refresh the page to check for updates.</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
