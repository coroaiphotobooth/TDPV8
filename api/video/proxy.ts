
import { Readable } from 'stream';

export const config = {
  maxDuration: 60, // Allow longer streaming if needed
  api: {
    responseLimit: false, // Critical for video piping
  },
};

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range'); // Allow Range header

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawUrl = String(req.query.url || "");

    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url param' });
    }

    // 1. Decode & Validate URL (Security)
    const targetUrl = decodeURIComponent(rawUrl);

    // Protocol check
    if (!/^https?:\/\//i.test(targetUrl)) {
         return res.status(400).json({ error: 'Invalid protocol' });
    }

    // Basic SSRF Protection (Block localhost/private IPs)
    if (targetUrl.match(/:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/)) {
         return res.status(403).json({ error: 'Forbidden target' });
    }
    
    // Log for debugging (be careful with PII)
    // console.log(`[Video Proxy] Streaming: ${targetUrl}`);

    // 2. Fetch with Headers forwarding (Support Range requests for seeking/looping)
    const headers: HeadersInit = {};
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    let videoResponse = await fetch(targetUrl, {
      headers: headers
    });

    // 3. Handle 416 Range Not Satisfiable
    // If upstream rejects the range (e.g. stale cache requesting bytes past end), retry full fetch
    if (videoResponse.status === 416) {
        console.warn(`[Proxy] 416 Range Not Satisfiable for ${targetUrl}. Retrying full stream.`);
        videoResponse = await fetch(targetUrl); // Retry without headers
    }

    if (!videoResponse.ok) {
       throw new Error(`Upstream Error: ${videoResponse.status} ${videoResponse.statusText}`);
    }

    // 4. Set Response Headers
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';
    const contentLength = videoResponse.headers.get('content-length');
    const contentRange = videoResponse.headers.get('content-range');
    const acceptRanges = videoResponse.headers.get('accept-ranges');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); 
    res.setHeader('Vary', 'Range'); // Critical: Tell caches that response depends on Range header
    
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    // Force Accept-Ranges to allow seeking in Chrome/Safari even if upstream forgets it
    // Unless it's a live stream where it might not apply, but for files it's safe.
    res.setHeader('Accept-Ranges', acceptRanges || 'bytes');

    // Forward status code (200 or 206 Partial Content)
    res.status(videoResponse.status);
    
    // 5. Stream Body
    if (!videoResponse.body) throw new Error("No response body");

    // @ts-ignore - Readable.fromWeb matches Fetch API ReadableStream
    const nodeStream = Readable.fromWeb(videoResponse.body);
    nodeStream.pipe(res);

  } catch (error: any) {
    console.error("[Video Proxy] Error:", error.message);
    // Only send JSON error if headers haven't been sent yet
    if (!res.headersSent) {
        return res.status(500).json({ error: "Proxy Stream Error" });
    }
    res.end();
  }
}
