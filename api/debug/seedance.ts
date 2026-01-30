
export default async function handler(req: any, res: any) {
  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL;
  const gasUrl = process.env.APPS_SCRIPT_BASE_URL;

  const debugInfo = {
    hasApiKey: !!apiKey,
    hasBaseUrl: !!baseUrl,
    baseUrl: baseUrl,
    hasGasUrl: !!gasUrl,
    timestamp: new Date().toISOString()
  };

  if (!apiKey || !baseUrl) {
    return res.status(500).json({ 
        error: "Missing API Config", 
        debug: debugInfo 
    });
  }

  try {
    // Attempt to list tasks as a connectivity test
    // Endpoint: /contents/generations/tasks?offset=0&limit=1
    const testUrl = `${baseUrl.replace(/\/$/, '')}/contents/generations/tasks?offset=0&limit=1`;
    
    console.log("Testing Seedance Connection:", testUrl);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const status = response.status;
    const text = await response.text();

    let json;
    try { json = JSON.parse(text); } catch(e) { json = text; }

    return res.status(200).json({
      status: "Connection Attempted",
      httpCode: status,
      response: json,
      config: debugInfo
    });

  } catch (error: any) {
    return res.status(500).json({
      error: error.message,
      config: debugInfo
    });
  }
}
