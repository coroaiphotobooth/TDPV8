
export interface Concept {
  id: string;
  name: string;
  prompt: string;
  thumbnail: string;
}

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  folderId: string;
  createdAt: string;
  isActive: boolean;
}

export type AspectRatio = '16:9' | '9:16' | '3:2' | '2:3';

export type MonitorTheme = 'physics' | 'grid' | 'hero' | 'slider';

export interface PhotoboothSettings {
  eventName: string;
  eventDescription: string;
  folderId: string;
  originalFolderId?: string; 
  spreadsheetId?: string; 
  selectedModel: string;
  enableOpenAI?: boolean; 
  gptModelSize?: '512' | '720' | '1024'; 
  overlayImage: string | null;
  backgroundImage: string | null;
  backgroundVideoUrl?: string | null; // New Field for Video Loop Background
  backgroundAudio: string | null; 
  videoPrompt: string; 
  // enableVideoGeneration is deprecated in favor of boothMode
  enableVideoGeneration?: boolean; 
  videoResolution?: '480p' | '720p'; 
  videoModel?: string; // New Setting for Seedance Model ID
  boothMode?: 'photo' | 'video';
  monitorImageSize?: 'small' | 'medium' | 'large'; 
  monitorTheme?: MonitorTheme; 
  processingMode?: 'normal' | 'fast'; 
  autoResetTime: number;
  adminPin: string;
  orientation: 'portrait' | 'landscape';
  outputRatio: AspectRatio;
  activeEventId?: string;
  cameraRotation: number;
  promptMode?: 'raw' | 'wrapped'; // New Setting: 'raw' = free transform, 'wrapped' = strict face lock
}

export interface GalleryItem {
  id: string;
  createdAt: string;
  conceptName: string;
  imageUrl: string;
  downloadUrl: string;
  token: string;
  eventId?: string;
  type?: 'image' | 'video';
  originalId?: string; 
  providerUrl?: string; 
  relatedPhotoId?: string; 
  // New Fields for Session & Queue
  sessionFolderId?: string;
  sessionFolderUrl?: string;
  videoStatus?: 'idle' | 'queued' | 'processing' | 'done' | 'failed' | 'ready_url';
  videoTaskId?: string;
  videoFileId?: string; // ID File Video di Google Drive
  videoResolution?: string;
  videoModel?: string; // New Field in Sheet
}

export interface ProcessNotification {
  id: string;
  thumbnail: string;
  conceptName: string;
  status: 'processing' | 'completed' | 'failed';
  timestamp: number;
}

export enum AppState {
  LANDING = 'LANDING',
  THEMES = 'THEMES',
  CAMERA = 'CAMERA',
  GENERATING = 'GENERATING',
  RESULT = 'RESULT',
  GALLERY = 'GALLERY',
  ADMIN = 'ADMIN',
  MONITOR = 'MONITOR',
  FAST_THANKS = 'FAST_THANKS'
}
