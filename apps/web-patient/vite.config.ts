import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const sharedTypesRoot = path.resolve(__dirname, '../../packages/shared-types/src');
const apiClientRoot = path.resolve(__dirname, '../../packages/api-client/src');
const uiRoot = path.resolve(__dirname, '../../packages/ui/src');
const utilsRoot = path.resolve(__dirname, '../../packages/utils/src');

export default defineConfig({
  plugins: [react()],
  esbuild: {
    target: 'es2022',
    tsconfigRaw: {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        useDefineForClassFields: true,
      },
    },
  },
  resolve: {
    alias: [
      { find: /^@telemed\/shared-types$/, replacement: path.join(sharedTypesRoot, 'index.ts') },
      { find: /^@telemed\/shared-types\/(.*)$/, replacement: path.join(sharedTypesRoot, '$1') },
      { find: /^@telemed\/api-client$/, replacement: path.join(apiClientRoot, 'index.ts') },
      { find: /^@telemed\/api-client\/(.*)$/, replacement: path.join(apiClientRoot, '$1') },
      { find: /^@telemed\/ui$/, replacement: path.join(uiRoot, 'index.ts') },
      { find: /^@telemed\/ui\/styles\.css$/, replacement: path.join(uiRoot, 'styles.css') },
      { find: /^@telemed\/ui\/(.*)$/, replacement: path.join(uiRoot, '$1') },
      { find: /^@telemed\/utils$/, replacement: path.join(utilsRoot, 'index.ts') },
      { find: /^@telemed\/utils\/(.*)$/, replacement: path.join(utilsRoot, '$1') },
    ],
  },
  optimizeDeps: {
    exclude: ['@telemed/shared-types', '@telemed/api-client', '@telemed/ui', '@telemed/utils'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
