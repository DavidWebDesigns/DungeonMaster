/**
 * Prueba de humo de la Puerta 2: abrir el navegador, excavar una mazmorra, minar y construir las 5 salas,
 * y medir el rendimiento. Con WebGL por software (sin GPU) el número de FPS es solo una cota inferior:
 * el objetivo de 60 fps se confirma en un portátil real durante el playtest.
 */
import { expect, test, type Page } from '@playwright/test';

interface Hook {
  fps: number;
  renderer: { engine: { getFps(): number } };
  sandbox: {
    advance(ms: number): unknown;
    state: {
      tick: number;
      width: number;
      terrain: number[];
      owner: number[];
      mapVersion: number;
      imps: unknown[];
      rooms: Array<{ type: string }>;
      players: Array<{ gold: number }>;
    };
  };
  data: { terrain: Array<{ id: string }> };
  tileToScreen(x: number, y: number, h?: number): { x: number; y: number };
}
const dm = () => (window as unknown as { __dm: Hook }).__dm;

async function dragWall(page: Page, from: [number, number], to: [number, number]) {
  const a = await page.evaluate(([x, y]) => dm().tileToScreen(x!, y!, 1), from);
  const b = await page.evaluate(([x, y]) => dm().tileToScreen(x!, y!, 1), to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test('sesión completa: excavar, minar, construir las 5 salas y mantener el rendimiento', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  // `dm()` también existe dentro de la página: las funciones de evaluate se ejecutan allí, no en Node.
  await page.addInitScript(() => {
    (window as unknown as { dm: () => unknown }).dm = () =>
      (window as unknown as { __dm: unknown }).__dm;
  });
  await page.goto('/?mode=solo');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);

  // 1. Excavar hasta la veta (14,4) y minarla.
  const gold0 = await page.evaluate(() => dm().sandbox.state.players[0]!.gold);
  await dragWall(page, [11, 4], [14, 4]);
  await page.evaluate(() => {
    for (let i = 0; i < 80; i++) dm().sandbox.advance(1000);
  });
  const gold1 = await page.evaluate(() => dm().sandbox.state.players[0]!.gold);
  expect(gold1, 'el oro minado llega a la Tesorería').toBeGreaterThan(gold0 + 500);

  // 2. Más territorio y construir las 5 salas con 1 a 5.
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
    // El HUD (9 salas en dos filas) tapa la parte baja del mapa: se centra la cámara en la zona de construcción.
    const g = dm() as unknown as { camera: { targetX: number; targetZ: number } };
    g.camera = { ...g.camera, targetX: 6, targetZ: 13 };
  });
  // El dibujo se pone al día en el siguiente tick: sin esta espera el ratón apuntaría a bloques que aún se ven como muros.
  await page.waitForTimeout(300);
  const spots: Array<[string, [number, number]]> = [
    ['1', [2, 11]],
    ['2', [5, 11]],
    ['3', [2, 15]],
    ['4', [5, 15]],
    ['5', [8, 15]],
  ];
  for (const [key, [x, y]] of spots) {
    await page.keyboard.press(key);
    const p = await page.evaluate(([tx, ty]) => dm().tileToScreen(tx!, ty!), [x, y] as const);
    await page.mouse.click(p.x, p.y);
    await page.evaluate(() => dm().sandbox.advance(1000));
  }
  const types = await page.evaluate(() => dm().sandbox.state.rooms.map((r) => r.type));
  for (const t of ['lair', 'hatchery', 'treasury', 'trainingRoom', 'library'])
    expect(types).toContain(t);

  // 3. Rendimiento: coste de la simulación y FPS de dibujo con todo en pantalla.
  const stepMs = await page.evaluate(() => {
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) dm().sandbox.advance(1000);
    return (performance.now() - t0) / 600;
  });
  await page.waitForTimeout(3000);
  const fps = await page.evaluate(() => dm().renderer.engine.getFps());
  console.log(`tick medio: ${stepMs.toFixed(2)} ms · FPS (WebGL por software): ${fps.toFixed(0)}`);
  await page.screenshot({ path: 'test-results/smoke.png' });

  expect(stepMs, 'el tick debe costar mucho menos de 30 ms').toBeLessThan(10);
  expect(fps, 'incluso con WebGL por software debe ser fluido').toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
