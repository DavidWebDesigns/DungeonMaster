import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Reglas de CLAUDE.md: la simulación es pura y determinista.
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['packages/shared/src/node/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Usa el generador con semilla de la partida (rng.ts), nunca Math.random().',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'La simulación no lee el reloj: el tiempo avanza solo por ticks.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'path', '@babylonjs/*', 'colyseus', '@colyseus/*'],
              message:
                'packages/shared es TypeScript puro: sin Node, Babylon ni Colyseus (usa src/node/ para utilidades de Node).',
            },
          ],
        },
      ],
    },
  },
);
