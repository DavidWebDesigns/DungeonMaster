import { defineConfig } from 'vitest/config';

/** Pruebas de rendimiento (miden tiempo real, por eso no entran en `pnpm check`): `pnpm perf`. */
export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.perf.ts'],
    environment: 'node',
    // Un archivo a la vez, para no medir con la CPU ocupada por otras pruebas.
    fileParallelism: false,
  },
});
