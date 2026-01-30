
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Concept, PhotoboothSettings, AspectRatio } from '../types';
import { generateAIImage } from '../lib/gemini';
import { uploadToDrive, createSessionFolder } from '../lib/appsScript';
import { applyOverlay } from '../lib/imageUtils';

interface ResultPageProps {
  capturedImage: string;
  concept: Concept;
  settings: PhotoboothSettings;
  concepts: Concept[]; 
  onDone: () => void;
  onGallery: () => void;
  isUltraQuality?: boolean;
  existingSession?: {id: string, url: string} | null; // NEW PROP
}

const ResultPage: React.FC<ResultPageProps> = ({ capturedImage, concept: initialConcept, settings, concepts, onDone, onGallery, isUltraQuality = false, existingSession }) => {
  const [concept, setConcept] = useState(initialConcept);
  
  // Status States
  const [isProcessing, setIsProcessing] = useState(true); // Loading layar penuh
  const [isFinalizing, setIsFinalizing] = useState(false); // Proses upload hasil akhir
  const [resultImage, setResultImage] = useState<string | null>(null);
  
  // Data States
  // Initialize with existing session if available
  const [sessionFolder, setSessionFolder] = useState<{id: string, url: string} | null>(existingSession || null);
  const [photoId, setPhotoId] = useState<string | null>(null); 
  
  // UI States
  const [viewMode, setViewMode] = useState<'result' | 'original'>('result');
  const [showConceptSelector, setShowConceptSelector] = useState(false);
  const [selectedRegenConcept, setSelectedRegenConcept] = useState<Concept | null>(null);
  
  // Quality State (Initially from prop, then from local selector)
  const [currentQuality, setCurrentQuality] = useState(isUltraQuality);
  const [pendingQuality, setPendingQuality] = useState(false); // Used in modal

  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("INITIATING...");
  const [timer, setTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  const [showQR, setShowQR] = useState(false);
  const [isVideoRequested, setIsVideoRequested] = useState(false);
  const [videoRedirectTimer, setVideoRedirectTimer] = useState<number | null>(null);

  // Dimension Logic
  let targetWidth = 1080;
  let targetHeight = 1920;
  let displayAspectRatio = '9/16';
  const outputRatio: AspectRatio = settings.outputRatio || '9:16';
  switch (outputRatio) {
    case '16:9': targetWidth = 1920; targetHeight = 1080; displayAspectRatio = '16/9'; break;
    case '9:16': targetWidth = 1080; targetHeight = 1920; displayAspectRatio = '9/16'; break;
    case '3:2': targetWidth = 1800; targetHeight = 1200; displayAspectRatio = '3/2'; break;
    case '2:3': targetWidth = 1200; targetHeight = 1800; displayAspectRatio = '2/3'; break;
  }

  // --- PARALLEL EXECUTION FLOW ---
  const handleProcessFlow = useCallback(async () => {
    // 1. Reset & Start UI Timer
    setIsProcessing(true);
    setIsFinalizing(true); 
    setError(null);
    setTimer(0);
    setResultImage(null);
    setPhotoId(null);
    
    // IMPORTANT: Do NOT reset sessionFolder to null if we already have one (from prop or previous run)
    // We only reset if we intend to create a new one, but here we want to persist if reusing.
    // However, for safety in case of full reset, we can rely on `sessionFolder` state or `existingSession` prop.
    
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setTimer(prev => prev + 1), 1000);

    try {
      // -----------------------------------------------------------
      // THREAD A (BACKGROUND): Prepare Session & Upload Original
      // -----------------------------------------------------------
      
      // Check if we already have a session (from Prop or State)
      const currentSessionId = sessionFolder?.id || existingSession?.id;
      const currentSessionUrl = sessionFolder?.url || existingSession?.url;
      const isRegeneration = !!currentSessionId;

      let sessionTask;
      
      if (currentSessionId && currentSessionUrl) {
           // REUSE EXISTING SESSION
           console.log("♻️ Reusing existing session:", currentSessionId);
           sessionTask = Promise.resolve({ ok: true, folderId: currentSessionId, folderUrl: currentSessionUrl });
      } else {
           // CREATE NEW SESSION
           sessionTask = createSessionFolder().then(res => {
              if (res.ok && res.folderId) {
                  console.log("✅ Background: Session Folder Created");
                  setSessionFolder({ id: res.folderId, url: res.folderUrl! });
              }
              return res;
           });
      }

      // Upload Original ONLY if it's a new session. 
      // If regenerating, the original is already in the original_folder (if configured) or irrelevant for this specific output.
      // However, to be safe and ensure "originalId" exists for this specific run record, we can skip or upload.
      // Optimization: Skip original upload on regeneration to save time/bandwidth.
      const originalUploadTask = (!isRegeneration && settings.originalFolderId) 
        ? uploadToDrive(capturedImage, {
             conceptName: "ORIGINAL_CAPTURE",
             eventName: settings.eventName,
             eventId: settings.activeEventId,
             folderId: settings.originalFolderId,
             skipGallery: true 
          }).then(res => {
             console.log("✅ Background: Original Photo Uploaded");
             return res;
          })
        : Promise.resolve({ ok: true, id: null });

      // -----------------------------------------------------------
      // THREAD B (VISUAL PRIORITY): Generate AI & Overlay
      // -----------------------------------------------------------
      setProgress(currentQuality ? "GENERATING ULTRA QUALITY (SLOW)..." : "GENERATING AI VISUALS...");
      
      // Pass currentQuality flag to generator
      const aiOutput = await generateAIImage(capturedImage, concept.prompt, outputRatio, currentQuality);

      setProgress("APPLYING FINAL TOUCHES...");
      const finalImage = await applyOverlay(aiOutput, settings.overlayImage, targetWidth, targetHeight);
      
      // -----------------------------------------------------------
      // CRITICAL: TAMPILKAN HASIL SEGERA
      // -----------------------------------------------------------
      setResultImage(finalImage);
      setIsProcessing(false); // Matikan loading screen
      if (timerRef.current) clearInterval(timerRef.current);

      // -----------------------------------------------------------
      // THREAD C (SYNC & FINALIZE): Upload Hasil Akhir
      // -----------------------------------------------------------
      const sessionRes = await sessionTask;
      const originalRes = await originalUploadTask;

      if (!sessionRes.ok || !sessionRes.folderId) {
          throw new Error("Gagal membuat/akses folder sesi.");
      }

      // Upload Foto AI Final ke Folder Sesi yang (Baru atau Lama)
      const uploadRes = await uploadToDrive(finalImage, {
          conceptName: concept.name,
          eventName: settings.eventName,
          eventId: settings.activeEventId,
          folderId: sessionRes.folderId, 
          originalId: originalRes.id,
          sessionFolderId: sessionRes.folderId,
          sessionFolderUrl: sessionRes.folderUrl
      });

      if (uploadRes.ok) {
        setPhotoId(uploadRes.id);
      }
      
      setIsFinalizing(false); // Buka tombol Video/QR sepenuhnya

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Processing Failed");
      setIsProcessing(false);
      setIsFinalizing(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [capturedImage, concept, settings, outputRatio, currentQuality, existingSession]); // Depend on existingSession

  useEffect(() => {
    handleProcessFlow();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [handleProcessFlow]); 

  // --- ASYNC VIDEO TRIGGER ---
  const handleGenerateVideo = async () => {
    if (!photoId || !sessionFolder) return;
    setIsVideoRequested(true);

    // Call Backend (Fire & Forget/Queue)
    try {
       fetch('/api/video/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             driveFileId: photoId,
             sessionFolderId: sessionFolder.id,
             prompt: settings.videoPrompt,
             resolution: settings.videoResolution || '480p', // Pass Resolution setting
             model: settings.videoModel || 'seedance-1-0-pro-fast-251015' // Pass Model setting
          })
       }); 
    } catch(e) { console.error("Video start trigger failed", e); }

    // Start 3s Redirect Timer
    let countdown = 3;
    setVideoRedirectTimer(countdown);
    const intv = setInterval(() => {
       countdown--;
       setVideoRedirectTimer(countdown);
       if (countdown <= 0) {
          clearInterval(intv);
          onDone();
       }
    }, 1000);
  };

  const handleRegenerateClick = () => {
      setPendingQuality(currentQuality); // Init checkbox state
      setShowConceptSelector(true);
  };
  
  const executeRegeneration = () => {
    if (selectedRegenConcept) {
        setCurrentQuality(pendingQuality); // Apply selected quality
        setConcept(selectedRegenConcept);
        setShowConceptSelector(false);
        // This triggers useEffect -> handleProcessFlow (because concept/quality changes)
    }
  };

  if (isProcessing) {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center relative p-6 text-center overflow-hidden bg-black/90 backdrop-blur-md">
        <div className="absolute inset-0 z-0 flex items-center justify-center p-4">
          <img src={capturedImage} className="max-w-full max-h-full object-contain opacity-50 blur-lg" alt="Preview" />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative w-40 h-40 md:w-64 md:h-64 mb-8 shrink-0">
             <div className="absolute inset-0 border-[6px] border-white/5 rounded-full" />
             <div className="absolute inset-0 border-[6px] border-t-purple-500 rounded-full animate-spin shadow-[0_0_30px_rgba(188,19,254,0.4)]" />
             <div className="absolute inset-0 flex items-center justify-center flex-col">
               <span className="text-[10px] tracking-[0.3em] text-purple-400 font-bold mb-1 uppercase italic">Processing</span>
               <span className="text-3xl md:text-5xl font-heading text-white italic">{timer}S</span>
             </div>
          </div>
          <div className="max-w-md bg-black/40 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl">
            <h2 className="text-xl md:text-2xl font-heading mb-3 neon-text italic uppercase tracking-tighter">{progress}</h2>
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mb-3">
              <div className="bg-purple-500 h-full animate-[progress_10s_ease-in-out_infinite]" style={{width: '60%'}} />
            </div>
            {timer > 2 && !existingSession && (
               <p className="text-[8px] text-gray-500 uppercase tracking-widest animate-pulse">
                  Background tasks: Creating Session & Uploading Original...
               </p>
            )}
             {timer > 2 && existingSession && (
               <p className="text-[8px] text-green-500 uppercase tracking-widest animate-pulse">
                  ♻️ REGENERATING IN CURRENT SESSION
               </p>
            )}
            {currentQuality && (
               <div className="mt-2 bg-purple-900/30 border border-purple-500/30 rounded px-2 py-1 inline-block">
                  <p className="text-[8px] text-purple-200 uppercase tracking-widest font-bold">✨ ULTRA QUALITY ENABLED</p>
               </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- VIDEO REQUEST MODAL ---
  if (isVideoRequested) {
    return (
      <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-black/90 p-8 text-center animate-[fadeIn_0.5s] backdrop-blur-xl">
          <div className="w-24 h-24 mb-6 rounded-full border-4 border-purple-500/50 flex items-center justify-center bg-purple-900/20 shadow-[0_0_50px_rgba(168,85,247,0.3)]">
             <svg className="w-12 h-12 text-purple-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <h1 className="text-3xl md:text-5xl font-heading text-white italic uppercase tracking-tighter mb-4">
             VIDEO PROCESSING
          </h1>
          <p className="text-white/60 font-mono text-sm tracking-widest uppercase mb-8 max-w-lg leading-relaxed">
             Your video is being rendered in the background. Please visit the preview booth to see the result.
          </p>
          <div className="text-purple-400 font-bold tracking-[0.2em] text-xs">
             REDIRECTING IN {videoRedirectTimer}...
          </div>
      </div>
    );
  }

  if (error) {
     return (
       <div className="w-full h-[100dvh] flex flex-col items-center justify-center bg-transparent text-center">
         <h2 className="text-red-500 text-2xl font-heading mb-4">ERROR</h2>
         <p className="text-gray-500 mb-8">{error}</p>
         <button onClick={handleProcessFlow} className="px-8 py-3 bg-white text-black font-heading uppercase">RETRY</button>
       </div>
     )
  }

  return (
    <div className="w-full h-[100dvh] flex flex-col bg-transparent overflow-hidden relative font-sans">
      <div className="relative z-10 w-full h-full flex flex-col items-center p-4 md:p-6 gap-6">
         
         {/* Media Preview */}
         <div className="flex-1 w-full min-h-0 flex items-center justify-center">
            <div className="relative border-4 border-white/5 shadow-2xl bg-black/50 backdrop-blur-sm rounded-xl overflow-hidden" style={{ aspectRatio: displayAspectRatio, maxHeight: '100%', maxWidth: '100%' }}>
                <img 
                   src={viewMode === 'result' ? resultImage! : capturedImage} 
                   className="w-full h-full object-cover" 
                />
                
                {/* View Mode Toggle */}
                <div className="absolute top-4 right-4 z-40">
                    <button 
                      onClick={() => setViewMode(prev => prev === 'result' ? 'original' : 'result')}
                      className={`backdrop-blur border px-4 py-2 rounded-full font-bold text-[10px] uppercase tracking-widest transition-all ${viewMode === 'result' ? 'bg-purple-900/50 border-purple-500 text-purple-200' : 'bg-green-900/50 border-green-500 text-green-200'}`}
                    >
                      {viewMode === 'result' ? '👁 VIEW ORIGINAL' : '✨ VIEW RESULT'}
                    </button>
                </div>

                {/* Main Action Bar */}
                <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-3 z-30 px-2 flex-wrap">
                   {/* QR BUTTON */}
                   <button 
                      onClick={() => setShowQR(true)} 
                      disabled={!sessionFolder}
                      className={`backdrop-blur-md border px-5 py-4 rounded-full font-heading text-[10px] tracking-[0.2em] uppercase italic flex items-center gap-2 transition-all ${!sessionFolder ? 'bg-gray-800/50 border-gray-600 text-gray-400 cursor-wait' : 'bg-purple-900/30 border-purple-500/50 text-purple-100 hover:bg-purple-600/40'}`}
                   >
                      {!sessionFolder ? (
                        <>
                          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                          SAVING DATA...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zm-6 0H6.4M6 20h2v-4H6v4zm0-6h2v-4H6v4zm6 0h2v-4h-2v4z" /></svg>
                          SESSION QR
                        </>
                      )}
                   </button>

                   <button onClick={handleRegenerateClick} className="backdrop-blur-md bg-orange-900/30 border border-orange-500/50 text-orange-100 px-5 py-4 rounded-full font-heading text-[10px] tracking-[0.2em] uppercase italic flex items-center gap-2">
                      REGENERATE
                   </button>
                   
                   {/* GENERATE VIDEO BUTTON */}
                   {settings.boothMode === 'video' && (
                      <button 
                          onClick={handleGenerateVideo} 
                          disabled={!photoId}
                          className={`backdrop-blur-md border px-5 py-4 rounded-full font-heading text-[10px] tracking-[0.2em] uppercase italic flex items-center gap-2 shadow-[0_0_20px_rgba(37,99,235,0.4)] ${!photoId ? 'bg-gray-800/50 border-gray-600 text-gray-400 cursor-wait' : 'bg-blue-900/30 border-blue-500/50 text-blue-100 hover:bg-blue-600/40 animate-pulse'}`}
                      >
                         {!photoId ? (
                            <>
                               <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"/>
                               SYNCING...
                            </>
                         ) : (
                            <>
                               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                               GENERATE VIDEO
                            </>
                         )}
                      </button>
                   )}
                </div>
            </div>
         </div>
         
         {/* Footer / Reset */}
         <div className="relative z-10 flex flex-col items-center gap-2 pb-6">
             <button onClick={onDone} className="text-gray-500 hover:text-white uppercase tracking-widest text-xs transition-colors flex items-center gap-2">
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                 Start Over
             </button>
         </div>

      </div>

      {/* Concept Selector Modal */}
      {showConceptSelector && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-[fadeIn_0.2s]">
             <div className="bg-[#0a0a0a] border border-white/10 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl relative">
                 <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/50">
                    <h2 className="text-xl font-heading text-white neon-text uppercase italic">Select New Concept</h2>
                    <button onClick={() => setShowConceptSelector(false)} className="text-white/50 hover:text-white">✕</button>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                    {concepts.map(c => (
                      <div 
                        key={c.id} 
                        onClick={() => setSelectedRegenConcept(c)} 
                        className={`relative group cursor-pointer rounded-lg overflow-hidden border transition-all ${selectedRegenConcept?.id === c.id ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-white/10 hover:border-purple-500'}`}
                      >
                         <img src={c.thumbnail} className="w-full h-40 object-cover transition-transform group-hover:scale-105" />
                         {selectedRegenConcept?.id === c.id && (
                             <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                                 <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
                                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                 </div>
                             </div>
                         )}
                         <div className="absolute bottom-0 inset-x-0 bg-black/80 p-2 text-center">
                             <p className="text-[10px] text-white font-bold uppercase truncate">{c.name}</p>
                         </div>
                      </div>
                    ))}
                 </div>

                 <div className="p-6 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 bg-black/50">
                    {/* QUALITY CHECKBOX */}
                    <label className="flex items-center gap-3 cursor-pointer group select-none">
                       <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${pendingQuality ? 'bg-purple-600 border-purple-500' : 'bg-black/50 border-white/20 group-hover:border-purple-400'}`}>
                           {pendingQuality && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                       </div>
                       <input type="checkbox" className="hidden" checked={pendingQuality} onChange={e => setPendingQuality(e.target.checked)} />
                       <div className="flex flex-col">
                          <span className={`text-xs font-bold uppercase tracking-widest ${pendingQuality ? 'text-purple-300' : 'text-gray-400 group-hover:text-white'}`}>USE ULTRA QUALITY</span>
                          <span className="text-[8px] text-gray-500">Warning: Slower generation time</span>
                       </div>
                    </label>

                    <div className="flex gap-4">
                        <button onClick={() => setShowConceptSelector(false)} className="px-6 py-3 rounded-lg text-white/50 hover:text-white text-xs font-bold uppercase tracking-widest">Cancel</button>
                        <button 
                            onClick={executeRegeneration}
                            disabled={!selectedRegenConcept}
                            className="px-8 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-heading text-xs tracking-widest uppercase rounded shadow-[0_0_20px_rgba(234,88,12,0.3)] transition-all"
                        >
                            Confirm Regenerate
                        </button>
                    </div>
                 </div>
             </div>
         </div>
      )}

      {/* FUTURISTIC QR MODAL - RESIZED & FIXED Z-INDEX */}
      {showQR && sessionFolder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-[fadeIn_0.3s]" onClick={() => setShowQR(false)}>
            <div className="relative bg-[#050505]/95 border border-purple-500/50 p-6 rounded-2xl flex flex-col items-center gap-4 max-w-[280px] w-full shadow-[0_0_80px_rgba(168,85,247,0.4)] backdrop-blur-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Animated Scan Line */}
                <div className="absolute top-0 left-0 w-full h-1 bg-purple-400/50 shadow-[0_0_10px_#a855f7] animate-[scan_2s_linear_infinite] z-20 pointer-events-none opacity-70" />
                
                {/* Header */}
                <div className="flex flex-col items-center z-10 w-full">
                  <h3 className="text-white font-heading text-xs tracking-[0.3em] uppercase neon-text">Neural Link</h3>
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-purple-500 to-transparent mt-2 opacity-50"/>
                </div>

                {/* QR Container with HUD Corners */}
                <div className="relative p-3 bg-white rounded-xl z-10 shadow-inner mt-1">
                  {/* HUD Corners */}
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-purple-500" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-purple-500" />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-purple-500" />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-purple-500" />
                  
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(sessionFolder.url)}`} className="w-32 h-32 object-contain mix-blend-multiply" />
                </div>
                
                {/* Footer */}
                <div className="text-center z-10 mt-1">
                  <p className="text-purple-300 text-[9px] font-mono tracking-widest uppercase mb-1">SCAN_TO_DOWNLOAD</p>
                  <p className="text-gray-500 text-[7px] uppercase tracking-widest">SECURE_CONNECTION_ESTABLISHED</p>
                </div>
                
                <button onClick={() => setShowQR(false)} className="mt-2 w-full py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold uppercase text-[9px] tracking-[0.2em] rounded transition-colors z-10">
                  CLOSE
                </button>
            </div>
            <style>{`
              @keyframes scan {
                0% { top: 0%; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
              }
            `}</style>
          </div>
      )}

      <style>{`
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default ResultPage;
