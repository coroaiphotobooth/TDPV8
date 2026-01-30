
export const config = {
  maxDuration: 10,
};

// This endpoint registers the task in the DB (Google Sheet)
export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    const { driveFileId, sessionFolderId, prompt, resolution, model } = req.body;
    if (!driveFileId) return res.status(400).json({ error: 'Missing driveFileId' });

    const gasUrl = process.env.APPS_SCRIPT_BASE_URL;
    if (!gasUrl) return res.status(500).json({ error: 'Missing APPS_SCRIPT_BASE_URL' });

    // 1. Register to Queue via Apps Script
    // We pass the prompt, resolution AND model to be saved in the sheet
    const response = await fetch(gasUrl, {
       method: 'POST',
       body: JSON.stringify({
          action: 'queueVideo',
          photoId: driveFileId,
          sessionFolderId: sessionFolderId,
          prompt: prompt || 'Cinematic slow motion, high quality',
          resolution: resolution || '480p', // Pass resolution, default 480p
          model: model || 'seedance-1-0-pro-fast-251015' // Pass model, default to 1.0
       })
    });
    
    return res.status(200).json({ status: 'queued', message: 'Video task queued successfully' });

  } catch (error: any) {
    console.error("Queue Error:", error);
    return res.status(500).json({ error: "Failed to queue video" });
  }
}
