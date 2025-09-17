"use client";
import { use, useEffect, useState } from "react";

type JobResponse = any;

export default function ResultPage({ params }: { params: Promise<{ jobId: string }> }) {
	const { jobId } = use(params);
	const [data, setData] = useState<JobResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		let timer: any;
		async function pollOnce() {
			try {
				const res = await fetch(`/api/result/${jobId}`, { cache: "no-store" });
				if (cancelled) return;
				if (res.status === 404) {
					// Not yet created; keep polling
					timer = setTimeout(pollOnce, 1500);
					return;
				}
				const json = await res.json();
				setData(json);
				setLoading(false);
				const status = json?.status;
				if (status === "COMPLETED" || status === "FAILED") {
					return; // stop polling
				}
				// keep polling while RUNNING/PENDING
				timer = setTimeout(pollOnce, 1500);
			} catch (e: any) {
				if (cancelled) return;
				setError(e?.message || "Failed to load");
				setLoading(false);
			}
		}
		pollOnce();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [jobId]);

	if (loading) return <div className="max-w-3xl mx-auto p-8">Analyzing…</div>;
	if (error) return <div className="max-w-3xl mx-auto p-8 text-red-600">{error}</div>;
	if (!data) return null;

	const analysis = data?.analysis;
	const status = data?.status;
	
	return (
		<div className="max-w-3xl mx-auto p-8 space-y-6">
			<h1 className="text-2xl font-semibold">Result</h1>
			<div className="text-sm text-gray-600">Status: {status}</div>
			{status === "FAILED" && data?.errorMessage && (
				<div className="text-red-600">Error: {data.errorMessage}</div>
			)}
			{status === "RUNNING" && (
				<div>Analysis in progress... This may take a few minutes.</div>
			)}
			{status === "COMPLETED" && analysis ? (
				<div className="space-y-4">
					<p className="text-lg">{analysis.oneLiner}</p>
					<div>
						<h2 className="font-medium">Bullets</h2>
						<ul className="list-disc pl-5">
							{(analysis.bulletPoints || []).map((b: string, i: number) => (
								<li key={i}>{b}</li>
							))}
						</ul>
					</div>
					<div>
						<h2 className="font-medium">Trust score</h2>
						<div>{analysis.trustScore}/100</div>
					</div>
					<div>
						<h2 className="font-medium">Claims</h2>
						{(analysis.claims || []).map((c: any) => (
							<div key={c.id} className="border rounded p-3 mb-2">
								<div className="font-medium">{c.text}</div>
								<div className="text-sm">Confidence: {c.confidence}</div>
								<ul className="list-disc pl-5 text-sm mt-2">
									{(c.spotChecks || []).map((s: any, i: number) => (
										<li key={i}><a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a> – {s.verdict}</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
			) : (
				<div>No analysis yet. Refresh soon.</div>
			)}
		</div>
	);
}

