import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'packages/client/e2e',
  timeout: 90_000,
  retries: 0,
  // Un solo navegador a la vez: WebGL por software gasta mucha CPU y en paralelo las pruebas se vuelven lentas e inestables.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      // WebGL por software: funciona en máquinas sin GPU y en CI.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // Servidor de partidas en red. Colyseus responde 404 en la raíz, así que se espera solo a que el puerto acepte conexiones.
      command: 'pnpm --filter @dm/server start',
      port: 2567,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
