import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  define: {
    'process.env.VITE_BACKEND_URL': JSON.stringify(process.env.VITE_BACKEND_URL || ''),
  },
  server: {
    port: 4321,
    proxy: {
      '/api': {
        target: 'http://localhost:4322',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4322',
        ws: true,
      },
    },
  },
});
