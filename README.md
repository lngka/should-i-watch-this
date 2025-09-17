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
