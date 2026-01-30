
import React, { useEffect, useState } from 'react';

interface FastThanksPageProps {
  onDone: () => void;
}

const FastThanksPage: React.FC<FastThanksPageProps> = ({ onDone }) => {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === 1) {
          clearInterval(timer);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onDone]);

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center p-6 bg-transparent relative overflow-hidden text-center backdrop-blur-sm bg-black/60">
      {/* Background Effects */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-600/20 blur-[150px] rounded-full animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center animate-[popIn_0.5s_ease-out]">
        <div className="w-24 h-24 mb-8 rounded-full border-4 border-green-500/50 flex items-center justify-center bg-green-900/20 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
           <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
        </div>

        <h1 className="text-4xl md:text-6xl font-heading font-black text-white italic uppercase tracking-tighter mb-4">
          THANK YOU
        </h1>
        
        <p className="text-purple-300 font-mono text-xs md:text-sm tracking-[0.2em] uppercase max-w-md leading-relaxed mb-8">
          Processing initiated. Please proceed to the preview booth to see your results.
        </p>

        <div className="flex flex-col items-center gap-2">
           <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white/50 animate-[progress_5s_linear]" />
           </div>
           <span className="text-[10px] text-gray-500 font-mono">Returning to menu in {countdown}s</span>
        </div>

        <button 
          onClick={onDone}
          className="mt-12 px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-heading text-xs uppercase tracking-widest transition-all rounded-lg"
        >
          RETURN NOW
        </button>
      </div>
    </div>
  );
};

export default FastThanksPage;
