
import React from 'react';
import { Concept } from '../types';

interface ThemesPageProps {
  concepts: Concept[];
  onSelect: (concept: Concept) => void;
  onBack: () => void;
}

const ThemesPage: React.FC<ThemesPageProps> = ({ concepts, onSelect, onBack }) => {
  return (
    <div className="w-full min-h-screen flex flex-col items-center p-6 md:p-10 bg-transparent overflow-y-auto font-sans">
      
      {/* HEADER SECTION - Fixed at Top */}
      <div className="flex justify-between items-center w-full mb-4 max-w-6xl shrink-0 z-20">
        <button onClick={onBack} className="text-white flex items-center gap-2 hover:text-purple-400 transition-colors uppercase font-bold tracking-widest text-xs md:text-base bg-black/20 px-4 py-2 rounded-full border border-white/10 backdrop-blur-md">
          <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          BACK
        </button>
        <div className="text-center">
          <h2 className="text-xl md:text-3xl font-heading text-white neon-text italic uppercase bg-black/30 px-4 py-1 rounded-lg backdrop-blur-sm">CHOOSE CONCEPT</h2>
          <p className="text-[10px] text-purple-400 tracking-widest uppercase mt-1 drop-shadow-md">Select your transformation</p>
        </div>
        <div className="hidden md:block w-24" /> {/* Spacer to balance Back button */}
      </div>

      {/* CENTERED GRID WRAPPER - Takes remaining height and centers content */}
      <div className="flex-1 w-full max-w-6xl flex items-center justify-center py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full animate-[popIn_0.5s_ease-out]">
          {concepts.map((concept) => (
            <div 
              key={concept.id}
              onClick={() => onSelect(concept)}
              className="group relative h-[200px] md:h-[280px] cursor-pointer overflow-hidden rounded-xl border-2 border-white/10 hover:border-purple-500 transition-all duration-300 shadow-2xl hover:shadow-[0_0_30px_rgba(168,85,247,0.4)] hover:-translate-y-2 bg-black/40 backdrop-blur-sm"
            >
              <img 
                src={concept.thumbnail} 
                alt={concept.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-70 group-hover:opacity-100"
              />
              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90" />
              
              {/* Content */}
              <div className="absolute bottom-0 left-0 p-4 w-full flex flex-col gap-1">
                <h3 className="text-sm md:text-lg font-heading text-white leading-tight tracking-tight uppercase italic group-hover:neon-text transition-all">{concept.name}</h3>
                <div className="h-0.5 w-8 bg-purple-500 group-hover:w-full transition-all duration-500" />
                <p className="text-[8px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 uppercase tracking-widest mt-1">
                    Click to Select
                </p>
              </div>

              {/* Selection Ring Animation */}
              <div className="absolute inset-0 border-2 border-purple-500/0 group-hover:border-purple-500/100 rounded-xl transition-all duration-300" />
            </div>
          ))}
        </div>
      </div>
      
    </div>
  );
};

export default ThemesPage;
