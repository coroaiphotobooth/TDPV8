
import { Concept, PhotoboothSettings } from './types';

export const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxy9mV9PrBoikjsU_JDMC3KaMTWWKS-HKNyeOFh3LbMhZqVVaX89lsG87YhaJmAm-fH/exec';

export const DEFAULT_CONCEPTS: Concept[] = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk 2077',
    prompt: 'Generate a realistic photo of the person in the input image. They are wearing a futuristic high-collar leather jacket with glowing neon blue accents. Background is a rainy neon-lit futuristic city street at night. Cybernetic aesthetic, photorealistic. KEEP THE FACE EXACTLY THE SAME.',
    thumbnail: 'https://picsum.photos/seed/cyber/300/500'
  },
  {
    id: 'steampunk',
    name: 'Steampunk Explorer',
    prompt: 'Generate a realistic photo of the person in the input image. They are wearing a vintage brown leather aviator jacket, a vest, and brass goggles on their head. Background is inside a clockwork airship with gears and steam. Victorian industrial style. PRESERVE FACIAL IDENTITY.',
    thumbnail: 'https://picsum.photos/seed/steam/300/500'
  },
  {
    id: 'astronaut',
    name: 'Space Nomad',
    prompt: 'Generate a realistic photo of the person in the input image. They are wearing a realistic white NASA space suit with the helmet removed and held under their arm. Standing on the red dusty surface of Mars. Dramatic sunlight, high detail. KEEP THE FACE IDENTICAL.',
    thumbnail: 'https://picsum.photos/seed/space/300/500'
  },
  {
    id: 'fantasy',
    name: 'Elven Royalty',
    prompt: 'Generate a realistic photo of the person in the input image. They are wearing an elegant silver crown with gemstones and a flowing white silk robe with intricate embroidery. Background is a magical forest with glowing fireflies. Soft ethereal lighting. FACE MUST MATCH INPUT.',
    thumbnail: 'https://picsum.photos/seed/elf/300/500'
  },
  {
    id: 'anime',
    name: 'Anime Style',
    prompt: 'Convert the person in the image to a high-quality 2D Anime Art Style. They are wearing a cool school uniform. Vibrant colors, cel-shaded, studio ghibli inspired background. RETAIN KEY FACIAL FEATURES AND HAIR STYLE.',
    thumbnail: 'https://picsum.photos/seed/anime/300/500'
  },
  {
    id: 'professional',
    name: 'CEO Portrait',
    prompt: 'Generate a professional headshot of the person in the input image. They are wearing a luxury dark tailored business suit and a white crisp shirt. Standing in a modern office with a blurred city skyline view. Professional studio lighting. KEEP THE FACE EXACTLY THE SAME.',
    thumbnail: 'https://picsum.photos/seed/ceo/300/500'
  }
];

export const DEFAULT_SETTINGS: PhotoboothSettings = {
  eventName: 'COROAI PHOTOBOOTH',
  eventDescription: 'Transform Your Reality into Digital Art',
  folderId: '1knqeFCrMVhUlfzmuu-AVTkZmFF3Dnuqy',
  originalFolderId: '', // New Default
  spreadsheetId: '',
  selectedModel: 'gemini-2.5-flash-image',
  enableOpenAI: false,
  gptModelSize: '1024',
  overlayImage: null,
  backgroundImage: null,
  backgroundVideoUrl: null, // New Default for Video Loop
  backgroundAudio: null,
  videoPrompt: 'Cinematic slow motion, subtle movement, 4k high quality, looping background',
  enableVideoGeneration: true, // Deprecated but kept for type safety
  videoResolution: '480p', // Default 480p
  videoModel: 'seedance-1-0-pro-fast-251015', // Default Model
  boothMode: 'video', // Default mode
  monitorImageSize: 'medium',
  monitorTheme: 'physics', // Default theme
  processingMode: 'normal', // Default mode
  autoResetTime: 60,
  adminPin: '1234',
  orientation: 'portrait',
  outputRatio: '9:16',
  cameraRotation: 0,
  promptMode: 'wrapped' // Default: Wrapped (Safe/Strict)
};
