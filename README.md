ShouldIWatchThis – AI YouTube Summary & Trust Review Tool

## Getting Started

Running locally

1. Node 20+ recommended (shadcn CLI requires it). Node 18 works for app runtime.
2. Create `.env` or `.env.local` with:
   - OPENAI_API_KEY=...
   - DATABASE_URL="file:./dev.db"
   - QUEUE_BACKEND=memory (or supabase)
   - SUPABASE_WORKER_URL=
   - SUPABASE_WORKER_SECRET=
   - SITE_URL=http://localhost:3000
3. Install deps: `npm i`
4. Prisma: `npx prisma generate && npx prisma db push`
5. Dev: `npm run dev`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

API
- POST `/api/analyze` { url } → { jobId }
- GET `/api/result/:jobId` → analysis JSON
- GET `/api/healthz`

Data layer
- Prisma + SQLite. See `prisma/schema.prisma`.

Transcripts
- `src/transcripts/captions.ts` uses youtube-transcript for official/auto captions
- `src/transcripts/whisper.ts` falls back to OpenAI Whisper using `ytdl-core` to download audio to a temp file, sends to OpenAI, then deletes

Analysis pipeline
- `src/analyze/` creates summaries (one-liner, bullets, outline), computes trust signals and score, extracts claims with 2–3 spot-check URLs.

Background jobs
- In-memory queue by default. For longer jobs, you can configure a Supabase Edge Function worker via `QUEUE_BACKEND=supabase` with `SUPABASE_WORKER_URL`.

To learn more about Next.js, take a look at the following resources:

SEO
- Title and meta configured in `src/app/layout.tsx`
- `/robots.txt` and `/sitemap.xml` implemented as routes
- Add JSON-LD WebApplication in `layout.tsx` if desired

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

Deploy to Vercel

1. Push to GitHub
2. Import to Vercel, set env vars
3. `vercel.json` sets extended function duration

Limits
- Whisper uploads can be large and slow; captions are preferred when available
- OpenAI usage billed to your account

## Troubleshooting

### Stuck Jobs

If you encounter jobs that get stuck in "RUNNING" status (especially after 10+ minutes), this usually indicates:

1. **Video Unavailable (410 Error)**: The YouTube video has been removed, made private, or is no longer accessible
2. **Timeout Issues**: The job exceeded Vercel's 300-second serverless function limit
3. **Metadata Extraction Failures**: Unable to extract video information

#### Manual Job Cleanup

Use the health check endpoint to identify and fix stuck jobs:

```bash
# Check for stuck jobs
curl -X GET https://your-domain.com/api/jobs/health

# Manually mark specific jobs as failed
curl -X POST https://your-domain.com/api/jobs/health \
  -H "Content-Type: application/json" \
  -d '{"action": "mark_failed", "jobIds": ["jobId1", "jobId2"]}'
```

#### Local Cleanup Script

For local development, use the provided script:

```bash
# Fix a specific stuck job
node scripts/fix-stuck-job.js BfUEDvrD1Y4
```

#### Prevention

The system now includes:
- **Automatic Error Detection**: 410 errors are properly caught and jobs fail immediately
- **Metadata Validation**: Jobs fail if no video metadata can be extracted
- **Timeout Handling**: 4.5-minute timeout with proper cleanup
- **Health Monitoring**: Regular cleanup of stuck jobs via health check endpoint

### Common Error Messages

- `"Video is no longer available (410 Gone)"` - Video was removed or made private
- `"Failed to extract video metadata"` - Video is unavailable or has restricted access
- `"Job timed out after 4.5 minutes"` - Processing exceeded Vercel's time limit
- `"Video too long for analysis"` - Video exceeds 120-minute duration limit
