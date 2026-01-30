
import React, { useState, useRef, useEffect } from 'react';
import { Concept, PhotoboothSettings, AspectRatio, MonitorTheme } from '../types';
import { 
  uploadOverlayToGas, 
  uploadBackgroundToGas,
  uploadAudioToGas,
  saveSettingsToGas, 
  saveConceptsToGas
} from '../lib/appsScript';
import { DEFAULT_GAS_URL } from '../constants';

interface AdminPageProps {
  settings: PhotoboothSettings;
  concepts: Concept[];
  onSaveSettings: (settings: PhotoboothSettings) => void;
  onSaveConcepts: (concepts: Concept[]) => void;
  onBack: () => void;
  onLaunchMonitor?: () => void;
}

const AdminPage: React.FC<AdminPageProps> = ({ settings, concepts, onSaveSettings, onSaveConcepts, onBack, onLaunchMonitor }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [localSettings, setLocalSettings] = useState(settings);
  const [localConcepts, setLocalConcepts] = useState(concepts);
  const [gasUrl, setGasUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'settings' | 'concepts'>('settings');
  const [isUploadingOverlay, setIsUploadingOverlay] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isSavingConcepts, setIsSavingConcepts] = useState(false);

  const overlayInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Initialize GAS URL
  useEffect(() => {
    const savedUrl = localStorage.getItem('APPS_SCRIPT_BASE_URL') || DEFAULT_GAS_URL;
    setGasUrl(savedUrl);
  }, []);

  // Sync Local Concepts with Props ONLY when Props change (e.g. initial load or parent update)
  useEffect(() => {
    setLocalConcepts(concepts);
  }, [concepts]);

  // Sync Local Settings with Props ONLY when Props change
  useEffect(() => {
    setLocalSettings(prev => {
      // Merge current settings with defaults to ensure all fields exist
      const merged = { ...settings };
      if (merged.cameraRotation === undefined) merged.cameraRotation = 0;
      if (!merged.selectedModel) merged.selectedModel = 'gemini-2.5-flash-image';
      if (!merged.outputRatio) merged.outputRatio = '9:16';
      if (merged.folderId === undefined) merged.folderId = '';
      if (merged.originalFolderId === undefined) merged.originalFolderId = '';
      if (merged.spreadsheetId === undefined) merged.spreadsheetId = '';
      if (merged.videoPrompt === undefined) merged.videoPrompt = 'Cinematic slow motion, subtle movement, 4k high quality, looping background';
      // Default boothMode to video if undefined (migration)
      if (merged.boothMode === undefined) merged.boothMode = 'video';
      if (!merged.monitorImageSize) merged.monitorImageSize = 'medium';
      if (!merged.monitorTheme) merged.monitorTheme = 'physics';
      if (!merged.adminPin) merged.adminPin = '1234';
      if (merged.enableOpenAI === undefined) merged.enableOpenAI = false;
      if (!merged.gptModelSize) merged.gptModelSize = '1024';
      if (!merged.processingMode) merged.processingMode = 'normal';
      if (!merged.videoResolution) merged.videoResolution = '480p'; // Default 480p
      if (!merged.videoModel) merged.videoModel = 'seedance-1-0-pro-fast-251015'; // Default Model
      if (merged.backgroundVideoUrl === undefined) merged.backgroundVideoUrl = null;
      if (merged.promptMode === undefined) merged.promptMode = 'wrapped'; // Default prompt mode
      return merged;
    });
  }, [settings]);

  const handleLogin = () => {
    if (pin === settings.adminPin) {
      setIsAuthenticated(true);
    } else {
      alert('INVALID SECURITY PIN');
      setPin('');
    }
  };

  const handleSaveSettings = async () => {
    localStorage.setItem('APPS_SCRIPT_BASE_URL', gasUrl);
    // Note: We send settings.adminPin (the OLD one) for authentication, 
    // but the body contains localSettings which has the NEW adminPin.
    const ok = await saveSettingsToGas(localSettings, settings.adminPin);
    if (ok) {
      onSaveSettings(localSettings);
      alert('Settings saved and synced to cloud');
    } else {
        onSaveSettings(localSettings);
        alert('Settings saved locally (Cloud sync might have failed)');
    }
  };

  const handleRatioChange = (ratio: AspectRatio) => {
    const isPortrait = ratio === '9:16' || ratio === '2:3';
    setLocalSettings(prev => ({
      ...prev,
      outputRatio: ratio,
      orientation: isPortrait ? 'portrait' : 'landscape'
    }));
  };

  const handleMonitorThemeChange = (theme: MonitorTheme) => {
    setLocalSettings(prev => ({ ...prev, monitorTheme: theme }));
  };

  const handleAddConcept = () => {
    const newId = `concept_${Date.now()}`;
    const newConcept: Concept = {
      id: newId,
      name: 'NEW CONCEPT',
      prompt: 'Describe the transformation here...',
      thumbnail: 'https://picsum.photos/seed/' + newId + '/300/500'
    };
    setLocalConcepts(prev => [...prev, newConcept]);
  };

  // Modified: Uses index for safer deletion and removes window.confirm which might be blocked in Kiosk mode
  const handleDeleteConcept = (index: number) => {
    setLocalConcepts(prev => prev.filter((_, i) => i !== index));
  };

  const handleConceptChange = (index: number, field: keyof Concept, value: string) => {
    setLocalConcepts(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleThumbChange = (index: number, base64: string) => {
    setLocalConcepts(prev => prev.map((c, i) => i === index ? { ...c, thumbnail: base64 } : c));
  };

  const handleSyncConcepts = async () => {
    setIsSavingConcepts(true);
    try {
      const ok = await saveConceptsToGas(localConcepts, settings.adminPin);
      if (ok) {
        onSaveConcepts(localConcepts);
        alert('All concepts updated on cloud and local archive');
      } else {
        alert('Cloud sync failed. Check your Apps Script URL.');
      }
    } finally {
      setIsSavingConcepts(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6 bg-transparent">
        <h2 className="text-3xl font-heading mb-10 neon-text italic uppercase drop-shadow-lg">SECURE ACCESS</h2>
        <div className="glass-card p-8 flex flex-col items-center gap-8 w-full max-w-sm backdrop-blur-md bg-black/60">
          <input 
            type="password" 
            placeholder="PIN" 
            className="bg-black/50 border-2 border-white/5 px-6 py-5 text-center text-3xl outline-none focus:border-purple-500 w-full font-mono text-white rounded-lg"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
          <button onClick={handleLogin} className="w-full py-5 bg-purple-600 font-heading tracking-widest uppercase rounded-lg hover:bg-purple-500 transition-colors">AUTHORIZE</button>
          <button onClick={onBack} className="text-gray-400 hover:text-white uppercase text-[10px] tracking-widest transition-colors">Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex flex-col p-6 md:p-10 bg-transparent overflow-y-auto">
      <div className="flex flex-col md:flex-row justify-between items-center mb-10 max-w-7xl mx-auto w-full border-b border-white/5 pb-10 gap-8 bg-black/40 backdrop-blur-md p-6 rounded-xl">
        <h2 className="text-2xl font-heading text-white neon-text italic uppercase">SYSTEM_ROOT</h2>
        <div className="flex bg-white/5 p-1 rounded-xl">
          {(['settings', 'concepts'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-lg text-[10px] font-bold tracking-[0.3em] uppercase transition-all ${activeTab === tab ? 'bg-purple-600 text-white shadow-xl shadow-purple-900/40' : 'text-gray-500 hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="px-10 py-4 border-2 border-red-900/40 text-red-500 uppercase tracking-widest text-xs italic hover:bg-red-900/10 rounded-lg transition-colors">Disconnect</button>
      </div>

      <div className="max-w-7xl mx-auto w-full pb-24">
        {/* Launch Monitor Button Area */}
        <div className="flex justify-end mb-8">
           <button 
             onClick={onLaunchMonitor} 
             className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-900 to-purple-900 border border-blue-500/30 hover:border-blue-400 text-blue-200 font-heading tracking-[0.2em] uppercase rounded-lg shadow-lg hover:shadow-blue-500/20 transition-all backdrop-blur-md"
           >
             <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
             LAUNCH LIVE MONITOR
           </button>
        </div>

        {activeTab === 'settings' && (
          <div className="flex flex-col gap-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              <div className="glass-card p-6 md:p-10 flex flex-col gap-8 h-fit backdrop-blur-md bg-black/60 rounded-xl border border-white/10">
                <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 uppercase italic">Global Identity</h3>
                
                {/* BOOTH MODE & PROCESSING MODE */}
                <div className="flex flex-col gap-4 mb-4 bg-purple-900/10 p-5 rounded-lg border border-purple-500/20">
                  
                  {/* Booth Mode Selector */}
                  <div className="flex flex-col gap-2">
                     <label className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">BOOTH MODE</label>
                     <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setLocalSettings({...localSettings, boothMode: 'photo'})}
                          className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.boothMode === 'photo' ? 'bg-pink-600 text-white shadow-lg border-pink-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                        >
                          <span className="font-bold">PHOTOBOOTH MODE</span>
                          <span className="text-[8px] opacity-60">Photos Only</span>
                        </button>
                        <button
                          onClick={() => setLocalSettings({...localSettings, boothMode: 'video'})}
                          className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.boothMode === 'video' ? 'bg-blue-600 text-white shadow-lg border-blue-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                        >
                          <span className="font-bold">VIDEOBOOTH MODE</span>
                          <span className="text-[8px] opacity-60">Photos + Video</span>
                        </button>
                     </div>
                  </div>

                  <div className="h-px bg-white/10 w-full my-1"></div>

                  {/* Processing Mode Toggle */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">Kiosk Processing Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setLocalSettings({...localSettings, processingMode: 'normal'})}
                        className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.processingMode === 'normal' ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                      >
                         <span className="font-bold">NORMAL MODE</span>
                         <span className="text-[8px] opacity-60">Instant Preview</span>
                      </button>
                      <button
                        onClick={() => setLocalSettings({...localSettings, processingMode: 'fast'})}
                        className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.processingMode === 'fast' ? 'bg-green-600 text-white shadow-lg border-green-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                      >
                         <span className="font-bold">FAST MODE</span>
                         <span className="text-[8px] opacity-60">Background Queue</span>
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-[9px] text-gray-400 mt-1 italic leading-relaxed">
                    * <strong>Photobooth Mode:</strong> No video generation buttons.<br/>
                    * <strong>Videobooth Mode (Fast):</strong> "Generate Video" button moves to Gallery.
                  </p>
                </div>

                {/* Event Identity Inputs */}
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Event Name</label>
                  <input 
                    className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-purple-500 outline-none transition-colors rounded-lg" 
                    value={localSettings.eventName} 
                    onChange={e => setLocalSettings({...localSettings, eventName: e.target.value})}
                  />
                </div>
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Event Description</label>
                  <input 
                    className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-purple-500 outline-none transition-colors rounded-lg" 
                    value={localSettings.eventDescription} 
                    onChange={e => setLocalSettings({...localSettings, eventDescription: e.target.value})}
                  />
                </div>
                
                {/* Folder Configurations */}
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Generated Result Folder ID</label>
                  <input 
                    className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-purple-300 focus:border-purple-500 outline-none transition-colors rounded-lg" 
                    value={localSettings.folderId} 
                    onChange={e => setLocalSettings({...localSettings, folderId: e.target.value})}
                    placeholder="Enter Folder ID for AI Results"
                  />
                </div>
                
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-green-500 uppercase tracking-widest font-bold">Original Capture Folder ID (Raw)</label>
                  <input 
                    className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-green-300 focus:border-green-500 outline-none transition-colors rounded-lg" 
                    value={localSettings.originalFolderId || ''} 
                    onChange={e => setLocalSettings({...localSettings, originalFolderId: e.target.value})}
                    placeholder="Enter Folder ID for Original Raw Photos (Optional)"
                  />
                  <p className="text-[9px] text-gray-500">* Leave blank if you don't want to save originals. Saved originals will NOT appear in the gallery.</p>
                </div>

                {/* AI Model Config */}
                <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 mt-6 uppercase italic">AI Model Configuration</h3>
                
                {/* Prompt Mode Selector */}
                <div className="flex flex-col gap-2 bg-purple-900/10 p-4 rounded border border-purple-500/20 mb-4">
                     <label className="text-[10px] text-purple-400 uppercase tracking-widest font-bold">Prompt Mode</label>
                     <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setLocalSettings({...localSettings, promptMode: 'wrapped'})}
                          className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.promptMode === 'wrapped' ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                        >
                          <span className="font-bold">WRAPPED (SAFE)</span>
                          <span className="text-[8px] opacity-60">Strict Face Lock</span>
                        </button>
                        <button
                          onClick={() => setLocalSettings({...localSettings, promptMode: 'raw'})}
                          className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.promptMode === 'raw' ? 'bg-orange-600 text-white shadow-lg border-orange-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                        >
                          <span className="font-bold">RAW (CREATIVE)</span>
                          <span className="text-[8px] opacity-60">Direct Prompting</span>
                        </button>
                     </div>
                     <p className="text-[9px] text-gray-500 mt-1 italic">
                        * <strong>Wrapped:</strong> Adds system instruction to preserve identity strictly. <br/>
                        * <strong>Raw:</strong> Sends prompt exactly as written. Better for style changes, riskier for likeness.
                     </p>
                </div>

                {/* Enable OpenAI Toggle */}
                <div className="flex items-center justify-between bg-white/5 p-4 rounded border border-white/10 mb-4">
                  <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Enable OpenAI Provider</label>
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 accent-green-600 cursor-pointer"
                      checked={localSettings.enableOpenAI ?? false}
                      onChange={e => setLocalSettings({...localSettings, enableOpenAI: e.target.checked})}
                    />
                  </div>
                </div>

                {localSettings.enableOpenAI && (
                   <div className="flex flex-col gap-3 mb-6 bg-green-900/10 p-4 rounded border border-green-500/20">
                     <label className="text-[10px] text-green-500 uppercase tracking-widest font-bold">OpenAI GPT-1.5 Render Size (Speed Control)</label>
                     <div className="grid grid-cols-3 gap-3">
                        {(['512', '720', '1024'] as const).map(size => (
                          <button
                            key={size}
                            onClick={() => setLocalSettings({...localSettings, gptModelSize: size})}
                            className={`py-2 border rounded font-mono text-xs transition-all uppercase ${localSettings.gptModelSize === size ? 'bg-green-600 text-white border-green-400' : 'bg-black/50 text-gray-400 border-white/10 hover:bg-white/5'}`}
                          >
                            {size}px
                          </button>
                        ))}
                     </div>
                     <p className="text-[9px] text-gray-500">* Lower resolution = Faster generation. Aspect ratio is preserved within this box.</p>
                   </div>
                )}

                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Image Generation Model</label>
                  <div className="grid grid-cols-4 gap-3">
                    <button
                      onClick={() => setLocalSettings({...localSettings, selectedModel: 'gemini-2.5-flash-image'})}
                      className={`py-4 border border-white/10 rounded font-mono text-xs transition-all flex flex-col items-center gap-1 ${localSettings.selectedModel === 'gemini-2.5-flash-image' ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="text-sm font-bold">GEN2</span>
                      <span className="text-[8px] opacity-70 uppercase">FAST (FLASH)</span>
                    </button>
                    <button
                      onClick={() => setLocalSettings({...localSettings, selectedModel: 'auto'})}
                      className={`py-4 border border-white/10 rounded font-mono text-xs transition-all flex flex-col items-center gap-1 ${localSettings.selectedModel === 'auto' ? 'bg-blue-600 text-white shadow-lg border-blue-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="text-sm font-bold">AUTO</span>
                      <span className="text-[8px] opacity-70 uppercase">SMART DETECT</span>
                    </button>
                    <button
                      onClick={() => setLocalSettings({...localSettings, selectedModel: 'gemini-3-pro-image-preview'})}
                      className={`py-4 border border-white/10 rounded font-mono text-xs transition-all flex flex-col items-center gap-1 ${localSettings.selectedModel === 'gemini-3-pro-image-preview' ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                      <span className="text-sm font-bold">GEN 3</span>
                      <span className="text-[8px] opacity-70 uppercase">QUALITY (PRO)</span>
                    </button>
                    {localSettings.enableOpenAI && (
                      <button
                        onClick={() => setLocalSettings({...localSettings, selectedModel: 'gpt-image-1.5'})}
                        className={`py-4 border border-white/10 rounded font-mono text-xs transition-all flex flex-col items-center gap-1 ${localSettings.selectedModel === 'gpt-image-1.5' ? 'bg-green-600 text-white shadow-lg border-green-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                      >
                        <span className="text-sm font-bold">GP5</span>
                        <span className="text-[8px] opacity-70 uppercase">OPENAI</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Video Settings */}
                <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 mt-6 uppercase italic">Video Generation (Seedance)</h3>
                
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Video Model Version</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setLocalSettings({...localSettings, videoModel: 'seedance-1-0-pro-fast-251015'})}
                      className={`py-4 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.videoModel === 'seedance-1-0-pro-fast-251015' ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                       <span className="font-bold">Seedance 1.0</span>
                       <span className="text-[8px] opacity-60">PRO FAST (DEFAULT)</span>
                    </button>
                    <button
                      onClick={() => setLocalSettings({...localSettings, videoModel: 'seedance-1-5-pro-251215'})}
                      className={`py-4 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.videoModel === 'seedance-1-5-pro-251215' ? 'bg-blue-600 text-white shadow-lg border-blue-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                       <span className="font-bold">Seedance 1.5</span>
                       <span className="text-[8px] opacity-60">LATEST PRO</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Video Resolution</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setLocalSettings({...localSettings, videoResolution: '480p'})}
                      className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.videoResolution === '480p' ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                       <span className="font-bold">480p (FAST)</span>
                    </button>
                    <button
                      onClick={() => setLocalSettings({...localSettings, videoResolution: '720p'})}
                      className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase flex flex-col items-center gap-1 ${localSettings.videoResolution === '720p' ? 'bg-blue-600 text-white shadow-lg border-blue-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                    >
                       <span className="font-bold">720p (STANDARD)</span>
                    </button>
                  </div>
                  <p className="text-[9px] text-gray-500">* 480p is faster. 720p provides better quality but takes longer.</p>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Video Prompt</label>
                  <textarea 
                    className="bg-black/50 border border-white/10 p-4 font-mono text-xs text-white focus:border-purple-500 outline-none transition-colors h-24 rounded-lg" 
                    value={localSettings.videoPrompt} 
                    onChange={e => setLocalSettings({...localSettings, videoPrompt: e.target.value})}
                    placeholder="Describe motion (e.g. slow motion, subtle movement...)"
                    disabled={localSettings.boothMode === 'photo'}
                  />
                  {localSettings.boothMode === 'photo' && <p className="text-[9px] text-red-500 italic">* Disabled in Photobooth Mode</p>}
                </div>

                {/* Output Config */}
                <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 mt-6 uppercase italic">Output Configuration</h3>
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Output Aspect Ratio</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(['9:16', '16:9', '2:3', '3:2'] as AspectRatio[]).map(r => (
                      <button
                        key={r}
                        onClick={() => handleRatioChange(r)}
                        className={`py-4 border border-white/10 rounded font-mono text-xs transition-all flex flex-col items-center gap-1 ${localSettings.outputRatio === r ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                      >
                        <span className="text-sm font-bold">{r}</span>
                        <span className="text-[8px] opacity-70 uppercase">
                          {r === '9:16' ? 'Portrait' : r === '16:9' ? 'Landscape' : r === '2:3' ? 'Photo Portrait' : 'Photo Landscape'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Camera Config */}
                <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 mt-6 uppercase italic">Camera Configuration</h3>
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Webcam Rotation</label>
                  <div className="grid grid-cols-4 gap-3">
                    {[0, 90, 180, 270].map(deg => (
                      <button
                        key={deg}
                        onClick={() => setLocalSettings({...localSettings, cameraRotation: deg})}
                        className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase ${localSettings.cameraRotation === deg ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                {/* Monitor Config */}
                <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 mt-6 uppercase italic">Monitor Config</h3>
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Monitor Theme Layout</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['physics', 'grid', 'hero', 'slider'] as MonitorTheme[]).map(t => (
                      <button
                        key={t}
                        onClick={() => handleMonitorThemeChange(t)}
                        className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase ${localSettings.monitorTheme === t ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 mt-4">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Physics Card Size (Only for Physics Mode)</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['small', 'medium', 'large'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setLocalSettings({...localSettings, monitorImageSize: s})}
                        className={`py-3 border border-white/10 rounded font-mono text-xs transition-all uppercase ${localSettings.monitorImageSize === s ? 'bg-purple-600 text-white shadow-lg border-purple-400' : 'bg-black/50 text-gray-400 hover:bg-white/5'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Security - Update PIN */}
                <h3 className="font-heading text-xl text-red-400 border-b border-white/5 pb-4 mt-6 uppercase italic">Security</h3>
                <div className="flex flex-col gap-3">
                  <label className="text-[10px] text-red-500 uppercase tracking-widest font-bold">Admin PIN</label>
                  <input 
                    type="text"
                    maxLength={8}
                    className="bg-red-900/10 border border-red-500/30 p-4 font-mono text-xs text-red-200 focus:border-red-500 outline-none transition-colors tracking-[0.5em] text-center rounded-lg" 
                    value={localSettings.adminPin} 
                    onChange={e => setLocalSettings({...localSettings, adminPin: e.target.value})}
                    placeholder="****"
                  />
                  <p className="text-[9px] text-gray-500">* Changing this will require re-login next time.</p>
                </div>

                <button onClick={handleSaveSettings} className="w-full py-6 bg-green-800 hover:bg-green-700 text-white font-heading tracking-widest uppercase italic mt-6 transition-all rounded-lg shadow-xl">SAVE SETTINGS & LINK DB</button>
              </div>

              {/* Assets Column */}
              <div className="flex flex-col gap-8">
                {/* Overlay Asset */}
                <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit text-center backdrop-blur-md bg-black/60 rounded-xl">
                  <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 uppercase italic">Overlay (PNG)</h3>
                  <div className="flex flex-col gap-6">
                    <div 
                      className="bg-white/5 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden mx-auto shadow-2xl transition-all duration-300"
                      style={{
                        width: '180px',
                        aspectRatio: localSettings.outputRatio === '16:9' ? '16/9' : localSettings.outputRatio === '3:2' ? '3/2' : localSettings.outputRatio === '2:3' ? '2/3' : '9/16'
                      }}
                    >
                      {localSettings.overlayImage ? (
                        <img src={localSettings.overlayImage} className="w-full h-full object-contain" alt="Overlay" />
                      ) : <span className="text-[10px] text-gray-700 font-mono">NO_OVERLAY</span>}
                    </div>
                    <input type="file" accept="image/png" className="hidden" ref={overlayInputRef} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingOverlay(true);
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const res = await uploadOverlayToGas(reader.result as string, settings.adminPin);
                        if (res.ok) {
                          setLocalSettings({...localSettings, overlayImage: res.url});
                          alert('Overlay updated');
                        }
                        setIsUploadingOverlay(false);
                      };
                      reader.readAsDataURL(file);
                    }} />
                    <button onClick={() => overlayInputRef.current?.click()} disabled={isUploadingOverlay} className="w-full py-4 border-2 border-white/10 hover:border-purple-500 text-[10px] tracking-widest font-bold uppercase bg-white/5 rounded-lg transition-colors">
                      {isUploadingOverlay ? 'UPLOADING...' : 'CHANGE PNG OVERLAY'}
                    </button>
                  </div>
                </div>

                {/* Background Asset (Image) */}
                <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit text-center backdrop-blur-md bg-black/60 rounded-xl">
                  <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 uppercase italic">Background</h3>
                  
                  {/* Video URL Input */}
                  <div className="flex flex-col gap-2 bg-purple-900/10 p-3 rounded border border-purple-500/20">
                      <label className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Video Background URL (MP4)</label>
                      <input 
                        className="bg-black/50 border border-white/10 p-2 font-mono text-xs text-white focus:border-purple-500 outline-none transition-colors rounded" 
                        value={localSettings.backgroundVideoUrl || ''} 
                        onChange={e => setLocalSettings({...localSettings, backgroundVideoUrl: e.target.value})}
                        placeholder="https://.../video.mp4 (Takes priority)"
                      />
                      <p className="text-[9px] text-gray-500">* Direct MP4 link. Overrides image if set.</p>
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="w-full aspect-video bg-white/5 border border-white/10 rounded-lg flex items-center justify-center overflow-hidden mx-auto shadow-2xl relative">
                      {localSettings.backgroundVideoUrl ? (
                         <video src={localSettings.backgroundVideoUrl} className="w-full h-full object-cover opacity-70" autoPlay loop muted playsInline />
                      ) : localSettings.backgroundImage ? (
                        <img src={localSettings.backgroundImage} className="w-full h-full object-cover" alt="Background" />
                      ) : <span className="text-[10px] text-gray-700 font-mono">DEFAULT_DARK</span>}
                      
                      {localSettings.backgroundVideoUrl && <div className="absolute top-2 right-2 bg-purple-600 px-2 py-1 rounded text-[8px] font-bold">VIDEO MODE</div>}
                    </div>
                    <input type="file" accept="image/jpeg,image/png" className="hidden" ref={backgroundInputRef} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingBackground(true);
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const res = await uploadBackgroundToGas(reader.result as string, settings.adminPin);
                        if (res.ok) {
                          setLocalSettings({...localSettings, backgroundImage: res.url});
                          alert('Background Image updated');
                        }
                        setIsUploadingBackground(false);
                      };
                      reader.readAsDataURL(file);
                    }} />
                    <button onClick={() => backgroundInputRef.current?.click()} disabled={isUploadingBackground} className="w-full py-4 border-2 border-white/10 hover:border-purple-500 text-[10px] tracking-widest font-bold uppercase bg-white/5 rounded-lg transition-colors">
                      {isUploadingBackground ? 'UPLOADING...' : 'CHANGE BACKGROUND IMAGE'}
                    </button>
                  </div>
                </div>

                {/* Audio Asset */}
                <div className="glass-card p-6 md:p-10 flex flex-col gap-8 border-white/10 h-fit text-center backdrop-blur-md bg-black/60 rounded-xl">
                  <h3 className="font-heading text-xl text-purple-400 border-b border-white/5 pb-4 uppercase italic">Background Audio (5s)</h3>
                  <div className="flex flex-col gap-6">
                    <div className="w-full p-4 bg-white/5 border border-white/10 rounded-lg flex flex-col items-center justify-center gap-2">
                       {localSettings.backgroundAudio ? (
                         <div className="flex flex-col items-center gap-2 w-full">
                           <span className="text-green-500 text-xs font-bold">AUDIO ACTIVE</span>
                           <audio controls src={localSettings.backgroundAudio} className="w-full h-8" />
                         </div>
                       ) : <span className="text-[10px] text-gray-700 font-mono">NO AUDIO</span>}
                    </div>
                    <input type="file" accept="audio/*" className="hidden" ref={audioInputRef} onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setIsUploadingAudio(true);
                      const reader = new FileReader();
                      reader.onload = async () => {
                        const res = await uploadAudioToGas(reader.result as string, settings.adminPin);
                        if (res.ok) {
                          setLocalSettings({...localSettings, backgroundAudio: res.url});
                          alert('Audio updated');
                        }
                        setIsUploadingAudio(false);
                      };
                      reader.readAsDataURL(file);
                    }} />
                    <button onClick={() => audioInputRef.current?.click()} disabled={isUploadingAudio} className="w-full py-4 border-2 border-white/10 hover:border-purple-500 text-[10px] tracking-widest font-bold uppercase bg-white/5 rounded-lg transition-colors">
                      {isUploadingAudio ? 'UPLOADING...' : 'CHANGE AUDIO (5 SEC)'}
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* Concepts Tab - existing logic */}
        {activeTab === 'concepts' && (
          <div className="flex flex-col gap-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {localConcepts.map((concept, index) => (
                <div key={concept.id} className="glass-card p-6 flex flex-col sm:flex-row gap-8 relative group backdrop-blur-md bg-black/60 rounded-xl border border-white/10">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDeleteConcept(index); }} 
                    className="absolute top-4 right-4 text-red-900/40 hover:text-red-500 transition-colors p-2 z-20 hover:bg-white/10 rounded"
                    title="Delete Concept"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  </button>
                  <div className="w-24 aspect-[9/16] bg-white/5 border border-white/10 rounded-xl shrink-0 overflow-hidden relative group/thumb shadow-lg">
                    <img src={concept.thumbnail} className="w-full h-full object-cover" />
                    <label className="absolute inset-0 bg-purple-600/80 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center cursor-pointer text-[10px] uppercase font-bold text-white transition-opacity">
                      Update
                      <input type="file" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => handleThumbChange(index, reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }} />
                    </label>
                  </div>
                  <div className="flex-1 flex flex-col gap-4">
                    <input 
                      className="bg-transparent border-b border-white/10 p-2 font-heading uppercase italic text-white outline-none focus:border-purple-500 w-full" 
                      value={concept.name} 
                      onChange={e => handleConceptChange(index, 'name', e.target.value)} 
                    />
                    <textarea 
                      className="bg-black/30 border border-white/5 p-3 text-[10px] font-mono h-24 text-gray-400 outline-none focus:border-white/20 resize-none w-full rounded-lg" 
                      value={concept.prompt} 
                      onChange={e => handleConceptChange(index, 'prompt', e.target.value)} 
                    />
                  </div>
                </div>
              ))}
              <button onClick={handleAddConcept} className="glass-card p-6 flex flex-col items-center justify-center gap-4 border-2 border-dashed border-white/10 hover:border-purple-500/50 hover:bg-white/5 transition-all min-h-[200px] rounded-xl backdrop-blur-sm">
                <div className="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center text-white/50 group-hover:text-purple-500 group-hover:border-purple-500 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </div>
                <span className="font-heading text-xs tracking-[0.3em] text-white/40 uppercase italic">ADD_NEW_CONCEPT</span>
              </button>
            </div>
            <div className="flex justify-center mt-10">
              <button onClick={handleSyncConcepts} disabled={isSavingConcepts} className="px-20 py-6 bg-purple-600 font-heading tracking-widest uppercase italic shadow-2xl hover:bg-purple-500 transition-all disabled:opacity-50 rounded-lg">
                {isSavingConcepts ? 'SINKRONISASI...' : 'SYNC ALL CONCEPTS TO CLOUD'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
