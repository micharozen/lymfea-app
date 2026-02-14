import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React ecosystem
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Data fetching
          'vendor-query': ['@tanstack/react-query'],
          // Form handling
          'vendor-form': ['react-hook-form', '@hookform/resolvers', 'zod'],
          // Date utilities
          'vendor-date': ['date-fns', 'date-fns-tz'],
          // PDF export (only loaded when needed in admin)
          'pdf-export': ['html2pdf.js'],
          // Charts (only loaded on admin dashboard)
          'charts': ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 500, // Warn if chunks exceed 500KB
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // We register the service worker manually
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'service-worker.js', 'manifest.webmanifest'],
      manifest: false, // Use static manifest from public/
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [
          /\.js$/,
          /\.css$/,
          /\.(?:png|jpg|jpeg|gif|svg|webp|ico)$/,
          /\.(?:woff|woff2|ttf|eot|otf)$/,
          /\.(?:json|webmanifest|xml|txt|map)$/,
          /^\/workbox-/,
          /OneSignal/,
        ],
      },
      devOptions: {
        enabled: true
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
