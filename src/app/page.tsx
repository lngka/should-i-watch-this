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
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
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
                Turn YouTube Videos into{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-red-500">
                  Transcripts Instantly
                </span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Easily convert a youtube video to transcript, copy and download the generated youtube transcript in one click. 
                Get started for free with AI-powered analysis and trust scoring.
              </p>
              <p className="text-sm text-muted-foreground">
                Note: Videos must be 35 minutes or shorter for processing.
              </p>
            </div>

            {/* Input Section */}
            <div className="space-y-4">
              <div className="flex gap-3">
                <input
                  className="flex-1 bg-white text-gray-900 rounded-xl px-6 py-4 text-lg border-0 focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  placeholder="Paste your Youtube video link here"
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
                      <span>Extract transcript</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4">
                  <p className="text-destructive text-sm">{error}</p>
                </div>
              )}
            </div>

          </div>
        </main>

      </div>
    </div>
  );
}
