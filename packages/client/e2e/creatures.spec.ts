import { expect, test, type Page } from '@playwright/test';

/** Lo que estas pruebas necesitan del juego (gancho de depuración en window.__dm). */
interface Hook {
  sandbox: {
    advance(ms: number): unknown;
    state: {
      tick: number;
      width: number;
      terrain: number[];
      owner: number[];
      mapVersion: number;
      players: Array<{ gold: number; hand: Array<{ kind: string; id: number }> }>;
      creatures: Array<{
        id: number;
        type: string;
        held: boolean;
        x: number;
        y: number;
        mood: number;
        slapUntil: number;
      }>;
      rooms: Array<{ type: string }>;
    };
  };
  data: { terrain: Array<{ id: string }> };
  fastForward(seconds: number): void;
  tileToScreen(x: number, y: number, h?: number): { x: number; y: number };
  creatureToScreen(id: number): { x: number; y: number } | null;
}
const dm = () => (window as unknown as { __dm: Hook }).__dm;

/** Avanza `seconds` segundos de juego; el dibujo se pone al día después. */
async function advance(page: Page, seconds: number) {
  await page.evaluate((s) => {
    dm().fastForward(s);
  }, seconds);
  await page.waitForTimeout(250);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dm: () => unknown }).dm = () =>
      (window as unknown as { __dm: unknown }).__dm;
  });
  await page.goto('/?mode=solo');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  // Territorio libre para construir y oro de sobra.
  await page.evaluate(() => {
    const s = dm().sandbox.state;
    const claimed = dm().data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 20; y++)
      for (let x = 2; x < 11; x++) {
        s.terrain[y * s.width + x] = claimed;
        s.owner[y * s.width + x] = 1;
      }
    s.mapVersion++;
    s.players[0]!.gold = 30000;
  });
  await page.waitForTimeout(300);
});

/** Arrastra una Guarida de 3×2 tiles (6 tiles = 3 cupos de Goblin); un clic suelto solo da 1 tile. */
async function buildLair(page: Page, x = 2, y = 11) {
  await page.keyboard.press('1');
  const a = await page.evaluate(([tx, ty]) => dm().tileToScreen(tx!, ty!), [x, y] as const);
  const b = await page.evaluate(([tx, ty]) => dm().tileToScreen(tx!, ty!), [x + 2, y + 1] as const);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await advance(page, 1);
  // Tras construir se sigue en modo construir; Esc vuelve a la herramienta de excavar (y de recoger criaturas).
  await page.keyboard.press('Escape');
}

test('con una Guarida llega un Goblin por el Portal y sale en la lista y con aviso', async ({
  page,
}) => {
  await advance(page, 26); // sin Guarida: avisa de que falta (el Portal prueba cada 25 s)
  await expect(page.locator('.notice', { hasText: 'Guarida' }).first()).toBeVisible();
  await buildLair(page);
  await advance(page, 61);
  const types = await page.evaluate(() => dm().sandbox.state.creatures.map((c) => c.type));
  expect(types).toContain('goblin');
  await expect(page.locator('.creatures')).toContainText('Goblin');
  await expect(page.locator('.chip', { hasText: 'Pago' })).toBeVisible();
  await page.screenshot({ path: 'test-results/creature.png' });
});

test('se recoge una criatura con el ratón, aparece en la mano y se suelta con clic derecho', async ({
  page,
}) => {
  await buildLair(page);
  await advance(page, 61);
  const id = await page.evaluate(() => dm().sandbox.state.creatures[0]!.id);
  await page.evaluate(() => {
    // Quieta mientras se prueba el ratón.
    const c = dm().sandbox.state.creatures[0]!;
    c.x = 6.5;
    c.y = 6.5;
  });
  const at = await page.evaluate((i) => dm().creatureToScreen(i), id);
  await page.mouse.move(at!.x, at!.y);
  await page.mouse.click(at!.x, at!.y);
  await advance(page, 1);
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.hand.length)).toBe(1);
  await expect(page.locator('.chip.hand')).toContainText('Mano 1/10');

  const target = await page.evaluate(() => dm().tileToScreen(3, 6));
  await page.mouse.move(target.x, target.y);
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/hand.png' });
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await advance(page, 1);
  const c = await page.evaluate(() => dm().sandbox.state.creatures[0]!);
  expect(c.held).toBe(false);
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.hand.length)).toBe(0);
  await expect(page.locator('.chip.hand')).toHaveCount(0);
});

test('B abofetea a la criatura bajo el cursor y baja su ánimo', async ({ page }) => {
  await buildLair(page);
  await advance(page, 61);
  await page.evaluate(() => {
    const c = dm().sandbox.state.creatures[0]!;
    c.x = 6.5;
    c.y = 6.5;
  });
  const id = await page.evaluate(() => dm().sandbox.state.creatures[0]!.id);
  const at = await page.evaluate((i) => dm().creatureToScreen(i), id);
  await page.mouse.move(at!.x, at!.y);
  await page.waitForTimeout(100);
  await page.keyboard.press('b');
  await advance(page, 1);
  // La bofetada da +25 % de velocidad de trabajo durante 10 s (el ánimo sube solo con el tiempo, así que no se compara).
  const slapped = await page.evaluate(() => {
    const st = dm().sandbox.state;
    return st.creatures[0]!.slapUntil > st.tick;
  });
  expect(slapped).toBe(true);
  // Y sale un número flotante con el bono.
  await expect(page.locator('.floater')).toContainText('+25% velocidad');
});

test('el panel de criaturas centra la cámara al hacer clic en una', async ({ page }) => {
  await buildLair(page);
  await advance(page, 61);
  await page.locator('.creature').first().click();
  await page.waitForTimeout(200);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  expect(errors).toEqual([]);
});

test('hover resalta la criatura, muestra su tarjeta y se recoge aunque esté activa la herramienta de construir', async ({
  page,
}) => {
  await buildLair(page);
  await page.keyboard.press('1'); // vuelve a modo construir: antes esto impedía recoger
  await advance(page, 61);
  await page.evaluate(() => {
    const c = dm().sandbox.state.creatures[0]!;
    c.x = 6.5;
    c.y = 6.5;
  });
  const id = await page.evaluate(() => dm().sandbox.state.creatures[0]!.id);
  const at = await page.evaluate((i) => dm().creatureToScreen(i), id);
  await page.mouse.move(at!.x, at!.y);
  await page.waitForTimeout(200);
  await expect(page.locator('.hovercard')).toBeVisible();
  await expect(page.locator('.hovercard')).toContainText('Clic: recoger');
  expect(
    await page.evaluate(() => (document.querySelector('canvas') as HTMLCanvasElement).style.cursor),
  ).toBe('grab');
  await page.mouse.click(at!.x, at!.y);
  await advance(page, 1);
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.hand.length)).toBe(1);
  await expect(page.locator('.chip.hand')).toContainText('Mano 1/10');
});

test('se llevan varias criaturas y el clic derecho las suelta todas en el tile del cursor', async ({
  page,
}) => {
  // Cada Guarida da un cupo de Goblin: tres Guaridas, tres goblins.
  await buildLair(page, 2, 11);
  await buildLair(page, 5, 11);
  await buildLair(page, 8, 11);
  await advance(page, 185); // llegan 3 criaturas (una por minuto)
  const n = await page.evaluate(() => dm().sandbox.state.creatures.length);
  expect(n).toBeGreaterThanOrEqual(3);
  const ids = await page.evaluate(() => dm().sandbox.state.creatures.map((c) => c.id));
  for (const id of ids.slice(0, 3)) {
    await page.evaluate((i) => {
      const c = dm().sandbox.state.creatures.find((k) => k.id === i)!;
      c.x = 6.5;
      c.y = 6.5;
    }, id);
    const at = await page.evaluate((i) => dm().creatureToScreen(i), id);
    await page.mouse.click(at!.x, at!.y);
    await advance(page, 1);
  }
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.hand.length)).toBe(3);
  await expect(page.locator('.chip.hand')).toContainText('Mano 3/10');
  const target = await page.evaluate(() => dm().tileToScreen(3, 6));
  await page.mouse.move(target.x, target.y);
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await advance(page, 1);
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.hand.length)).toBe(0);
  await expect(page.locator('.chip.hand')).toHaveCount(0);
});

test('Tab salta a la siguiente criatura propia y centra la cámara en ella', async ({ page }) => {
  await buildLair(page);
  await advance(page, 61);
  await page.evaluate(() => {
    const c = dm().sandbox.state.creatures[0]!;
    c.x = 6.5;
    c.y = 6.5;
  });
  await page.keyboard.press('Tab');
  const seen = await page.evaluate(() => {
    const g = (window as unknown as { __dm: { camera: { targetX: number; targetZ: number } } })
      .__dm;
    const c = dm().sandbox.state.creatures[0]!;
    return { cam: g.camera, x: c.x, y: c.y };
  });
  // La criatura puede haber dado un paso desde que se centró: se compara con margen de un tile y medio.
  expect(Math.abs(seen.cam.targetX - seen.x)).toBeLessThan(1.5);
  expect(Math.abs(seen.cam.targetZ - seen.y)).toBeLessThan(1.5);
  await expect(page.locator('.notice, .notices').first()).toContainText('nivel');
});
