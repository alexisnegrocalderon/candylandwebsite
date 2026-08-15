import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  mode: 'production',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
      'virtual:pwa-register': path.resolve(import.meta.dirname, 'client', 'src', 'ssr', 'pwa-register-stub.ts'),
    },
  },
  ssr: {
    target: 'node',
    noExternal: ['framer-motion', 'lucide-react'],
  },
  build: {
    ssr: path.resolve(import.meta.dirname, 'client', 'src', 'entry-server.tsx'),
    outDir: path.resolve(import.meta.dirname, 'dist', 'server-ssr'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'entry-server.js',
        format: 'esm',
      },
    },
  },
});
