import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// [https://vitejs.dev/config/](https://vitejs.dev/config/)
export default defineConfig({
  // Use root path ('/') for clean Netlify deployment
  base: '/', 
  
  plugins: [
    react(),
  ],
  // Externalize Firebase V9 modular paths to prevent Rollup errors
  build: {
    rollupOptions: {
      external: [
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        // NOTE: lucide-react and recharts should be bundled by default.
      ],
      // We do NOT need the output.globals mapping when deploying to Netlify/Vercel.
    },
  },
});