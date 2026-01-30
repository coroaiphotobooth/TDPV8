

// This endpoint is polled by the Gallery Page to process the queue
export const config = {
  maxDuration: 60, // Give it time to talk to Seedance
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL;
  const gasUrl = process.env.APPS_SCRIPT_BASE_URL;
  const defaultModelId = process.env.SEEDANCE_MODEL_ID || 'seedance-1-0-pro-fast-251015';

  if (!apiKey || !baseUrl || !gasUrl) return res.status(500).json({ error: 'Config missing' });

  try {
    // 1. Fetch current Gallery state from Sheet
    const sheetRes = await fetch(`${gasUrl}?action=gallery&t=${Date.now()}`);
    
    if (!sheetRes.ok) throw new Error(`Failed to fetch Gallery: ${sheetRes.status}`);

    const sheetData = await sheetRes.json();
    const items: any[] = sheetData.items || [];

    // Filter tasks
    // Only process tasks that are 'processing'. Ignore 'ready_url' or 'done'.
    const processingTasks = items.filter(i => i.videoStatus === 'processing');
    const queuedTasks = items.filter(i => i.videoStatus === 'queued');

    const MAX_CONCURRENT = 5;
    const report = { processed: 0, started: 0, errors: [] as string[] };

    // 2. CHECK PROCESSING TASKS (Maintenance)
    for (const task of processingTasks) {
       if (!task.videoTaskId) continue;
       
       // Check Seedance Status
       const statusUrl = `${baseUrl.replace(/\/$/, '')}/contents/generations/tasks/${task.videoTaskId}`;
       const sRes = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
       
       if (sRes.ok) {
           const sData = await sRes.json();
           const resultObj = sData.Result || sData.data || sData;
           const status = (resultObj.status || 'processing').toLowerCase();
           
           if (status === 'succeeded' || status === 'success') {
               // SUCCESS HANDLER (MODE A)
               let videoUrl = resultObj.content?.video_url || resultObj.output?.video_url || resultObj.video_url;
               
               if (videoUrl) {
                   // STEP 1: Update Sheet to 'ready_url' immediately so Gallery can play it via Proxy
                   // This makes the UI responsive without waiting for Drive Upload
                   await fetch(gasUrl, {
                       method: 'POST',
                       headers: { "Content-Type": "text/plain" },
                       body: JSON.stringify({ 
                           action: 'updateVideoStatus', 
                           photoId: task.id, 
                           status: 'ready_url', // Intermediate success state
                           providerUrl: videoUrl 
                       })
                   });

                   // STEP 2: Trigger Background Upload to Drive (Archive)
                   // CRITICAL FIX: We MUST await this in Vercel Serverless, otherwise the function execution freezes 
                   // immediately after the response is sent, cancelling the fetch request.
                   try {
                       const uploadRes = await fetch(gasUrl, {
                           method: 'POST',
                           headers: { "Content-Type": "text/plain" }, 
                           body: JSON.stringify({
                               action: 'finalizeVideoUpload',
                               photoId: task.id,
                               videoUrl: videoUrl,
                               sessionFolderId: task.sessionFolderId
                           })
                       });
                       
                       // LOG ERROR if GAS returns !ok
                       const uploadJson = await uploadRes.json();
                       if (!uploadJson.ok) {
                           console.error(`GAS Upload Failed for ${task.id}:`, uploadJson.error);
                           report.errors.push(`Upload Failed: ${uploadJson.error}`);
                       } else {
                           console.log(`GAS Upload Success for ${task.id}:`, uploadJson.fileId);
                       }

                   } catch (e: any) {
                       console.error("Finalize trigger failed (Best Effort):", e);
                       report.errors.push(`Trigger Error: ${e.message}`);
                       // We do not throw here to allow other tasks to process
                   }

                   report.processed++;
               }
           } else if (status === 'failed' || status === 'error' || status === 'canceled') {
               // Mark Failed
               await fetch(gasUrl, {
                   method: 'POST',
                   headers: { "Content-Type": "text/plain" },
                   body: JSON.stringify({ action: 'updateVideoStatus', photoId: task.id, status: 'failed' })
               });
           }
       }
    }

    // 3. START QUEUED TASKS (Dispatcher)
    const activeCount = items.filter(i => i.videoStatus === 'processing').length;
    const availableSlots = MAX_CONCURRENT - activeCount;

    if (availableSlots > 0 && queuedTasks.length > 0) {
        const tasksToStart = queuedTasks.slice(0, availableSlots);
        
        for (const task of tasksToStart) {
             const videoPrompt = task.videoPrompt || "Cinematic movement, high quality, slow motion";
             const videoResolution = (task.videoResolution === '720p' || task.videoResolution === '480p') ? task.videoResolution : '480p';
             const videoModel = task.videoModel || defaultModelId;

             // Start Seedance
             // Input image is the Original Google Drive File ID
             const payload = {
                model: videoModel,
                content: [
                    { type: "text", text: videoPrompt },
                    { type: "image_url", image_url: { url: `https://drive.google.com/uc?export=download&id=${task.id}` } }
                ],
                parameters: { 
                    duration: 5, 
                    resolution: videoResolution,
                    audio: false 
                }
             };

             const startRes = await fetch(`${baseUrl.replace(/\/$/, '')}/contents/generations/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify(payload)
             });
             
             if (startRes.ok) {
                 const startData = await startRes.json();
                 const taskId = startData.id || startData.Result?.id;
                 if (taskId) {
                     await fetch(gasUrl, {
                         method: 'POST',
                         headers: { "Content-Type": "text/plain" },
                         body: JSON.stringify({ 
                             action: 'updateVideoStatus', 
                             photoId: task.id, 
                             status: 'processing',
                             taskId: taskId 
                         })
                     });
                     report.started++;
                 }
             } else {
                 console.error("Seedance Start Failed", await startRes.text());
             }
        }
    }

    return res.status(200).json({ ok: true, report });
  } catch (e: any) {
    console.error("Tick Error", e);
    return res.status(500).json({ error: e.message });
  }
}
