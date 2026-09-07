import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// On GitHub Pages the app lives at https://<user>.github.io/<repo>/ so the
// deploy workflow sets VITE_BASE to "/<repo>/". Locally it defaults to "/".
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        id: base,
        name: 'GoldTrack',
        short_name: 'GoldTrack',
        description: 'Gold price, stock and profit tracker',
        start_url: base,
        scope: base,
        theme_color: '#22262B',
        background_color: '#EEEDE8',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['finance', 'business'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/script\.google\.com/]
      }
    })
  ]
})
