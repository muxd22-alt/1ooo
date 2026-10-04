import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }]
  },
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  server: {
    watch: {
      ignored: ['**/.chrome*/**', '**/.shots/**', '**/.assets-src/**', '**/dist/**']
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
