
import React from 'react';
import { PhotoboothSettings, ProcessNotification } from '../types';

interface LandingPageProps {
  onStart: () => void;
  onGallery: () => void;
  onAdmin: () => void;
  settings: PhotoboothSettings;
  notifications?: ProcessNotification[]; // New Prop
}

const LandingPage: React.FC<LandingPageProps> = ({ onStart, onGallery, onAdmin, settings, notifications = [] }) => {
  
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen relative p-6 md:p-10 text-center overflow-hidden">
      
      {/* Top Right Controls Group */}
      <div className="absolute top-6 right-6 z-50 flex items-center gap-6">
        <button 
          onClick={toggleFullScreen} 
          className="text-gray-500 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest"
        >
          FULL SCREEN
        </button>
        <button 
          onClick={onAdmin} 
          className="text-gray-500 hover:text-white transition-colors uppercase text-[10px] md:text-sm tracking-widest"
        >
          ADMIN
        </button>
      </div>

      <div className="relative z-10 mb-12 md:mb-16 animate-pulse px-4">
        <h1 className="text-4xl md:text-7xl font-heading font-black neon-text text-white tracking-tighter italic leading-tight mb-4 uppercase">
          {settings.eventName}
        </h1>
        <h2 className="text-sm md:text-xl tracking-[0.3em] md:tracking-[0.5em] text-purple-400 font-bold uppercase">
          {settings.eventDescription}
        </h2>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row gap-4 md:gap-8 w-full max-w-md md:max-w-none justify-center">
        <button 
          onClick={onStart}
          className="group relative px-8 md:px-12 py-5 md:py-6 bg-purple-600 hover:bg-purple-500 transition-all rounded-none font-heading text-lg md:text-2xl tracking-widest neon-border overflow-hidden"
        >
          <span className="relative z-10 italic">LAUNCH</span>
          <div className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
        </button>

        <button 
          onClick={onGallery}
          className="group relative px-8 md:px-12 py-5 md:py-6 border-2 border-white/20 hover:border-white transition-all rounded-none font-heading text-lg md:text-2xl tracking-widest overflow-hidden"
        >
          <span className="relative z-10 italic">GALLERY</span>
        </button>
      </div>

      {/* SYSTEM LOGS / NOTIFICATIONS */}
      <div className="absolute bottom-0 left-0 w-full z-20 flex flex-col items-center pb-4 pointer-events-none">
         {notifications.map(n => (
            <div key={n.id} className="mb-2 bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full flex items-center gap-3 animate-[slideInUp_0.3s_ease-out]">
                {n.status === 'processing' && <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />}
                {n.status === 'completed' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                {n.status === 'failed' && <div className="w-2 h-2 rounded-full bg-red-500" />}
                
                <span className="text-[10px] font-mono uppercase text-gray-300">
                    {n.conceptName} : <span className={n.status === 'completed' ? 'text-green-400' : n.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}>
                        {n.status === 'completed' ? 'READY IN GALLERY' : n.status.toUpperCase()}
                    </span>
                </span>
            </div>
         ))}
         
         <div className="mt-2 text-[8px] md:text-xs text-gray-500 tracking-[0.4em] uppercase opacity-50 px-4 font-mono">
            AI POWERED - COROAI.APP // 2025 GENERATIVE_SYSTEM
         </div>
      </div>
      
      <style>{`
        @keyframes slideInUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
