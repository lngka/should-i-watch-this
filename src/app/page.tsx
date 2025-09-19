"use client";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    
    try {
      // Proceed directly with analysis
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to enqueue analysis");
      }
      
      const { jobId } = await res.json();
      startTransition(() => router.push(`/results/${jobId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div className="min-h-screen bg-background">

      {/* Main Content */}
      <div className="min-h-screen">

        {/* Main Content Area */}
        <main className="max-w-4xl mx-auto px-6 py-12">
          <div className="text-center space-y-8">

            {/* Headline */}
            <div className="space-y-4">
              <h1 className="text-5xl lg:text-6xl font-bold leading-tight">
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-red-500">
                  Should I Watch This YouTube Video?
                </span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Paste a YouTube link to get an instant summary, relevance score, key points, and red-flag checks. Transcripts included.
              </p>
            </div>

            {/* Input Section */}
            <div className="space-y-4">
              <div className="flex gap-3">
                <input
                  className="flex-1 bg-white text-gray-900 rounded-xl px-6 py-4 text-lg border-0 focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  placeholder="Paste a YouTube link…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
                <button
                  className="bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-xl px-8 py-4 text-lg font-semibold hover:from-pink-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  onClick={submit}
                  disabled={isPending || !url}
                >
                  {isPending ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <span>Analyze video</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>

              {/* Trust Note */}
              <div className="flex justify-center">
                <p className="text-xs text-muted-foreground">
                  No login needed • Free tier available
                </p>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}

              {/* Performance Note */}
              <div className="bg-slate-100/80 border border-slate-300/60 rounded-lg p-3">
                <div className="flex items-center space-x-2">
                  <div className="flex-shrink-0">
                    <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Performance tip:</span> Videos under 15 minutes process faster. 
                    Extended content may require additional processing time based on YouTube's content protection measures.
                  </p>
                </div>
              </div>
            </div>


          </div>
        </main>

      </div>
    </div>
  );
}
