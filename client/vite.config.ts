import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Wider than Vite's default (~2023 browsers) so older clinic PCs, iPads and
    // phones still run the app: Chrome/Edge 88+, Firefox 78+, Safari 14+.
    target: ['es2020', 'chrome88', 'edge88', 'firefox78', 'safari14'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
    },
  },
})
