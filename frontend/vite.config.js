import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev mode the page is served by Vite and the API by the Python backend.
// Proxying /api means the browser only ever talks to one address, exactly as
// it does when the backend serves the built app. `python run.py --dev` sets
// VITE_BACKEND_PORT if the backend had to move off port 8000.
const backend = `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || 8000}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: backend, changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: backend, changeOrigin: true } },
  },
})
