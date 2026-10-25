import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发时将管理 API 代理到 cms-core
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
      },
      // 社区版本地媒存储：预览、缩略图与原文件直出
      '/media-preview': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/media-thumb': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/media-file': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
