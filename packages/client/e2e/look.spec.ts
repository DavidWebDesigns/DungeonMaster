import { test } from '@playwright/test';

// Captura para revisar el aspecto a ojo. Se guarda donde diga DM_SHOT (o en ./test-results).
test('captura de la mazmorra', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: process.env.DM_SHOT ?? 'test-results/look.png' });
  console.log('errores:', JSON.stringify(errors));
});
