/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA supaya aplikasi tetap terbuka walaupun di-refresh saat offline (PRD 4.13). Semua potongan
    // layar ikut di-precache, jadi layar yang belum pernah dibuka pun tetap terbuka saat offline.
    VitePWA({
      registerType: 'autoUpdate',
      pwaAssets: { image: 'public/logo.svg', preset: 'minimal-2023', overrideManifestIcons: true },
      manifest: {
        name: 'Kashiru',
        short_name: 'Kashiru',
        description: 'Kasir dan stok bengkel',
        lang: 'id',
        display: 'standalone',
        start_url: '/',
        theme_color: '#f3f2ef',
        background_color: '#f3f2ef',
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
  },
})
