import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { datasetsPlugin } from './scripts/vite-datasets.mjs';

// ATLAS_BASE lets the same build be served at a domain root or under a path.
// ATLAS_DEFAULT names the dataset shown when the URL has no ?d=<slug>.
export default defineConfig({
  base: process.env.ATLAS_BASE ?? '/',
  plugins: [react(), datasetsPlugin({ root: import.meta.dirname, defaultSlug: process.env.ATLAS_DEFAULT ?? 'early-britain' })],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('maplibre-gl') ? 'maplibre' : id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
  },
  server: { host: true, port: 5173 },
});
