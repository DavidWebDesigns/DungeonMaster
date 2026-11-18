import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5173,
    // /data vive en la raíz del repositorio, fuera de este paquete.
    fs: { allow: ['../..'] },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
