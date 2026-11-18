import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  test: {
    include: ['packages/**/src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
