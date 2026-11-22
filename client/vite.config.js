import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser only ever talks to our own server; no API keys are bundled here.
const api = process.env.API_ORIGIN ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
  // `vite preview` serves the built files the way the hosted site does (for checking the split
  // bundle and real load order), against the same local server.
  preview: {
    port: 4173,
    proxy: {
      '/api': api,
      '/socket.io': { target: api, ws: true },
    },
  },
});
