# YouTube Download Fixes - Node.js Only

This document explains the YouTube download fixes implemented using only Node.js and ytdl-core, without external dependencies.

## Issues Fixed

### 1. 403 Status Code Errors
- **Problem**: YouTube blocking requests due to outdated User-Agent
- **Solution**: Updated to Chrome 131 User-Agent with modern browser headers

### 2. "No playable formats found" Error
- **Problem**: YouTube changed their format structure
- **Solution**: Multiple download strategies with different quality options

### 3. "extractTceFunc" Parsing Errors
- **Problem**: YouTube's internal format changes breaking ytdl-core
- **Solution**: Alternative headers and retry logic for format parsing issues

### 4. Download Timeouts
- **Problem**: Downloads hanging indefinitely
- **Solution**: 30-second timeout per attempt with proper cleanup

## Implemented Solutions

### Enhanced Headers
```typescript
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
  "DNT": "1",
  "Sec-GPC": "1",
};
```

### Multiple Download Strategies
1. **Primary**: Standard ytdl-core with various quality options
2. **Fallback**: Alternative headers (Googlebot User-Agent) for format issues
3. **Retry Logic**: Exponential backoff between attempts
4. **Timeout Protection**: 30-second timeout per download attempt

### Error-Specific Handling
- Detects "extractTceFunc" errors and retries with different headers
- Handles "No playable formats found" with alternative quality options
- Manages 403 errors with User-Agent rotation
- Implements proper cleanup for failed downloads

### Quality Options
```typescript
const qualityOptions = [
  { filter: "audioonly", quality: "lowestaudio" },
  { filter: "audioonly", quality: "highestaudio" },
  { filter: "audioonly" },
  { quality: "lowestaudio" },
  { quality: "highestaudio" },
  {}, // No filters
];

const fallbackOptions = [
  { filter: "audioonly", quality: "lowestaudio", highWaterMark: 1 << 25 },
  { filter: "audioonly", quality: "highestaudio", highWaterMark: 1 << 25 },
  { quality: "lowestaudio", highWaterMark: 1 << 25 },
  { quality: "highestaudio", highWaterMark: 1 << 25 },
  { highWaterMark: 1 << 25 },
];
```

## How It Works

1. **Initial Attempt**: Try with standard headers and quality options
2. **Error Detection**: Check for specific error patterns
3. **Alternative Headers**: If format parsing fails, retry with Googlebot User-Agent
4. **Multiple Qualities**: Try different audio quality settings
5. **Timeout Protection**: Prevent hanging downloads
6. **Cleanup**: Remove failed downloads and temp files

## Environment Variables

```bash
# Optional: Custom User-Agent
YOUTUBE_USER_AGENT="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# Optional: YouTube cookies (new format)
YOUTUBE_COOKIE="VISITOR_PRIVACY_METADATA=...; PREF=...; SID=..."
```

## Benefits

- ✅ **No External Dependencies**: Pure Node.js solution
- ✅ **Better Error Handling**: Specific fixes for common issues
- ✅ **Timeout Protection**: Prevents hanging downloads
- ✅ **Multiple Strategies**: Various fallback approaches
- ✅ **Proper Cleanup**: Removes temporary files
- ✅ **Enhanced Logging**: Better debugging information

## Testing

The fixes address the specific errors seen in your logs:
- ✅ "Status code: 403" → Updated headers and User-Agent
- ✅ "No playable formats found" → Multiple quality options
- ✅ "extractTceFunc" errors → Alternative headers
- ✅ "File too large" → Size monitoring and limits
- ✅ Download timeouts → 30-second timeout protection

The application should now handle YouTube downloads much more reliably without requiring any external tools or dependencies.
