import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('node_modules/xlsx')) {
              return 'xlsx-export';
            }
            if (id.includes('node_modules/dompurify')) {
              return 'vendor-sanitize';
            }
            if (id.includes('node_modules/browser-image-compression')) {
              return 'vendor-compression';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('node_modules/date-fns')) {
              return 'vendor-date';
            }
            if (id.includes('node_modules/@supabase')) {
              return 'vendor-supabase';
            }
            if (
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/react-router-dom') ||
              id.includes('node_modules/@remix-run/router')
            ) {
              return 'vendor-router';
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/scheduler/') ||
              id.includes('node_modules/react-helmet-async/')
            ) {
              return 'vendor-react';
            }
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})
