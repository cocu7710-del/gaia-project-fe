import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',  // sockjs-client를 위한 global polyfill
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    allowedHosts: ['.trycloudflare.com'],
    hmr: false,  // 터널 사용 시 HMR 끊김으로 인한 페이지 새로고침 방지
  },
  build: {
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          websocket: ['@stomp/stompjs', 'sockjs-client'],
          state: ['zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
