export const config = {
  maxDuration: 10,
};

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { taskId } = req.query;

    if (!taskId) {
      return res.status(400).json({ error: 'Task ID tidak valid' });
    }

    // 1. Validasi Config
    const apiKey = process.env.ARK_API_KEY;
    const baseUrl = process.env.ARK_BASE_URL;

    if (!apiKey || !baseUrl) {
      return res.status(500).json({ error: 'Kesalahan konfigurasi server' });
    }

    // 2. Query Status (Data Plane API V3 REST)
    // URL Format: {BASE_URL}/contents/generations/tasks/{taskId}
    const baseUrlClean = baseUrl.replace(/\/$/, '');
    const statusUrl = `${baseUrlClean}/contents/generations/tasks/${taskId}`;
    
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    // HARDENING #1: SAFE JSON PARSING
    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      // Handle HTML/Text errors
      if (response.status === 404) {
          return res.status(200).json({ status: 'processing', details: 'Task propagation' });
      }
      console.error("[Video Status] Non-JSON Response:", rawText);
      return res.status(502).json({ error: "Respons status invalid (Parse Error)" });
    }

    // Handle Rate Limiting (429)
    if (response.status === 429) {
      return res.status(429).json({ 
        status: 'processing', 
        error: "Terlalu banyak permintaan, coba lagi nanti" 
      });
    }

    if (!response.ok) {
      // HARDENING #3: ROBUST ERROR MESSAGE EXTRACTION
      const errorMsg = data?.error?.message || 
                       data?.message || 
                       data?.ResponseMetadata?.Error?.Message ||
                       "Provider Error";
                       
      // Handle 404/TaskNotFound scenarios
      if (response.status === 404 || data?.code === 'TaskNotFound') {
           return res.status(200).json({ status: 'processing', details: 'Task propagation' });
      }
      
      throw new Error(errorMsg);
    }

    // 3. Mapping Status (Robust Extraction for V3)
    // V3 usually returns root level fields: { status: "Succeeded", content: { ... } }
    // We check root first, then fallback to nested for compatibility
    const resultObj = data.Result || data.data || data;
    
    // Normalize status to lowercase
    const rawStatus = (resultObj.status || resultObj.Status || 'queued').toLowerCase();

    // APP STATUS: DONE
    if (rawStatus === 'succeeded' || rawStatus === 'success') {
      let videoUrl = null;

      // Robust URL Extraction (Prioritize 'content' for V3)
      if (resultObj.content?.video_url) videoUrl = resultObj.content.video_url;
      else if (resultObj.content?.url) videoUrl = resultObj.content.url;
      else if (resultObj.output?.video_url) videoUrl = resultObj.output.video_url;
      else if (resultObj.result?.video_url) videoUrl = resultObj.result.video_url;
      else if (resultObj.video_url) videoUrl = resultObj.video_url;

      if (!videoUrl) {
         console.error("[Video Status] Success but no URL found in:", rawText);
         return res.status(500).json({ status: 'failed', error: 'Video URL tidak ditemukan' });
      }

      return res.status(200).json({
        status: 'done',
        videoUrl: videoUrl
      });
    } 
    // APP STATUS: FAILED
    else if (rawStatus === 'failed' || rawStatus === 'canceled' || rawStatus === 'error') {
      const failReason = resultObj.error?.message || 
                         resultObj.message || 
                         resultObj.ResponseMetadata?.Error?.Message ||
                         "Gagal render video";

      return res.status(200).json({
        status: 'failed',
        error: failReason
      });
    } 
    // APP STATUS: PROCESSING
    else {
      return res.status(200).json({ status: 'processing' });
    }

  } catch (error: any) {
    console.error("[Video Status] Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}