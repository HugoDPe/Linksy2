import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Configuration Vite pour Vue.js
export default defineConfig({
  plugins: [vue()],
    server: {
    allowedHosts: ['vps-d010d024.vps.ovh.net', 'linksy_scraper'],
    host: '0.0.0.0', // Écoute sur toutes les interfaces (nécessaire pour Docker)
    port: process.env.PORT || 5173,
    strictPort: true
    }
})

