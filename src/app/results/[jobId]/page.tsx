"use client";
import { AlertTriangle, CheckCircle, Clock, Copy, ExternalLink, FileText, Loader2, Shield, Sparkles, XCircle } from "lucide-react";
import { use, useEffect, useRef, useState } from "react";

type JobResponse = {
	status: string;
	createdAt: string;
	elapsedTime: number;
	transcript?: string;
	analysis?: {
		oneLiner: string;
		bulletPoints: string[];
		trustScore: number;
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

export default function ResultPage({ params }: { params: Promise<{ jobId: string }> }) {
	const { jobId } = use(params);
	const [data, setData] = useState<JobResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentStep, setCurrentStep] = useState<string>("Starting analysis...");
	const [progressPercent, setProgressPercent] = useState(0);
	const [copySuccess, setCopySuccess] = useState(false);
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
				
				const json = await res.json();
				setData(json);
				setLoading(false);
				const status = json?.status;
				
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
				if (pollCountRef.current < 5) {
					setCurrentStep("🔍 Fetching video captions...");
					setProgressPercent(20);
				} else if (pollCountRef.current < 15) {
					setCurrentStep("🎤 Transcribing audio with AI...");
					setProgressPercent(60);
				} else {
					setCurrentStep("🧠 Analyzing content and checking facts...");
					setProgressPercent(85);
				}
			} else {
				setCurrentStep("⏳ Initializing analysis...");
				setProgressPercent(10);
			}
		}
		
		pollOnce();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [jobId]);

	if (loading) return (
		<div className="min-h-screen bg-background">
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
			<div className="container mx-auto px-4 py-8">
				<div className="max-w-6xl mx-auto">
					{/* Header */}
					<div className="text-center mb-12">
						<div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-pink-500 to-red-500 rounded-full mb-6">
							<Sparkles className="w-10 h-10 text-white" />
						</div>
						<h1 className="text-5xl font-bold text-foreground mb-4">Analysis Complete</h1>
						<div className="flex items-center justify-center space-x-4 mb-4">
							{getStatusBadge(status)}
							<span className="text-muted-foreground">•</span>
							<span className="text-sm text-muted-foreground">Processed in {formatElapsedTime(data.elapsedTime)}</span>
						</div>
						<p className="text-lg text-muted-foreground">Job ID: {jobId}</p>
					</div>

					{/* Error State */}
					{status === "FAILED" && data?.errorMessage && (
						<div className="bg-card rounded-2xl shadow-xl border border-border p-8 mb-8">
							<div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6">
								<div className="flex items-start space-x-3">
									<XCircle className="w-6 h-6 text-destructive mt-0.5" />
									<div>
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
										) : (
											<div>
												<p className="text-destructive mb-2">An unexpected error occurred: {data.errorMessage}</p>
												<p className="text-destructive">Please try again or contact support if the issue persists.</p>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Running State */}
					{status === "RUNNING" && (
						<div className="bg-card rounded-2xl shadow-xl border border-border p-8 mb-8">
							<div className="space-y-6">
								<div className="flex items-center space-x-3">
									<Loader2 className="w-6 h-6 text-primary animate-spin" />
									<span className="text-lg font-medium text-foreground">{currentStep}</span>
								</div>
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
								<div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
									<div className="flex items-center space-x-3">
										<Clock className="w-5 h-5 text-primary" />
										<p className="text-sm text-foreground">Almost done! Finalizing your analysis...</p>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* Completed State */}
					{status === "COMPLETED" && analysis && (
						<div className="space-y-8">
							{/* Summary Section */}
							<div className="bg-card rounded-2xl shadow-xl border border-border p-8">
								<h2 className="text-3xl font-bold text-foreground mb-6">Analysis Summary</h2>
								
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

							{/* Transcript Section */}
							<div className="bg-card rounded-2xl shadow-xl border border-border p-8">
								<div className="flex items-center justify-between mb-6">
									<h2 className="text-3xl font-bold text-foreground">Full Transcript</h2>
									{data.transcript && (
										<button 
											onClick={() => copyToClipboard(data.transcript!)}
											className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-lg hover:from-pink-600 hover:to-red-600 transition-colors gap-2"
										>
											{copySuccess ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
											{copySuccess ? "Copied!" : "Copy"}
										</button>
									)}
								</div>
								
								{data.transcript ? (
									<div className="bg-muted/50 rounded-xl border border-border p-6 max-h-96 overflow-y-auto">
										<div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
											{data.transcript}
										</div>
									</div>
								) : (
									<div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6">
										<div className="flex items-center space-x-3">
											<AlertTriangle className="w-5 h-5 text-yellow-500" />
											<p className="text-yellow-500">No transcript available for this video.</p>
										</div>
									</div>
								)}
							</div>
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

