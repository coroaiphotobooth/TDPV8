
import { GoogleGenAI } from "@google/genai";
import { PhotoboothSettings, AspectRatio } from "../types";

// --- OPENAI HELPER FUNCTIONS ---

// 1. Prepare: Resize Fit to 512 -> Pad to Square -> Return Base64 & Crop Info
const prepareOpenAIInput = async (base64Str: string, targetSize: number = 512): Promise<{ image: string, mask: string, cropInfo: { x: number, y: number, w: number, h: number } }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Force Square Canvas
      canvas.width = targetSize;
      canvas.height = targetSize;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("No Canvas Context");

      // Clear with transparent background
      ctx.clearRect(0, 0, targetSize, targetSize);

      // Calculate Scaling (Fit Contain)
      const ratio = img.width / img.height;
      let drawW = targetSize;
      let drawH = targetSize;
      let offsetX = 0;
      let offsetY = 0;

      // Logic untuk 9:16 (Portrait) atau 16:9 (Landscape) agar masuk ke 512x512
      if (img.width > img.height) {
        // Landscape Source
        drawW = targetSize;
        drawH = drawW / ratio;
        offsetY = (targetSize - drawH) / 2;
      } else {
        // Portrait Source (9:16 masuk sini)
        drawH = targetSize;
        drawW = drawH * ratio;
        offsetX = (targetSize - drawW) / 2;
      }

      // Draw Image Centered (This keeps aspect ratio intact)
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
      
      const preparedImage = canvas.toDataURL('image/png');

      // Create Mask (Fully Transparent = Edit Everything, but utilizing the source image structure)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = targetSize;
      maskCanvas.height = targetSize;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return reject("No Mask Context");
      
      // Fully Transparent Mask
      maskCtx.clearRect(0, 0, targetSize, targetSize);
      const preparedMask = maskCanvas.toDataURL('image/png');

      resolve({ 
        image: preparedImage, 
        mask: preparedMask,
        cropInfo: { x: offsetX, y: offsetY, w: drawW, h: drawH }
      });
    };
    img.onerror = reject;
    img.src = base64Str;
  });
};

// 2. Post-Process: Crop padding back to original ratio
const cropOpenAIResult = async (base64Result: string, cropInfo: { x: number, y: number, w: number, h: number }): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Set canvas size to the actual image size (removing padding)
      canvas.width = cropInfo.w;
      canvas.height = cropInfo.h;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject("No Context");

      // Draw only the slice that contains the image
      ctx.drawImage(
        img, 
        cropInfo.x, cropInfo.y, cropInfo.w, cropInfo.h, // Source Slice
        0, 0, cropInfo.w, cropInfo.h // Destination
      );

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = base64Result;
  });
};

// --- GEMINI & MAIN LOGIC ---

const detectPeopleCount = async (ai: GoogleGenAI, base64: string, mimeType: string): Promise<number> => {
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { data: base64, mimeType } },
          { text: "How many humans are visible in this image? Return strictly just the integer number. If unsure or 0, return 1." }
        ]
      }
    });
    
    // Parse result
    const text = result.text;
    if (text) {
        const num = parseInt(text.trim());
        return isNaN(num) ? 1 : num;
    }
    return 1;
  } catch (e) {
    console.warn("Detection failed, defaulting to 1 person", e);
    return 1;
  }
};

export const generateAIImage = async (base64Source: string, prompt: string, outputRatio: AspectRatio = '9:16', forceUltraQuality: boolean = false) => {
  try {
    const storedSettings = localStorage.getItem('pb_settings');
    let selectedModel = 'gemini-2.5-flash-image';
    let promptMode = 'wrapped'; // Default to wrapped (safe)

    if (storedSettings) {
      const parsedSettings: PhotoboothSettings = JSON.parse(storedSettings);
      if (parsedSettings.selectedModel) {
        selectedModel = parsedSettings.selectedModel;
      }
      if (parsedSettings.promptMode) {
        promptMode = parsedSettings.promptMode;
      }
    }

    // OVERRIDE: Ultra Quality requested via Regenerate
    if (forceUltraQuality) {
        selectedModel = 'gemini-3-pro-image-preview';
        console.log("⚡ FORCE ULTRA QUALITY: Using gemini-3-pro-image-preview");
    }

    // --- OPENAI FLOW (GPT-1.5) ---
    if (selectedModel === 'gpt-image-1.5' && !forceUltraQuality) {
       const GPT_WORKFLOW_SIZE = 512;
       console.log(`Using OpenAI Provider (GPT-Image-1.5) | Size: ${GPT_WORKFLOW_SIZE}px`);
       try {
         const { image: preparedBase64, mask: maskBase64, cropInfo } = await prepareOpenAIInput(base64Source, GPT_WORKFLOW_SIZE);
         
         // Logic Prompt Mode for OpenAI as well
         let finalOpenAIPrompt = prompt;
         if (promptMode === 'wrapped') {
            finalOpenAIPrompt = `Strictly preserve the exact pose, facial structure, and composition. ${prompt} . Photorealistic, high fidelity, do not crop, do not zoom.`;
         }

         const response = await fetch('/api/generate-image-openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               prompt: finalOpenAIPrompt,
               imageBase64: preparedBase64,
               maskBase64: maskBase64,
               size: GPT_WORKFLOW_SIZE 
            })
         });
         
         if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "OpenAI Generation Failed");
         }
         
         const data = await response.json();
         const rawResult = data.imageBase64;
         const finalResult = await cropOpenAIResult(rawResult, cropInfo);
         return finalResult;
         
       } catch (err: any) {
         console.warn("OpenAI Failed. Falling back to Gemini 2.5.", err);
         selectedModel = 'gemini-2.5-flash-image';
       }
    }

    // --- GEMINI FLOW ---
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const mimeType = base64Source.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
    const cleanBase64 = base64Source.split(',')[1];

    if (selectedModel === 'auto' && !forceUltraQuality) {
       console.log("Auto Mode: Detecting people count...");
       const personCount = await detectPeopleCount(ai, cleanBase64, mimeType);
       if (personCount > 1) {
          selectedModel = 'gemini-3-pro-image-preview';
       } else {
          selectedModel = 'gemini-2.5-flash-image';
       }
    }

    let apiAspectRatio = '9:16';
    if (outputRatio === '16:9') apiAspectRatio = '16:9';
    if (outputRatio === '9:16') apiAspectRatio = '9:16';
    if (outputRatio === '3:2') apiAspectRatio = '4:3';
    if (outputRatio === '2:3') apiAspectRatio = '3:4';

    const executeGenAI = async (model: string, useProConfig: boolean) => {
      const imageConfig: any = { aspectRatio: apiAspectRatio };
      if (useProConfig) imageConfig.imageSize = '1K';

      // --- PROMPT CONSTRUCTION LOGIC ---
      let finalPrompt = prompt;

      if (promptMode === 'wrapped') {
          // SAFE MODE: Enforce face lock and structure
          finalPrompt = `Edit the provided photo.

Rules:
- Detect ALL people in the photo and keep the SAME number of people.
- Preserve each person’s identity (face, skin tone, age, gender, expression).
- Do not remove, merge, replace, or add any person.

Instruction: ${prompt}`;
      } 
      // RAW MODE: Send prompt exactly as is (No wrapper)

      console.log(`Generating with ${model}... Mode: ${promptMode.toUpperCase()}`);
      
      return await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { data: cleanBase64, mimeType: mimeType } },
            { text: finalPrompt },
          ],
        },
        config: { imageConfig: imageConfig }
      });
    };

    let response;
    try {
      const usePro = selectedModel.includes('pro') || selectedModel === 'gemini-3-pro-image-preview';
      response = await executeGenAI(usePro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image', usePro);
    } catch (err: any) {
      console.warn(`Model ${selectedModel} failed. Reason:`, err.message);
      // Fallback logic for PRO models -> Flash
      if (selectedModel.includes('pro') || forceUltraQuality) {
         console.log("Falling back to gemini-2.5-flash-image...");
         response = await executeGenAI('gemini-2.5-flash-image', false);
      } else {
        throw err;
      }
    }

    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const candidate = candidates[0];
      
      if (candidate.content && candidate.content.parts) {
          // 1. Search for Image Part
          for (const part of candidate.content.parts) {
            if (part.inlineData) {
              const mt = part.inlineData.mimeType || 'image/png';
              return `data:${mt};base64,${part.inlineData.data}`;
            }
          }
          
          // 2. If no image found, search for Text Part (Error/Refusal explanation)
          for (const part of candidate.content.parts) {
             if (part.text) {
                 console.warn("Gemini returned text only:", part.text);
                 throw new Error(`AI Generation Refused: ${part.text}`);
             }
          }
      }
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          throw new Error(`Generation blocked. Reason: ${candidate.finishReason}`);
      }
    }
    
    throw new Error("No image data returned from Gemini (Empty Response)");
  } catch (error: any) {
    console.error("Gemini Generation Final Error:", error);
    throw error;
  }
};
