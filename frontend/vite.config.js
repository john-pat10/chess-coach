import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base: './' makes every asset path relative, so the built site works from
// any sub-path -- e.g. https://<user>.github.io/chess-coach/ on GitHub Pages.
export default defineConfig({
  plugins: [react()],
  base: './',
})
