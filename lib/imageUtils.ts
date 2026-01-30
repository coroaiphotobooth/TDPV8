
export const applyOverlay = async (
    base64AI: string, 
    overlayUrl: string | null, 
    targetWidth: number, 
    targetHeight: number
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Canvas context unavailable");
  
    const loadImg = (src: string, isCors = false): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        if (isCors) img.crossOrigin = "Anonymous";
        img.referrerPolicy = "no-referrer"; 
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(new Error("Image load error"));
        img.src = src;
      });
    };
  
    try {
      const baseImg = await loadImg(base64AI);
      const scale = Math.max(targetWidth / baseImg.width, targetHeight / baseImg.height);
      const x = (targetWidth / 2) - (baseImg.width / 2) * scale;
      const y = (targetHeight / 2) - (baseImg.height / 2) * scale;
      ctx.drawImage(baseImg, x, y, baseImg.width * scale, baseImg.height * scale);
  
      if (overlayUrl && overlayUrl.trim() !== '') {
        const getDriveId = (url: string) => {
           const match = url.match(/id=([a-zA-Z0-9_-]+)/) || url.match(/\/d\/([a-zA-Z0-9_-]+)/);
           return match ? match[1] : null;
        };
        const driveId = getDriveId(overlayUrl);
        const attempts = [
           driveId ? `https://lh3.googleusercontent.com/d/${driveId}` : null,
           overlayUrl,
           driveId ? `https://drive.google.com/uc?export=view&id=${driveId}` : null
        ].filter(Boolean) as string[];
  
        let applied = false;
        for (const url of attempts) {
            if (applied) break;
            const freshUrl = url + (url.includes('?') ? '&t=' : '?t=') + Date.now();
            try {
                const ovrImg = await loadImg(freshUrl, true);
                ctx.drawImage(ovrImg, 0, 0, targetWidth, targetHeight);
                applied = true;
            } catch (errA) {
                try {
                    const resp = await fetch(freshUrl, { mode: 'cors', cache: 'no-cache' });
                    if (!resp.ok) throw new Error("Fetch failed");
                    const blob = await resp.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const ovrImg = await loadImg(blobUrl, false);
                    ctx.drawImage(ovrImg, 0, 0, targetWidth, targetHeight);
                    URL.revokeObjectURL(blobUrl);
                    applied = true;
                } catch (errB) {}
            }
        }
      }
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch (err) {
      console.error("Canvas composition error:", err);
      return base64AI;
    }
  };
