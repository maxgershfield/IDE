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
    /** Prefer TS sources over stale `tsc` emit sitting next to them (`foo.js` vs `foo.ts`). */
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.jsx', '.js', '.json'],
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
    /** Desktop uses Electron only; never auto-open a system browser tab. */
    open: false
  }
});
