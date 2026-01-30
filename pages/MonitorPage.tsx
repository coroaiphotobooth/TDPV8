
import React, { useEffect, useRef, useState } from 'react';
import { GalleryItem, MonitorTheme } from '../types';
import { fetchGallery } from '../lib/appsScript';

interface MonitorPageProps {
  onBack: () => void;
  activeEventId?: string;
  eventName?: string;
  monitorSize?: 'small' | 'medium' | 'large';
  theme?: MonitorTheme;
}

interface PhysicsItem {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  element: HTMLDivElement;
  item: GalleryItem;
  isDragging: boolean;
}

const MonitorPage: React.FC<MonitorPageProps> = ({ onBack, activeEventId, eventName, monitorSize = 'medium', theme = 'physics' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, PhysicsItem>>(new Map());
  const requestRef = useRef<number | null>(null);
  const latestIdRef = useRef<string | null>(null);
  
  const [photoItems, setPhotoItems] = useState<GalleryItem[]>([]);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // State specific for Slider Theme
  const [sliderActiveItem, setSliderActiveItem] = useState<GalleryItem | null>(null);

  // Constants for Physics
  const getDimensions = () => {
    switch(monitorSize) {
      case 'small': return { w: 150, h: 225 };
      case 'large': return { w: 400, h: 600 };
      default: return { w: 250, h: 375 }; // Medium
    }
  };
  const { w: CARD_WIDTH, h: CARD_HEIGHT } = getDimensions();
  const MAX_SPEED = 2;
  const DAMPING = 0.99; 
  const BOUNCE = 0.8; 

  // -- Data Polling --
  useEffect(() => {
    const loadData = async () => {
      try {
        const galleryItems = await fetchGallery(activeEventId);
        const photos = galleryItems.filter(item => item.type !== 'video');
        
        // Update State
        setPhotoItems(photos);

        // Slider Logic: Auto-update active item if a new photo arrives (Latest is index 0)
        if (theme === 'slider' && photos.length > 0) {
            // If current active item is not the latest one in the list, update it
            // Only update if we haven't manually selected something else, OR if it's the very first load
            if (!latestIdRef.current || latestIdRef.current !== photos[0].id) {
                 // Check if the previously tracked latest ID is still the active one (meaning user hasn't clicked away)
                 // OR if activeItem is null (first load)
                 const isViewingLatest = !sliderActiveItem || (latestIdRef.current && sliderActiveItem.id === latestIdRef.current);
                 
                 if (isViewingLatest || !sliderActiveItem) {
                     setSliderActiveItem(photos[0]);
                 }
                 latestIdRef.current = photos[0].id;
            }
        }
        
        // Physics Mode specific logic
        if (theme === 'physics') {
           photos.forEach(item => {
             if (!itemsRef.current.has(item.id) && containerRef.current) {
               createPhysicsItem(item);
             }
           });
           
           // Remove deleted items
           const currentIds = new Set(photos.map(i => i.id));
           itemsRef.current.forEach((val, key) => {
               if (!currentIds.has(key)) {
                   val.element.remove();
                   itemsRef.current.delete(key);
               }
           });
        }

      } catch (e) {
        console.error("Monitor polling error", e);
      }
    };

    loadData();
    const interval = setInterval(loadData, 10000); 
    return () => clearInterval(interval);
  }, [activeEventId, theme]); // Added sliderActiveItem to deps if needed, but handled via ref logic

  // -- Physics Engine Setup --
  const createPhysicsItem = (item: GalleryItem) => {
    if (!containerRef.current) return;

    const div = document.createElement('div');
    div.className = "absolute top-0 left-0 rounded-xl overflow-hidden border border-white/20 shadow-[0_0_15px_rgba(188,19,254,0.3)] cursor-grab active:cursor-grabbing select-none touch-none bg-black/50 backdrop-blur-sm transition-transform will-change-transform";
    div.style.width = `${CARD_WIDTH}px`;
    div.style.height = `${CARD_HEIGHT}px`;
    
    const imgUrl = item.imageUrl.includes('lh3') 
      ? `https://drive.google.com/thumbnail?id=${item.id}&sz=w600` 
      : item.imageUrl;

    div.innerHTML = `
      <div class="relative w-full h-full pointer-events-none">
        <img src="${imgUrl}" class="w-full h-full object-cover opacity-90" draggable="false" />
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
        <div class="absolute bottom-3 left-3 right-3 text-white">
           <p class="text-[10px] font-heading tracking-widest uppercase truncate">${item.conceptName}</p>
        </div>
      </div>
    `;

    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    
    const x = Math.random() * (containerW - CARD_WIDTH);
    const y = Math.random() * (containerH - CARD_HEIGHT);
    const vx = (Math.random() - 0.5) * MAX_SPEED;
    const vy = (Math.random() - 0.5) * MAX_SPEED;

    containerRef.current.appendChild(div);

    const physicsObj: PhysicsItem = {
      id: item.id,
      x, y, vx, vy,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      element: div,
      item: item,
      isDragging: false
    };

    itemsRef.current.set(item.id, physicsObj);
    attachInteractions(div, physicsObj);
  };

  const attachInteractions = (element: HTMLElement, obj: PhysicsItem) => {
    let startX = 0, startY = 0;
    let lastX = 0, lastY = 0;
    let startTime = 0;
    let velocityTrackerX = 0;
    let velocityTrackerY = 0;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      obj.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      startTime = Date.now();
      element.style.zIndex = "100";
      itemsRef.current.forEach((val) => { if(val !== obj) val.element.style.zIndex = "1"; });
      element.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!obj.isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      obj.x += dx;
      obj.y += dy;
      velocityTrackerX = dx; 
      velocityTrackerY = dy;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onUp = (e: PointerEvent) => {
      if (!obj.isDragging) return;
      obj.isDragging = false;
      element.releasePointerCapture(e.pointerId);
      const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
      const timeDiff = Date.now() - startTime;
      if (dist < 10 && timeDiff < 300) {
        setLightboxItem(obj.item);
      } else {
        obj.vx = Math.min(Math.max(velocityTrackerX * 1.5, -15), 15);
        obj.vy = Math.min(Math.max(velocityTrackerY * 1.5, -15), 15);
      }
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
  };

  const animate = () => {
    if (theme !== 'physics' || !containerRef.current) return;
    
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const items: PhysicsItem[] = Array.from(itemsRef.current.values());

    for (let i = 0; i < items.length; i++) {
      const p1 = items[i];
      if (p1.isDragging) {
        p1.element.style.transform = `translate(${p1.x}px, ${p1.y}px) scale(1.05)`;
        continue;
      }
      p1.x += p1.vx;
      p1.y += p1.vy;
      p1.vx *= DAMPING;
      p1.vy *= DAMPING;

      if (p1.x <= 0) { p1.x = 0; p1.vx *= -BOUNCE; } else if (p1.x + p1.width >= containerW) { p1.x = containerW - p1.width; p1.vx *= -BOUNCE; }
      if (p1.y <= 0) { p1.y = 0; p1.vy *= -BOUNCE; } else if (p1.y + p1.height >= containerH) { p1.y = containerH - p1.height; p1.vy *= -BOUNCE; }

      for (let j = i + 1; j < items.length; j++) {
        const p2 = items[j];
        if (p2.isDragging) continue;
        const c1x = p1.x + p1.width / 2;
        const c1y = p1.y + p1.height / 2;
        const c2x = p2.x + p2.width / 2;
        const c2y = p2.y + p2.height / 2;
        const dx = c2x - c1x;
        const dy = c2y - c1y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = p1.width * 0.9;
        if (dist < minDist && dist > 0) {
           const nx = dx / dist;
           const ny = dy / dist;
           const separation = (minDist - dist) / 2;
           p1.x -= nx * separation;
           p1.y -= ny * separation;
           p2.x += nx * separation;
           p2.y += ny * separation;
           const k = 0.5;
           p1.vx -= nx * k;
           p1.vy -= ny * k;
           p2.vx += nx * k;
           p2.vy += ny * k;
        }
      }

      if (Math.abs(p1.vx) < 0.1 && Math.abs(p1.vy) < 0.1) {
         p1.vx += (Math.random() - 0.5) * 0.2;
         p1.vy += (Math.random() - 0.5) * 0.2;
      }

      p1.element.style.transform = `translate(${p1.x}px, ${p1.y}px)`;
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (theme === 'physics') {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      // Clear container if switching away from physics
      if (containerRef.current) containerRef.current.innerHTML = '';
      itemsRef.current.clear();
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [theme]);

  // -- Utils --
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleShuffle = () => {
    if (theme !== 'physics') return;
    itemsRef.current.forEach(item => {
      item.vx = (Math.random() - 0.5) * 20;
      item.vy = (Math.random() - 0.5) * 20;
    });
  };

  const getShareUrl = (item: GalleryItem) => {
    if (item.downloadUrl && item.downloadUrl.includes('drive.google.com')) return item.downloadUrl;
    return `https://drive.google.com/file/d/${item.id}/view`;
  };

  const getHighResUrl = (item: GalleryItem) => {
     if (item.imageUrl.includes('lh3')) return `https://drive.google.com/thumbnail?id=${item.id}&sz=w1600`;
     return item.imageUrl;
  }

  return (
    <div className="fixed inset-0 w-full h-full bg-[#050505] overflow-hidden overscroll-none touch-none">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,#1a0b2e_0%,#000000_100%)]">
        <div className="absolute inset-0 opacity-30" style={{backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '50px 50px'}}></div>
      </div>

      {/* --- THEME RENDERERS --- */}
      
      {/* 1. PHYSICS MODE */}
      <div ref={containerRef} className={`absolute inset-0 z-10 overflow-hidden ${theme !== 'physics' ? 'hidden' : ''}`} />

      {/* 2. GRID MODE (3 Rows = 12 items) */}
      {theme === 'grid' && (
         <div className="absolute inset-0 z-10 p-20 flex items-center justify-center">
             <div className="grid grid-cols-4 grid-rows-3 gap-6 w-full h-full max-w-7xl">
                 {photoItems.slice(0, 12).map((item) => (
                   <div 
                      key={item.id} 
                      onClick={() => setLightboxItem(item)}
                      className="relative rounded-lg overflow-hidden border border-white/20 shadow-lg cursor-pointer hover:border-purple-500 hover:scale-105 transition-all group"
                   >
                     <img 
                       src={item.imageUrl.includes('lh3') ? `https://drive.google.com/thumbnail?id=${item.id}&sz=w600` : item.imageUrl} 
                       className="w-full h-full object-cover" 
                     />
                     <div className="absolute bottom-0 inset-x-0 p-2 bg-black/60 translate-y-full group-hover:translate-y-0 transition-transform">
                       <p className="text-[8px] text-white font-heading truncate">{item.conceptName}</p>
                     </div>
                   </div>
                 ))}
             </div>
         </div>
      )}

      {/* 3. HERO MODE (Latest 1) */}
      {theme === 'hero' && photoItems.length > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
           {/* Blurry BG */}
           <div className="absolute inset-0 z-0">
             <img src={photoItems[0].imageUrl} className="w-full h-full object-cover opacity-30 blur-xl" />
           </div>
           
           <div className="relative z-10 w-full h-full flex items-center justify-center p-8 gap-10">
              <div className="h-full max-w-[70%] border-4 border-white/10 shadow-[0_0_50px_rgba(147,51,234,0.3)] rounded-xl overflow-hidden">
                 <img src={getHighResUrl(photoItems[0])} className="h-full w-full object-contain bg-black" />
              </div>
              
              <div className="flex flex-col items-center gap-6 bg-black/40 backdrop-blur-md p-8 rounded-2xl border border-white/20">
                 <h2 className="text-3xl text-white font-heading italic uppercase">{photoItems[0].conceptName}</h2>
                 <div className="bg-white p-4 rounded-xl shadow-inner">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(getShareUrl(photoItems[0]))}`} 
                      className="w-64 h-64 object-contain"
                    />
                 </div>
                 <p className="text-white text-sm tracking-widest uppercase font-bold animate-pulse">SCAN TO DOWNLOAD</p>
              </div>
           </div>
        </div>
      )}

      {/* 4. SLIDER MODE (Single Screen Layout) */}
      {theme === 'slider' && sliderActiveItem && (
         <div className="absolute inset-0 z-10 flex flex-col">
            {/* TOP: HERO SECTION (FULL CENTRIC) */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
               {/* Ambient Background */}
               <div key={`bg-${sliderActiveItem.id}`} className="absolute inset-0 z-0 transition-opacity duration-1000">
                  <img src={sliderActiveItem.imageUrl} className="w-full h-full object-cover opacity-30 blur-3xl transform scale-125" />
                  <div className="absolute inset-0 bg-black/40" />
               </div>

               {/* Main Image Container */}
               <div key={`hero-${sliderActiveItem.id}`} className="relative z-10 h-full max-h-[85vh] aspect-[9/16] p-4 md:p-8 animate-[fadeInScale_0.5s_ease-out]">
                   <div className="relative w-full h-full rounded-2xl overflow-hidden border border-white/20 shadow-[0_0_60px_rgba(188,19,254,0.3)] bg-black">
                       <img 
                          src={getHighResUrl(sliderActiveItem)} 
                          className="w-full h-full object-contain" 
                          alt={sliderActiveItem.conceptName}
                       />

                       {/* QR Code Overlay - Inside Photo (Bottom Right) */}
                       <div className="absolute bottom-4 right-4 bg-white p-2 rounded-lg shadow-2xl z-20 animate-[popIn_0.5s_0.3s_both]">
                            <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getShareUrl(sliderActiveItem))}`} 
                              className="w-20 h-20 md:w-28 md:h-28 object-contain"
                              alt="QR"
                            />
                            <div className="text-center mt-1">
                                <p className="text-[6px] md:text-[8px] font-bold uppercase tracking-widest text-black">SCAN ME</p>
                            </div>
                       </div>

                       {/* Info Overlay - Inside Photo (Top Left) */}
                       <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent">
                           <h2 className="text-2xl md:text-4xl font-heading text-white neon-text italic uppercase tracking-tighter shadow-black drop-shadow-md">
                              {sliderActiveItem.conceptName}
                           </h2>
                            <p className="font-mono text-purple-300 text-[10px] tracking-[0.3em] uppercase mt-1">
                              {new Date(sliderActiveItem.createdAt).toLocaleTimeString()}
                            </p>
                       </div>
                   </div>
               </div>
            </div>

            {/* BOTTOM: SLIDER STRIP (SCROLLABLE) */}
            <div className="h-40 md:h-48 shrink-0 z-20 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col justify-end pb-6">
               <div className="w-full pl-6 md:pl-10">
                    <p className="text-white/50 text-[10px] uppercase tracking-widest mb-2 font-heading">Recent Generations ({photoItems.length})</p>
               </div>
               <div 
                   className="flex items-center px-6 md:px-10 gap-4 overflow-x-auto scrollbar-hide w-full pb-4 pt-2"
                   style={{ scrollBehavior: 'smooth' }}
               >
                  {photoItems.map((item) => {
                     const isActive = sliderActiveItem.id === item.id;
                     return (
                        <div 
                           key={item.id}
                           onClick={() => setSliderActiveItem(item)}
                           className={`
                             relative flex-shrink-0 w-24 h-36 md:w-32 md:h-48 rounded-lg overflow-hidden cursor-pointer transition-all duration-300 transform 
                             ${isActive ? 'scale-105 border-2 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.6)] -translate-y-2 z-10' : 'border border-white/10 opacity-60 hover:opacity-100 hover:scale-100 grayscale hover:grayscale-0'}
                           `}
                        >
                           <img 
                             src={item.imageUrl.includes('lh3') ? `https://drive.google.com/thumbnail?id=${item.id}&sz=w400` : item.imageUrl}
                             className="w-full h-full object-cover"
                             loading="lazy"
                           />
                           {isActive && (
                             <div className="absolute inset-0 bg-purple-500/10 pointer-events-none" />
                           )}
                           <div className="absolute bottom-0 inset-x-0 bg-black/60 p-1 text-center">
                              <p className="text-[8px] text-white font-heading truncate uppercase">{item.conceptName}</p>
                           </div>
                        </div>
                     )
                  })}
               </div>
            </div>
         </div>
      )}

      {/* --- UI OVERLAY (Top Bar) --- */}
      <div className="absolute top-0 left-0 p-6 z-20 flex justify-between w-full pointer-events-none">
        <div className="pointer-events-auto">
          <h1 className="text-white font-heading text-xl uppercase tracking-[0.3em] neon-text italic">
            {eventName || "CORO AI MONITOR"}
          </h1>
          <p className="text-purple-400 text-[10px] font-mono tracking-widest mt-1">
             MODE: {theme.toUpperCase()}
          </p>
        </div>
        
        <div className="flex gap-4 pointer-events-auto">
           {theme === 'physics' && (
             <button onClick={handleShuffle} className="bg-white/10 hover:bg-purple-600 text-white px-4 py-2 rounded-full text-[10px] uppercase tracking-widest backdrop-blur-md transition-colors border border-white/10">
               SHUFFLE
             </button>
           )}
           <button onClick={toggleFullscreen} className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md transition-colors border border-white/10">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
           </button>
           <button onClick={onBack} className="bg-red-900/50 hover:bg-red-800 text-white p-2 rounded-full backdrop-blur-md transition-colors border border-red-500/30">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
           </button>
        </div>
      </div>

      {/* Lightbox Overlay (Only for Physics, Grid, Hero) */}
      {lightboxItem && theme !== 'slider' && (
        <div 
          className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-8 animate-[popIn_0.2s_ease-out]"
          onClick={() => setLightboxItem(null)}
        >
          <div className="relative max-w-6xl max-h-full flex flex-col md:flex-row items-center gap-8 bg-black/50 p-6 rounded-2xl border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex-1 flex justify-center max-h-[70vh]">
              <img 
                 src={getHighResUrl(lightboxItem)}
                 className="max-w-full max-h-full rounded-lg shadow-2xl border border-white/10 object-contain"
              />
            </div>
            <div className="flex flex-col items-center justify-center text-center gap-6 min-w-[250px]">
              <div>
                <h2 className="text-xl md:text-2xl text-white font-heading uppercase italic">{lightboxItem.conceptName}</h2>
                <p className="text-purple-400 font-mono text-xs tracking-widest mt-1">{new Date(lightboxItem.createdAt).toLocaleString()}</p>
              </div>
              <div className="bg-white p-3 rounded-xl shadow-inner group">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(getShareUrl(lightboxItem))}`} 
                  alt="QR Code" 
                  className="w-40 h-40 object-contain" 
                />
              </div>
              <p className="text-white/60 text-[10px] uppercase tracking-[0.2em]">Scan to Download</p>
              <button 
                onClick={() => window.open(getShareUrl(lightboxItem), '_blank')}
                className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-heading text-xs tracking-widest uppercase rounded shadow-lg transition-all"
              >
                Open Link
              </button>
            </div>
            <button 
              onClick={() => setLightboxItem(null)}
              className="absolute -top-4 -right-4 md:-top-6 md:-right-6 bg-white text-black rounded-full w-10 h-10 flex items-center justify-center hover:scale-110 transition-transform shadow-lg z-50"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.95); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeInScale {
           0% { opacity: 0; transform: scale(0.95); }
           100% { opacity: 1; transform: scale(1); }
        }
        @keyframes slideInRight {
           0% { opacity: 0; transform: translateX(20px); }
           100% { opacity: 1; transform: translateX(0); }
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default MonitorPage;
