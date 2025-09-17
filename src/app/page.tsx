"use client";
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
      if (!res.ok) throw new Error("Failed to enqueue analysis");
      const { jobId } = await res.json();
      startTransition(() => router.push(`/results/${jobId}`));
    } catch (e: any) {
      setError(e?.message || "Something went wrong");
    }
  }

  return (
    <div className="max-w-xl mx-auto p-8 space-y-4">
      <h1 className="text-2xl font-semibold">ShouldIWatchThis</h1>
      <p className="text-sm text-muted-foreground">AI YouTube Summary & Trust Review Tool</p>
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          placeholder="Paste YouTube URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          className="border rounded px-4 py-2"
          onClick={submit}
          disabled={isPending || !url}
        >
          {isPending ? "Analyzing..." : "Analyze"}
        </button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
