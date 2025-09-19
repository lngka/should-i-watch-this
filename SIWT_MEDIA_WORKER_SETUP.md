# SIWT Media Worker Integration

This application now supports using the SIWT Media Worker for transcription instead of local transcription methods.

## Environment Variable Setup

Add the following environment variable to your `.env.local` file:

```bash
SIWT_MEDIA_WORKER_URL=https://your-siwt-media-worker-url.com
```

## How It Works

1. **Primary Method**: The application will first attempt to use the SIWT Media Worker for transcription
2. **Fallback**: If the SIWT Media Worker is unavailable or fails, the application falls back to the existing local transcription methods:
   - YouTube captions extraction
   - Alternative transcription services
   - Vercel-optimized Whisper transcription

## SIWT Media Worker API

The SIWT Media Worker should expose a `POST /transcribe` endpoint that accepts:

**Request:**
```json
{
  "videoId": "dQw4w9WgXcQ"
}
```

**Response:**
```json
{
  "source": "captions",
  "language": "en",
  "transcript": "Never gonna give you up, never gonna let you down...",
  "title": "Rick Astley - Never Gonna Give You Up (Official Video)",
  "channel": "Rick Astley",
  "durationSec": 212,
  "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
  "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

## Benefits

- **Performance**: Offloads transcription to a dedicated service
- **Reliability**: Maintains fallback to local methods if the service is unavailable
- **Metadata**: Uses enhanced metadata from SIWT Media Worker when available
- **Scalability**: Reduces load on the main application server

## Deployment

Make sure to set the `SIWT_MEDIA_WORKER_URL` environment variable in your deployment environment (Vercel, etc.).
