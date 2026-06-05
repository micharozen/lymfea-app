import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';
import brandConfig from './src/config/brand.json';

// Injects brand values into index.html at build time
function brandPlugin(): Plugin {
  return {
    name: 'brand-inject',
    transformIndexHtml(html: string) {
      return html.replace(/\{\{brand\.([a-zA-Z.]+)\}\}/g, (_match, keyPath: string) => {
        const keys = keyPath.split('.');
        let value: unknown = brandConfig;
        for (const key of keys) {
          if (value && typeof value === 'object' && key in value) {
            value = (value as Record<string, unknown>)[key];
          } else {
            return _match; 
          }
        }
        return String(value);
      });
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
    brandPlugin(),
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'service-worker.js', 'manifest.webmanifest'],
      manifest: false, 
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
  ].filter((p): p is Plugin => p !== false), // Typage explicite pour éviter l'erreur d'overload
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
}));