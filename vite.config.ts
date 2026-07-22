import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      // Su WSL con il progetto su mount /mnt/c gli eventi fs nativi non
      // arrivano: senza polling l'HMR non scatta e Vite serve i file in cache.
      usePolling: true,
      interval: 300,
    },
  },
})
