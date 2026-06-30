// created_by:pushkar | helped_by:claude | parth-host-defender
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base config — used for development without start.sh
// When launched via start.sh, vite.runtime.config.js overrides this with HTTPS + correct ports
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // HTTPS disabled in base config — start.sh writes vite.runtime.config.js with certs
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
