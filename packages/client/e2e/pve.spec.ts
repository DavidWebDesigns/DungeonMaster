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

test('la maqueta de menús solo aparece con ?menus=preview y el juego normal no la carga', async ({
  page,
}) => {
  await page.goto('/?menus=preview');
  await expect(page.locator('.mainmenu')).toBeVisible();
  await expect(page.locator('.pvesetup .difficulties button')).toHaveCount(3);
  await expect(page.locator('.results .endstats')).toBeVisible();
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  await expect(page.locator('.mainmenu')).toHaveCount(0);
});

test('F9 llena el maná y F10 alterna ver todo el mapa (trampas de pruebas del PvE)', async ({
  page,
}) => {
  await page.goto('/?rivals=1');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  type Dbg = {
    __dm: { sandbox: { revealMap: boolean; state: { players: Array<{ mana: number }> } } };
  };
  await page.evaluate(() => {
    (window as unknown as Dbg).__dm.sandbox.state.players[0]!.mana = 10;
  });
  await page.keyboard.press('F9');
  expect(
    await page.evaluate(() => (window as unknown as Dbg).__dm.sandbox.state.players[0]!.mana),
  ).toBeGreaterThan(4000);
  await page.keyboard.press('F10');
  expect(await page.evaluate(() => (window as unknown as Dbg).__dm.sandbox.revealMap)).toBe(true);
  await page.keyboard.press('F10');
  expect(await page.evaluate(() => (window as unknown as Dbg).__dm.sandbox.revealMap)).toBe(false);
});

test('resistencia: 90 s a velocidad ×4 contra 3 bots sin errores y con el reloj avanzando', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?seed=3');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  await page.evaluate(() => ((window as unknown as { __dm: Hook }).__dm.sandbox.speed = 4));
  await page.waitForTimeout(90_000);
  const state = await page.evaluate(() => (window as unknown as { __dm: Hook }).__dm.sandbox.state);
  // Mucho más de lo que daría ×1 en 90 s (900 ticks), aunque el WebGL por software vaya lento.
  expect(state.tick).toBeGreaterThan(1500);
  expect(errors).toEqual([]);
});
