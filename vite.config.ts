import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Range Finder',
        short_name: 'Range',
        description: 'GPS range layout, ballistics and shooting log',
        display: 'standalone',
        background_color: '#1a1d1a',
        theme_color: '#1a1d1a',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/\.auth\//, /^\/api\//, /\/(login|denied)\.html$/, /^\/logout$/, /^\/login$/],
        runtimeCaching: [
          { urlPattern: /^https:\/\/api\.open-meteo\.com\//, handler: 'NetworkFirst', options: { cacheName: 'weather', expiration: { maxAgeSeconds: 3600 } } },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': '/src' } },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node' },
} as any);
