import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone demo server for visual verification of the Editor component
// (no Electron / preload). Serves src/renderer/demo.html.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
  plugins: [
    react(),
    {
      name: 'demo-root-redirect',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url === '') req.url = '/demo.html'
          next()
        })
      }
    }
  ],
  server: { port: 5199, open: false }
})
