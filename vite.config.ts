import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
      target: 'esnext',
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    server: {
      port: 3000
    },
    // Define global constants replacement
    // Ini PENTING agar Vercel Env Vars terbaca oleh Client Side code
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.APPS_SCRIPT_BASE_URL': JSON.stringify(env.APPS_SCRIPT_BASE_URL),
      // Mencegah crash jika env variable tidak ada
      'process.env': JSON.stringify(env)
    }
  };
});