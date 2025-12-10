import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Proxy /api → servidor Express (3000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist', // será servido por server/server.js
    sourcemap: true
  }
})
