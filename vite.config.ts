import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // Vite injects `crossorigin` on module scripts; with loadFile(file://) Chromium often refuses to run them → blank window.
    {
      name: 'electron-file-strip-crossorigin',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '');
      },
    },
  ],
  base: './', // required for Electron loadFile: relative paths work with file://
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared')
    }
  },
  server: {
    port: 3000,
    host: '127.0.0.1',
    strictPort: true,
    open: false
  }
});
