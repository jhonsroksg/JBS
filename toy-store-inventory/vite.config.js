import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('node_modules/xlsx')) {
              return 'xlsx-export';
            }
            if (
              id.includes('node_modules/jspdf') ||
              id.includes('node_modules/jspdf-autotable') ||
              id.includes('node_modules/html2canvas') ||
              id.includes('node_modules/dompurify') ||
              id.includes('node_modules/fflate') ||
              id.includes('node_modules/canvg') ||
              id.includes('node_modules/fast-png')
            ) {
              return 'pdf-export';
            }
            if (id.includes('node_modules/@supabase')) {
              return 'supabase';
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/react-helmet-async/')
            ) {
              return 'react-core';
            }
          }
        }
      }
    },
    chunkSizeWarningLimit: 500
  }
})
