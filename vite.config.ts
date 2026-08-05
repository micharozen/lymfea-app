import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';
// Note: index.html used to be brand-injected here at build time. One build now
// serves every domain, so the brand is resolved from the hostname at runtime —
// see src/config/applyBrandToDocument.ts.

// Adds crossorigin="anonymous" to all script tags for proper error reporting
function crossoriginPlugin(): Plugin {
  return {
    name: 'crossorigin-inject',
    transformIndexHtml(html: string) {
      // Add crossorigin to script tags that don't already have it
      return html.replace(
        /<script\s+([^>]*?)(?<!crossorigin\s*=\s*"[^"]*")\s*>/gi,
        (match, attrs) => {
          // Skip if already has crossorigin
          if (/crossorigin\s*=/i.test(attrs)) {
            return match;
          }
          // Add crossorigin="anonymous" before the closing >
          return `<script ${attrs.trim()} crossorigin="anonymous">`;
        }
      );
    }
  };
}

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, "index.html"),
        landing: path.resolve(__dirname, "landing.html"),
      },
      output: {
        // CORRECTION : manualChunks doit être une fonction pour Vite 8 / Rolldown
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Regroupement par thématique comme dans ton ancienne config
            if (id.includes('framer-motion')) {
              return 'vendor-motion';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('@tanstack/react-query')) {
              return 'vendor-query';
            }
            if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) {
              return 'vendor-form';
            }
            if (id.includes('date-fns')) {
              return 'vendor-date';
            }
            if (id.includes('html2pdf.js')) {
              return 'pdf-export';
            }
            if (id.includes('recharts')) {
              return 'charts';
            }
            // Par défaut pour le reste des node_modules
            return 'vendor-others';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Augmenté car les chunks vendor sont souvent > 500kb
  },
  plugins: [
    crossoriginPlugin(),
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'service-worker.js', 'manifest.webmanifest'],
      manifest: false, 
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Do not precache app-shell build assets. Hash-named JS/CSS/HTML can
        // become stale across deploys and trigger dynamic import failures.
        globPatterns: ['**/*.{ico,png,svg,woff,woff2,webmanifest}'],
        navigateFallback: null,
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
  ].filter((p): p is Plugin => p !== false), // Typage explicite pour éviter l'erreur d'overload
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
}));