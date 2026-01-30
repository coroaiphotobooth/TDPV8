
import OpenAI, { toFile } from 'openai';
import { Buffer } from 'node:buffer';

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle Preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server config error: OPENAI_API_KEY missing" });
    }

    const { prompt, imageBase64, maskBase64, size } = req.body;
    
    if (!prompt || !imageBase64) {
      return res.status(400).json({ error: "Missing prompt or image" });
    }

    const openai = new OpenAI({ apiKey });

    const toBuffer = (b64: string) => {
      const data = b64.includes(',') ? b64.split(',')[1] : b64;
      return Buffer.from(data, 'base64');
    };

    const imageBuffer = toBuffer(imageBase64);
    const maskBuffer = maskBase64 ? toBuffer(maskBase64) : undefined;

    // Strict Enforcement of 512x512 if user requested or if defaulting
    // This matches the client-side logic to ensure speed and correct cropping
    let openaiSize: "512x512" | "1024x1024" = "512x512";
    
    if (size === 1024 || size === '1024') {
        openaiSize = "1024x1024";
    }

    console.log(`Calling OpenAI Image Edit. Model: gpt-image-1.5 | Size: ${openaiSize}`);

    const response = await openai.images.edit({
      model: 'gpt-image-1.5', 
      image: await toFile(imageBuffer, 'image.png', { type: 'image/png' }),
      mask: maskBuffer ? await toFile(maskBuffer, 'mask.png', { type: 'image/png' }) : undefined,
      prompt: prompt,
      n: 1,
      size: openaiSize,
    });

    if (!response.data || response.data.length === 0) {
      return res.status(500).json({ error: "OpenAI returned no image data" });
    }

    let outputBase64 = response.data[0].b64_json;

    if (!outputBase64 && response.data[0].url) {
       console.log("Fetching image from URL...");
       const urlResponse = await fetch(response.data[0].url);
       const arrayBuffer = await urlResponse.arrayBuffer();
       outputBase64 = Buffer.from(arrayBuffer).toString('base64');
    }

    if (!outputBase64) {
      throw new Error("Failed to resolve image data");
    }

    return res.status(200).json({ 
      imageBase64: `data:image/png;base64,${outputBase64}` 
    });

  } catch (error: any) {
    console.error("OpenAI API Error:", error);
    return res.status(500).json({ 
      error: error.message || "OpenAI Generation Failed" 
    });
  }
}
