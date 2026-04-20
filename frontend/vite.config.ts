import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
const sharedEntry = fileURLToPath(new URL('../shared/index.ts', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      shared: sharedEntry,
    },
  },
  optimizeDeps: {
    // Keep shared as live source to avoid stale prebundle cache during gameplay logic changes.
    exclude: ['shared'],
  },
  server: {
    host: '0.0.0.0', // 務必設定，否則 Docker 外部連不進去
    port: 5173,
    fs: {
      allow: [workspaceRoot],
    },
  },
});