
import React, { useEffect, useState, useRef } from 'react';
import { GalleryItem, Concept, PhotoboothSettings, ProcessNotification } from '../types';
import { fetchGallery, fetchImageBase64, deletePhotoFromGas, deleteAllPhotosFromGas } from '../lib/appsScript';

interface GalleryPageProps {
  onBack: () => void;
  activeEventId?: string;
  onRegenerate: (image: string, concept: Concept, useUltra: boolean, sessionData?: {id: string, url: string}) => void;
  concepts: Concept[];
  settings?: PhotoboothSettings;
  notifications?: ProcessNotification[]; 
  cachedItems: GalleryItem[]; // Receive cache
  onUpdateCache: (items: GalleryItem[]) => void; // Update cache fn
}

// Helper: Get Image URL
const getImageUrl = (item: GalleryItem) => {
  if (item.imageUrl && item.imageUrl.startsWith('http')) {
     if (item.imageUrl.includes('lh3.googleusercontent.com')) {
       return `https://drive.google.com/thumbnail?id=${item.id}&sz=w600`;
     }
     return item.imageUrl;
  }
  return `https://drive.google.com/thumbnail?id=${item.id}&sz=w600`;
};

// Sub-Component untuk menangani Loading State per Gambar
const GalleryThumb: React.FC<{ 
    item: GalleryItem; 
    settings?: PhotoboothSettings; 
    onClick: (item: GalleryItem) => void; 
}> = ({ item, settings, onClick }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const isVideoMode = settings?.boothMode === 'video';
    
    // Logic update: 'ready_url' is considered done for UI purposes
    const isVideoReady = item.videoStatus === 'done' || item.videoStatus === 'ready_url';

    return (
        <div 
            onClick={() => onClick(item)} 
            className={`group relative aspect-[9/16] overflow-hidden bg-white/5 border border-white/10 cursor-pointer transition-all duration-300 rounded-lg backdrop-blur-sm
            ${item.videoStatus === 'processing' ? 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 
              isVideoReady ? 'border-green-500/30 hover:border-green-400 shadow-[0_0_5px_rgba(34,197,94,0.2)] hover:shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 
              'hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]'}`}
        >
            
            {/* 1. LOADING PLACEHOLDER */}
            {!imageLoaded && (
                <div className="absolute inset-0 z-10 bg-black/60 flex flex-col items-center justify-center animate-pulse">
                     <div className="w-8 h-8 border-2 border-purple-500/50 border-t-purple-500 rounded-full animate-spin mb-2"/>
                     <span className="text-[8px] text-purple-400 font-mono tracking-widest uppercase">DOWNLOADING...</span>
                </div>
            )}

            {/* 2. IMAGE */}
            <img 
                src={getImageUrl(item)} 
                alt={item.conceptName} 
                loading="lazy" 
                onLoad={() => setImageLoaded(true)}
                className={`w-full h-full object-cover transition-all duration-1000 group-hover:scale-110 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} 
            />

            {/* 3. VIDEO STATUS INDICATOR (LOG VISUAL) */}
            {isVideoMode && (
                <>
                    {/* Status Badge (Top Right) */}
                    <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
                        {isVideoReady && (
                            <div className="bg-green-600/90 backdrop-blur text-white text-[8px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1 border border-green-400/50">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                <span>VIDEO READY</span>
                            </div>
                        )}
                        {(item.videoStatus === 'processing' || item.videoStatus === 'queued') && (
                             <div className="bg-blue-600/90 backdrop-blur text-white text-[8px] font-bold px-2 py-1 rounded shadow-lg flex items-center gap-1 border border-blue-400/50 animate-pulse">
                                <div className="w-2 h-2 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                                <span>{item.videoStatus === 'queued' ? 'QUEUED' : 'RENDERING'}</span>
                             </div>
                        )}
                         {item.videoStatus === 'failed' && (
                             <div className="bg-red-600/90 backdrop-blur text-white text-[8px] font-bold px-2 py-1 rounded shadow-lg border border-red-400/50">
                                VIDEO FAILED
                             </div>
                        )}
                    </div>

                    {/* Footer Gradient */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-3 pt-8 pointer-events-none">
                        {isVideoReady ? (
                            <div className="h-0.5 w-full bg-green-500 shadow-[0_0_10px_#22c55e]" />
                        ) : (item.videoStatus === 'processing' || item.videoStatus === 'queued') ? (
                            <div className="w-full bg-blue-900/50 h-0.5 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-400 animate-[progress_2s_ease-in-out_infinite]" style={{ width: '50%' }}/>
                            </div>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
};

const GalleryPage: React.FC<GalleryPageProps> = ({ 
    onBack, 
    activeEventId, 
    onRegenerate, 
    concepts, 
    settings, 
    notifications = [],
    cachedItems,
    onUpdateCache
}) => {
  const [items, setItems] = useState<GalleryItem[]>(cachedItems);
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(cachedItems.length === 0);
  const [viewMode, setViewMode] = useState<'result' | 'original' | 'video'>('result');
  const [showConceptSelector, setShowConceptSelector] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [useUltraQuality, setUseUltraQuality] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearPin, setClearPin] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
     loadGallery();
     const pollIntv = setInterval(loadGallery, 5000); 

     // Only poll tick if boothMode is video
     let tickIntv: ReturnType<typeof setInterval> | null = null;
     if (settings?.boothMode === 'video') {
         fetch('/api/video/tick').catch(err => console.error("Initial Tick failed", err));
         tickIntv = setInterval(() => {
             fetch('/api/video/tick').catch(err => console.error("Tick failed", err));
         }, 5000);
     }

     return () => { 
        clearInterval(pollIntv); 
        if (tickIntv) clearInterval(tickIntv);
     };
  }, [activeEventId, settings?.boothMode]);

  const loadGallery = async () => {
    try {
      const data = await fetchGallery(activeEventId);
      // Filter items: Don't hide video items that are 'ready_url'
      const filteredItems = data.filter(i => i.type !== 'video' || i.videoStatus === 'done' || i.videoStatus === 'ready_url');
      setItems(filteredItems);
      onUpdateCache(filteredItems);
      setLoading(false);
    } catch (err) { console.error(err); }
  };

  const confirmDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!selectedItem || isDeleting) return;
      setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
      if (!selectedItem) return;
      setIsDeleting(true);
      setShowDeleteConfirm(false); 

      const prevItems = items;
      const idToDelete = selectedItem.id;
      
      const newItems = prevItems.filter(i => i.id !== idToDelete);
      setItems(newItems);
      onUpdateCache(newItems); 
      setSelectedItem(null); 

      try {
          const res = await deletePhotoFromGas(idToDelete, settings?.adminPin || "0000");
          if (!res.ok) throw new Error(res.error || "Failed to delete");
      } catch (err: any) {
          console.error(err);
          alert(`Gagal menghapus foto. Error: ${err.message}`);
          setItems(prevItems); 
          onUpdateCache(prevItems); 
      } finally {
          setIsDeleting(false);
      }
  };

  const handleClearClick = () => {
      setShowClearDialog(true);
      setClearPin('');
  };

  const executeClearGallery = async () => {
      if (String(clearPin) !== String(settings?.adminPin)) {
          alert("PIN INVALID!");
          return;
      }
      setIsClearing(true);
      try {
          await deleteAllPhotosFromGas(clearPin);
          setItems([]);
          onUpdateCache([]);
          setShowClearDialog(false);
      } catch (err) {
          console.error(err);
          alert("Failed to clear gallery.");
      } finally {
          setIsClearing(false);
      }
  };

  const handleGenerateVideoFromGallery = async () => {
      if (!selectedItem || !selectedItem.sessionFolderId) {
          alert("Session data incomplete. Cannot generate video.");
          return;
      }
      setIsGeneratingVideo(true);
      try {
         const res = await fetch('/api/video/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               driveFileId: selectedItem.id,
               sessionFolderId: selectedItem.sessionFolderId,
               prompt: settings?.videoPrompt
            })
         });
         
         const data = await res.json();
         if (res.ok) {
             const updateQueued = (current: GalleryItem) => 
                current.id === selectedItem.id ? { ...current, videoStatus: 'queued' as const } : current;
             setSelectedItem(prev => prev ? updateQueued(prev) : null);
             const updatedList = items.map(updateQueued);
             setItems(updatedList);
             onUpdateCache(updatedList);
         } else {
             alert(`Failed to start video: ${data.error}`);
         }
      } catch(e) {
         console.error(e);
         alert("Error starting video generation.");
      } finally {
         setIsGeneratingVideo(false);
      }
  };

  const getHighResUrl = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1200`;
  const getOriginalUrl = (id: string) => `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
  
  // Logic updated: Prioritize providerUrl for instant playback
  const getVideoPlayUrl = (item: GalleryItem) => {
    if (item.providerUrl) {
        // Use proxy to avoid CORS/Headers issues with provider URL
        return `/api/video/proxy?url=${encodeURIComponent(item.providerUrl)}`;
    }
    if (item.videoFileId) {
        const targetUrl = `https://drive.google.com/uc?export=download&id=${item.videoFileId}`;
        return `/api/video/proxy?url=${encodeURIComponent(targetUrl)}`;
    }
    return '';
  };

  const getQRLink = (item: GalleryItem) => {
     return item.sessionFolderUrl || item.downloadUrl;
  };

  const handleItemClick = (item: GalleryItem) => {
      setSelectedItem(item);
      setViewMode('result'); 
      setShowConceptSelector(false);
      setShowQRModal(false);
  };

  const handleConceptSelect = async (concept: Concept) => {
      if (!selectedItem || !selectedItem.originalId) return;
      setIsRegenerating(true);
      try {
          const base64 = await fetchImageBase64(selectedItem.originalId);
          if (base64) {
             const sessionData = (selectedItem.sessionFolderId && selectedItem.sessionFolderUrl) 
                ? { id: selectedItem.sessionFolderId, url: selectedItem.sessionFolderUrl }
                : undefined;
             onRegenerate(base64, concept, useUltraQuality, sessionData);
          } else {
             alert("Gagal mengambil foto original. Silakan coba lagi.");
             setIsRegenerating(false);
          }
      } catch(e) {
          console.error(e);
          alert("Terjadi kesalahan saat memproses regenerasi.");
          setIsRegenerating(false);
      }
  };

  const handleOpenRegenModal = () => {
      setUseUltraQuality(false); 
      setShowConceptSelector(true);
  };

  const processingItems = notifications.filter(n => n.status === 'processing');
  
  // Is Video considered ready? (Includes ready_url for instant playback)
  const isSelectedVideoReady = selectedItem && (selectedItem.videoStatus === 'done' || selectedItem.videoStatus === 'ready_url');

  return (
    <div className="w-full min-h-screen flex flex-col p-6 md:p-12 bg-transparent overflow-y-auto font-sans">
      <div className="flex flex-col md:flex-row justify-between items-center w-full mb-8 max-w-7xl mx-auto gap-6 shrink-0 relative">
        <button onClick={onBack} className="text-white flex items-center gap-3 hover:text-purple-400 uppercase tracking-[0.3em] font-bold transition-all group shrink-0 bg-black/20 backdrop-blur px-4 py-2 rounded-lg">
          <svg className="w-6 h-6 transform group-hover:-translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          BACK
        </button>
        <h2 className="text-3xl md:text-5xl font-heading text-white neon-text italic uppercase tracking-tighter text-center bg-black/20 backdrop-blur-sm px-6 py-2 rounded-lg">PHOTO GALLERY</h2>
        <button onClick={handleClearClick} className="flex items-center gap-2 text-red-500 hover:text-red-400 uppercase tracking-widest font-bold text-xs transition-all border border-red-900/30 px-4 py-2 rounded-lg bg-red-900/10 hover:bg-red-900/30 shrink-0 backdrop-blur-md">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            <span className="hidden md:inline">CLEAR GALLERY</span>
        </button>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full px-2">
        {loading && items.length === 0 && processingItems.length === 0 ? (
          <div className="flex justify-center mt-20"><div className="w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent"/></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-32 animate-[popIn_0.5s_ease-out]">
            {processingItems.map((n) => (
               <div key={`ghost-${n.id}`} className="aspect-[9/16] bg-black/40 backdrop-blur-md border-2 border-dashed border-white/20 rounded-lg overflow-hidden flex flex-col items-center justify-center p-4 relative animate-pulse shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                   <div className="w-12 h-12 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mb-4" />
                   <p className="text-white text-[10px] font-heading tracking-widest text-center uppercase animate-pulse">PHOTO PROCESSING</p>
                   <p className="text-purple-400 text-[8px] font-mono mt-2 text-center uppercase tracking-wider">{n.conceptName}</p>
               </div>
            ))}
            {items.map((item, idx) => (
              <GalleryThumb key={item.id || idx} item={item} settings={settings} onClick={handleItemClick} />
            ))}
          </div>
        )}
      </div>

      {showClearDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 animate-[fadeIn_0.2s]">
              <div className="bg-[#0a0a0a] border border-red-500/30 rounded-xl p-8 max-w-sm w-full flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]">
                  <div className="w-16 h-16 rounded-full bg-red-900/20 flex items-center justify-center border-2 border-red-500 text-red-500 mb-2">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <div className="text-center"><h3 className="text-xl font-heading text-red-500 uppercase tracking-widest">SECURITY CHECK</h3></div>
                  <input type="password" className="w-full bg-black border-2 border-white/10 p-4 text-center text-2xl text-white tracking-[0.5em] focus:border-red-500 outline-none rounded-lg" placeholder="PIN" value={clearPin} onChange={(e) => setClearPin(e.target.value)} maxLength={8} />
                  <div className="flex flex-col gap-3 w-full">
                      <button onClick={executeClearGallery} disabled={isClearing} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-widest rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">{isClearing ? 'DELETING...' : 'CONFIRM PURGE'}</button>
                      <button onClick={() => setShowClearDialog(false)} disabled={isClearing} className="w-full py-4 bg-white/5 hover:bg-white/10 text-gray-400 font-bold uppercase tracking-widest rounded-lg transition-all">CANCEL</button>
                  </div>
              </div>
          </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-[fadeIn_0.2s]" onClick={() => setShowDeleteConfirm(false)}>
            <div className="bg-[#0a0a0a] border border-red-500/50 rounded-xl p-6 max-w-sm w-full shadow-[0_0_30px_rgba(239,68,68,0.3)] relative" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col items-center gap-4 text-center">
                    <h3 className="text-xl font-heading text-red-500 uppercase italic tracking-widest">DELETE PHOTO?</h3>
                    <div className="flex gap-4 w-full mt-4">
                        <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white font-bold uppercase tracking-widest text-[10px] rounded transition-colors border border-white/10">Cancel</button>
                        <button onClick={executeDelete} className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-widest text-[10px] rounded transition-colors shadow-lg">Confirm Delete</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-4 md:p-8 animate-[fadeIn_0.2s]" onClick={() => !showConceptSelector && !showQRModal && !showDeleteConfirm && setSelectedItem(null)}>
           <div className="relative w-full h-full max-w-6xl max-h-[90vh] flex flex-col bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
               <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center bg-black">
                  {viewMode === 'result' && <img src={getHighResUrl(selectedItem.id)} className="w-full h-full object-contain" />}
                  {viewMode === 'original' && selectedItem.originalId && <img src={getOriginalUrl(selectedItem.originalId)} className="w-full h-full object-contain" />}
                  
                  {/* VIDEO PLAYER */}
                  {viewMode === 'video' && (selectedItem.videoFileId || selectedItem.providerUrl) && (
                      <video 
                        src={getVideoPlayUrl(selectedItem)} 
                        controls 
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                        preload="auto"
                        className="w-full h-full object-contain" 
                      />
                  )}

                  {viewMode === 'result' && (selectedItem.videoStatus === 'processing' || selectedItem.videoStatus === 'queued') && settings?.boothMode === 'video' && (
                      <div className="absolute top-24 left-6 bg-blue-900/80 backdrop-blur px-6 py-3 rounded-full border border-blue-500/30 flex items-center gap-3 z-30 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                         <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)]"/>
                         <span className="text-xs md:text-sm text-white font-bold uppercase tracking-[0.2em] animate-pulse">{selectedItem.videoStatus === 'queued' ? 'Video Queued...' : 'Video Rendering...'}</span>
                      </div>
                  )}

                  <div className="absolute top-0 left-0 w-full p-6 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start z-30 pointer-events-none">
                      <div className="pointer-events-auto"><p className="text-gray-400 text-xs uppercase font-mono tracking-widest mt-1">{new Date(selectedItem.createdAt).toLocaleString()}</p></div>
                      <button onClick={() => setSelectedItem(null)} className="pointer-events-auto text-white/70 hover:text-white bg-black/20 hover:bg-red-500/20 rounded-full p-2 transition-all backdrop-blur-md border border-white/10">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>

                  <div className="absolute bottom-0 left-0 w-full p-6 pt-12 bg-gradient-to-t from-black/90 via-black/60 to-transparent z-30 flex flex-col gap-4">
                      <div className="flex flex-wrap items-center justify-center md:justify-between gap-4 w-full">
                          <div className="flex gap-3">
                              <button onClick={confirmDelete} disabled={isDeleting} className="flex items-center justify-center w-12 h-12 md:w-auto md:px-6 md:py-4 bg-red-900/20 hover:bg-red-900/40 border border-red-500/30 rounded-xl backdrop-blur-md transition-all text-red-400 hover:text-red-200 text-xs font-bold uppercase tracking-widest shadow-lg disabled:opacity-50 disabled:cursor-wait">
                                  {isDeleting ? <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin"/> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                              </button>
                              <button onClick={() => setShowQRModal(true)} className="flex items-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl backdrop-blur-md transition-all text-white text-xs font-bold uppercase tracking-widest shadow-lg">
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zm-6 0H6.4M6 20h2v-4H6v4zm0-6h2v-4H6v4zm6 0h2v-4h-2v4z" /></svg>QR CODE
                              </button>
                              {selectedItem.originalId && <button onClick={handleOpenRegenModal} className="flex items-center gap-2 px-6 py-4 bg-orange-900/40 hover:bg-orange-800/60 border border-orange-500/30 rounded-xl backdrop-blur-md transition-all text-orange-200 text-xs font-bold uppercase tracking-widest shadow-lg">
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>REGENERATE
                              </button>}
                          </div>
                          <div className="flex bg-black/40 backdrop-blur-md rounded-xl p-1.5 border border-white/10 shadow-lg">
                              <button onClick={() => setViewMode('result')} className={`px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'result' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>RESULT</button>
                              {selectedItem.originalId && <button onClick={() => setViewMode('original')} className={`px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'original' ? 'bg-green-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>ORIGINAL</button>}
                              {settings?.boothMode === 'video' && (
                                  <>
                                      {isSelectedVideoReady && (selectedItem.videoFileId || selectedItem.providerUrl) && (
                                          <button onClick={() => setViewMode('video')} className={`flex items-center gap-2 px-6 py-3 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${viewMode === 'video' ? 'bg-blue-600 text-white shadow-lg' : 'text-blue-400 hover:text-blue-200'}`}>
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>VIEW VIDEO
                                          </button>
                                      )}
                                      {(selectedItem.videoStatus === 'processing' || selectedItem.videoStatus === 'queued') && (
                                           <button disabled className="flex items-center gap-2 px-6 py-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-blue-300/50 text-xs font-bold uppercase tracking-widest cursor-not-allowed">
                                              <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />VIDEO ON PROCESS
                                          </button>
                                      )}
                                      {(!selectedItem.videoStatus || selectedItem.videoStatus === 'idle') && (
                                          <button onClick={handleGenerateVideoFromGallery} disabled={isGeneratingVideo} className="flex items-center gap-2 px-6 py-3 bg-blue-900/30 hover:bg-blue-800/50 border border-blue-500/30 rounded-lg text-blue-200 text-xs font-bold uppercase tracking-widest transition-all animate-pulse">
                                              {isGeneratingVideo ? <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}GENERATE VIDEO
                                          </button>
                                      )}
                                  </>
                              )}
                          </div>
                      </div>
                  </div>
               </div>
           </div>
        </div>
      )}

      {showConceptSelector && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-[fadeIn_0.2s]">
             <div className="bg-[#0a0a0a] border border-white/10 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl relative">
                 <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/50">
                    <h2 className="text-xl font-heading text-white neon-text uppercase italic">Select New Concept</h2>
                    <button onClick={() => setShowConceptSelector(false)} className="text-white/50 hover:text-white">✕</button>
                 </div>
                 {isRegenerating ? (
                     <div className="flex-1 flex flex-col items-center justify-center gap-4">
                         <div className="w-12 h-12 border-4 border-purple-500 rounded-full animate-spin border-t-transparent"/>
                         <p className="text-purple-300 font-mono text-xs uppercase tracking-widest">Preparing Original Image...</p>
                     </div>
                 ) : (
                     <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                        {concepts.map(c => (
                          <div key={c.id} onClick={() => handleConceptSelect(c)} className="relative group cursor-pointer rounded-lg overflow-hidden border border-white/10 hover:border-purple-500 transition-all">
                             <img src={c.thumbnail} className="w-full h-40 object-cover transition-transform group-hover:scale-105" />
                             <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><span className="text-white font-heading text-sm uppercase">SELECT</span></div>
                             <div className="absolute bottom-0 inset-x-0 bg-black/80 p-2 text-center"><p className="text-[10px] text-white font-bold uppercase truncate">{c.name}</p></div>
                          </div>
                        ))}
                     </div>
                 )}
                 {!isRegenerating && (
                    <div className="p-6 border-t border-white/10 flex flex-col md:flex-row justify-between gap-4 bg-black/50">
                        <label className="flex items-center gap-3 cursor-pointer group select-none">
                            <div className={`w-5 h-5 border rounded flex items-center justify-center transition-all ${useUltraQuality ? 'bg-purple-600 border-purple-500' : 'bg-black/50 border-white/20 group-hover:border-purple-400'}`}>{useUltraQuality && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}</div>
                            <div className="flex flex-col"><span className={`text-xs font-bold uppercase tracking-widest ${useUltraQuality ? 'text-purple-300' : 'text-gray-400 group-hover:text-white'}`}>USE ULTRA QUALITY</span><span className="text-[8px] text-gray-500">Warning: Slower generation time</span></div>
                        </label>
                        <button onClick={() => setShowConceptSelector(false)} className="px-6 py-3 rounded-lg text-white/50 hover:text-white text-xs font-bold uppercase tracking-widest md:ml-auto">Cancel</button>
                    </div>
                 )}
             </div>
         </div>
      )}

      {showQRModal && selectedItem && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-md p-6 animate-[fadeIn_0.2s]" onClick={() => setShowQRModal(false)}>
              <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-6 max-w-sm w-full flex flex-col items-center gap-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                  <h3 className="text-xl font-heading text-white neon-text uppercase tracking-widest">SCAN TO DOWNLOAD</h3>
                  <div className="bg-white p-2 rounded-lg"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(getQRLink(selectedItem))}`} alt="QR Code" className="w-48 h-48 object-contain" /></div>
                  <p className="text-gray-500 text-xs font-mono text-center">Scan this QR code to download the image directly to your device.</p>
                  <button onClick={() => setShowQRModal(false)} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold uppercase tracking-widest rounded-lg transition-colors">CLOSE</button>
              </div>
          </div>
      )}

      <style>{`
        @keyframes progress { 0% { width: 0%; } 100% { width: 100%; } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};
export default GalleryPage;
