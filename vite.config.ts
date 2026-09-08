import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// chatjimmy.ai sends no CORS headers, so the browser must talk to it
// same-origin. Both the dev server and `vite preview` proxy /api through.
const proxy = {
  '/api': {
    target: 'https://chatjimmy.ai',
    changeOrigin: true,
    secure: true,
  },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy, port: 5173 },
  preview: { proxy, port: 4173 },
})
