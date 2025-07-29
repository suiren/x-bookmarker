import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React ecosystem
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // State management and data fetching
          'state-vendor': ['zustand', '@tanstack/react-query'],
          // UI and styling
          'ui-vendor': ['lucide-react', 'clsx', 'tailwind-merge'],
          // DnD and forms
          'form-vendor': ['react-dnd', 'react-dnd-html5-backend', 'react-hook-form'],
          // Virtual scrolling
          'virtual-vendor': ['@tanstack/react-virtual'],
          // Date and utility libraries
          'util-vendor': ['date-fns', 'axios'],
        },
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
            ? chunkInfo.facadeModuleId.split('/').pop()
            : 'chunk';
          return `js/${facadeModuleId}-[hash].js`;
        },
        entryFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name?.split('.') || [];
          const ext = info[info.length - 1];
          if (/\.(png|jpe?g|svg|gif|webp|ico)$/i.test(assetInfo.name || '')) {
            return `images/[name]-[hash].${ext}`;
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name || '')) {
            return `fonts/[name]-[hash].${ext}`;
          }
          return `assets/[name]-[hash].${ext}`;
        },
      },
    },
    // Performance optimizations
    chunkSizeWarningLimit: 1000,
    minify: 'esbuild',
    target: 'es2020',
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      '@tanstack/react-virtual',
      'zustand',
      'lucide-react',
      'clsx',
      'tailwind-merge',
      'react-dnd',
      'react-dnd-html5-backend',
      'date-fns',
    ],
  },
});