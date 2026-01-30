
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AspectRatio } from '../types';

interface CameraPageProps {
  onCapture: (image: string) => void;
  onGenerate: () => void;
  onBack: () => void;
  capturedImage: string | null;
  orientation: 'portrait' | 'landscape';
  cameraRotation?: number; // 0, 90, 180, 270
  aspectRatio?: AspectRatio; // '9:16' | '16:9' etc
}

const CameraPage: React.FC<CameraPageProps> = ({ 
    onCapture, 
    onGenerate, 
    onBack, 
    capturedImage, 
    orientation, 
    cameraRotation = 0,
    aspectRatio = '9:16'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        // Minta resolusi tertinggi, browser akan memberikan max sensor (biasanya landscape 1920x1080 atau 4k)
        // Kita akan menanganinya via rotasi canvas/css jika fisik kamera diputar
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 4096 }, 
            height: { ideal: 4096 }, 
            facingMode: 'user' 
          } 
        });
        setStream(mediaStream);
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch (err) {
        console.error("Camera error:", err);
      }
    }
    setupCamera();
    return () => stream?.getTracks().forEach(track => track.stop());
  }, []);

  // --- CALCULATE ASPECT RATIO VALUE ---
  const getAspectRatioValue = (ratioStr: string): number => {
    const [w, h] = ratioStr.split(':').map(Number);
    return w / h;
  };
  const targetRatioValue = getAspectRatioValue(aspectRatio);

  const capture = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // 1. Get RAW Video Source Dimensions (biasanya Landscape, e.g., 1920x1080)
      const rawW = video.videoWidth;
      const rawH = video.videoHeight;
      
      // 2. Tentukan Dimensi "Efektif" setelah memperhitungkan Rotasi Fisik Kamera
      // Jika kamera diputar 90/270 derajat, maka Lebar Video menjadi Tinggi Gambar, dst.
      const isSideways = cameraRotation === 90 || cameraRotation === 270;
      
      const effectiveInputW = isSideways ? rawH : rawW;
      const effectiveInputH = isSideways ? rawW : rawH;
      const effectiveInputRatio = effectiveInputW / effectiveInputH;

      // 3. Hitung Crop Area pada Stream Asli (RAW) agar sesuai Target Ratio
      // Kita hitung berdasarkan dimensi efektif dulu, lalu petakan balik ke RAW
      let cropW_eff = effectiveInputW;
      let cropH_eff = effectiveInputH;

      if (effectiveInputRatio > targetRatioValue) {
        // Input lebih lebar dari target -> Crop Sisi Kiri/Kanan (Efektif)
        cropW_eff = effectiveInputH * targetRatioValue;
      } else {
        // Input lebih tinggi dari target -> Crop Atas/Bawah (Efektif)
        cropH_eff = effectiveInputW / targetRatioValue;
      }

      // 4. Petakan Crop Efektif kembali ke koordinat RAW (sebelum rotasi)
      // Ini penting agar ctx.drawImage mengambil area yang benar dari video source
      let srcX = 0, srcY = 0, srcW = 0, srcH = 0;

      if (isSideways) {
         // Jika miring, width efektif = height raw
         srcW = cropH_eff; // Ambil full height RAW (yang jadi width efektif) atau terpotong
         srcH = cropW_eff; // Ambil full width RAW (yang jadi height efektif) atau terpotong
      } else {
         srcW = cropW_eff;
         srcH = cropH_eff;
      }

      // Center Crop Calculation pada koordinat RAW
      srcX = (rawW - srcW) / 2;
      srcY = (rawH - srcH) / 2;

      // 5. Tentukan Ukuran Output Akhir (Max 1536px)
      const MAX_DIMENSION = 1536;
      let destW, destH;

      if (targetRatioValue < 1) { // Portrait Output
          destW = Math.round(MAX_DIMENSION * targetRatioValue);
          destH = MAX_DIMENSION;
      } else { // Landscape Output
          destW = MAX_DIMENSION;
          destH = Math.round(MAX_DIMENSION / targetRatioValue);
      }

      // 6. Set Ukuran Canvas (Final Output Size)
      canvas.width = destW;
      canvas.height = destH;

      if (ctx) {
         ctx.save();

         // Pindahkan titik pusat ke tengah canvas
         ctx.translate(canvas.width / 2, canvas.height / 2);
         
         // Putar canvas sesuai setting Admin
         ctx.rotate((cameraRotation * Math.PI) / 180);
         
         // Mirroring (Standard Webcam)
         // Note: Scale harus dilakukan pada sumbu X relatif terhadap gambar asli sebelum rotasi
         // Jika rotasi 0/180: scale(-1, 1) membalik horizontal
         // Jika rotasi 90/270: sumbu visual X berbeda. 
         // Trial & Error: scale(-1, 1) biasanya works universal jika dilakukan setelah rotate untuk efek cermin.
         ctx.scale(-1, 1); 

         // Gambar Video ke Canvas
         // KUNCI: DrawImage dimensi tujuan (dest) harus ditukar jika rotasi 90/270 
         // karena kita menggambar ke context yang sudah diputar.
         const drawW = isSideways ? destH : destW;
         const drawH = isSideways ? destW : destH;
         
         ctx.drawImage(
            video, 
            srcX, srcY, srcW, srcH, // Source Crop (RAW coords)
            -drawW / 2, -drawH / 2, drawW, drawH // Destination di Context (Centered)
         );

         ctx.restore();

         const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
         onCapture(dataUrl);
         onGenerate();
      }
    }
  }, [onCapture, onGenerate, cameraRotation, targetRatioValue]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        if (canvasRef.current) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          
          // Crop uploaded image logic... (simplified for brevity, assumes standard orientation)
          const imgRatio = img.width / img.height;
          let sX = 0, sY = 0, sW = img.width, sH = img.height;
          
          if (imgRatio > targetRatioValue) {
             sW = img.height * targetRatioValue;
             sX = (img.width - sW) / 2;
          } else {
             sH = img.width / targetRatioValue;
             sY = (img.height - sH) / 2;
          }

          const MAX_DIMENSION = 1536;
          let dW, dH;
          if (targetRatioValue < 1) {
              dW = Math.round(MAX_DIMENSION * targetRatioValue);
              dH = MAX_DIMENSION;
          } else {
              dW = MAX_DIMENSION;
              dH = Math.round(MAX_DIMENSION / targetRatioValue);
          }

          canvas.width = dW;
          canvas.height = dH;

          if (ctx) {
            ctx.drawImage(img, sX, sY, sW, sH, 0, 0, dW, dH);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
            onCapture(dataUrl);
            onGenerate();
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const startCountdown = () => {
    setCountdown(3);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === 1) {
          clearInterval(interval);
          capture();
          return null;
        }
        return prev ? prev - 1 : null;
      });
    }, 1000);
  };

  // Convert "9:16" -> "9/16" for CSS
  const cssAspectRatio = aspectRatio.replace(':', '/');
  const isSideways = cameraRotation === 90 || cameraRotation === 270;

  return (
    <div className="w-full h-screen flex flex-col items-center justify-center bg-transparent relative overflow-hidden">
      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-40 bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={onBack} 
          className="text-white hover:text-purple-400 font-bold tracking-widest uppercase text-xs md:text-base transition-colors bg-black/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10"
        >
          BACK
        </button>
        <h2 className="text-sm md:text-2xl font-heading text-white neon-text italic uppercase drop-shadow-lg">Strike a Pose</h2>
        <div className="w-20" /> 
      </div>

      {/* VIEWPORT MASK CONTAINER */}
      <div className="relative z-10 flex items-center justify-center w-full h-full max-h-screen p-4 md:p-8">
        {!capturedImage ? (
           <div 
             className="relative overflow-hidden shadow-[0_0_50px_rgba(168,85,247,0.2)] border-2 border-purple-500/30 rounded-xl bg-gray-900 flex items-center justify-center"
             style={{
                aspectRatio: cssAspectRatio,
                height: '100%',     
                width: 'auto',      
                maxHeight: '100%',
                maxWidth: '100%'
             }}
           >
              {/* VIDEO ELEMENT */}
              {/* Logic: 
                  Jika Rotasi 0/180: Video fill width/height container normal (object-cover).
                  Jika Rotasi 90/270: Video harus "Berdiri". 
                  Karena rotasi CSS memutar elemen dari center, kita harus menukar width/height.
                  Width video = Height Container. Height video = Width Container.
              */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="absolute object-cover"
                style={{ 
                   transform: `rotate(${cameraRotation}deg) scaleX(-1)`, // Rotate + Mirror
                   // KUNCI: Jika miring, tukar dimensi agar cover area dengan benar
                   width: isSideways ? '100vh' : '100%', 
                   height: isSideways ? '100vw' : '100%',
                   // Pastikan minimal mengcover area parent
                   minWidth: isSideways ? '100%' : '100%',
                   minHeight: isSideways ? '100%' : '100%',
                }}
              />

              {/* HUD / Countdown Overlay */}
              <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center opacity-40">
                   <div className="w-1/2 h-1/3 border border-white/30 rounded-lg flex items-center justify-center">
                       <div className="w-2 h-2 bg-purple-500/50 rounded-full" />
                   </div>
              </div>

              {countdown && (
                <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/40 backdrop-blur-[4px]">
                  <span className="text-[120px] md:text-[250px] font-heading text-white neon-text animate-ping italic">{countdown}</span>
                </div>
              )}
           </div>
        ) : (
           // Result Preview
           <div 
             className="relative overflow-hidden border-2 border-white/20 rounded-xl"
             style={{
                aspectRatio: cssAspectRatio,
                height: '100%',
                width: 'auto',
                maxHeight: '100%',
                maxWidth: '100%'
             }}
           >
              <img src={capturedImage} alt="Capture" className="w-full h-full object-contain bg-black" />
           </div>
        )}
      </div>

      {/* CONTROLS */}
      {!countdown && !capturedImage && (
        <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center z-50 px-6 gap-8 pointer-events-none">
                <div className="w-16 h-16 hidden md:block" /> 
                <button 
                  onClick={startCountdown}
                  className="group pointer-events-auto relative w-24 h-24 md:w-28 md:h-28 flex items-center justify-center outline-none transition-transform active:scale-95"
                >
                  <div className="absolute inset-0 border-2 border-dashed border-purple-500/30 rounded-full animate-[spin_10s_linear_infinite]" />
                  <div className="absolute inset-2 border-2 border-white/20 rounded-full group-hover:border-purple-400/50 transition-colors duration-500" />
                  <div className="absolute inset-4 bg-white/5 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center group-hover:bg-purple-600/20 group-hover:border-purple-400 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                    <span className="text-[10px] md:text-xs font-heading font-black text-white tracking-[0.2em] italic group-hover:neon-text">CAPTURE</span>
                  </div>
                </button>

                <div className="pointer-events-auto w-16 h-16 md:flex items-center justify-center">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-black/40 border border-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/10 hover:border-purple-500 transition-all group/upload"
                    title="Upload Image"
                  >
                    <svg className="w-5 h-5 md:w-6 md:h-6 text-white/70 group-hover/upload:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </button>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default CameraPage;
