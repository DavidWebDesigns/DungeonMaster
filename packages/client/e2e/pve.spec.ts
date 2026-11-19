/** Modo por defecto: tu mazmorra contra 3 bots en dificultad normal. */
import { expect, test } from '@playwright/test';

interface Hook {
  versus: boolean;
  sandbox: {
    speed: number;
    bots: Array<{ playerId: number }>;
    state: { tick: number; players: Array<{ id: number }> };
  };
}

test('la raíz abre una partida PvE con 3 rivales y niebla, sin errores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  expect(
    await page.evaluate(
      () => (window as unknown as { __dm: Hook }).__dm.sandbox.state.players.length,
    ),
  ).toBe(4);
  expect(
    await page.evaluate(() =>
      (window as unknown as { __dm: Hook }).__dm.sandbox.bots.map((b) => b.playerId),
    ),
  ).toEqual([2, 3, 4]);
  expect(await page.evaluate(() => (window as unknown as { __dm: Hook }).__dm.versus)).toBe(true);
  await page.evaluate(() => ((window as unknown as { __dm: Hook }).__dm.sandbox.speed = 4));
  const t1 = await page.evaluate(
    () => (window as unknown as { __dm: Hook }).__dm.sandbox.state.tick,
  );
  await page.waitForTimeout(3000);
  expect(
    await page.evaluate(() => (window as unknown as { __dm: Hook }).__dm.sandbox.state.tick),
  ).toBeGreaterThan(t1 + 60);
  expect(errors).toEqual([]);
});

test('?rivals=1&difficulty=hard cambia el número de bots', async ({ page }) => {
  await page.goto('/?rivals=1&difficulty=hard');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  expect(
    await page.evaluate(
      () => (window as unknown as { __dm: Hook }).__dm.sandbox.state.players.length,
    ),
  ).toBe(2);
});
