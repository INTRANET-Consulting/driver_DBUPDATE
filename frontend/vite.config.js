import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    allowedHosts: [
      'localhost',
      '.ngrok-free.dev' // allow ngrok tunnels (e.g., maile-detrusive-charlize.ngrok-free.dev)
    ]
  }
})
