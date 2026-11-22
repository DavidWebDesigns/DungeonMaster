import { expect, test, type Page } from '@playwright/test';

interface Hook {
  fastForward(seconds: number): void;
  sandbox: {
    state: {
      width: number;
      terrain: number[];
      owner: number[];
      mapVersion: number;
      players: Array<{ gold: number; hand: Array<{ kind: string; id: number }> }>;
      rooms: Array<{ type: string }>;
      traps: Array<{ type: string; built: boolean; owner: number }>;
      imps: Array<{
        id: number;
        owner: number;
        held: boolean;
        x: number;
        y: number;
        taskId: number;
        slapUntil: number;
      }>;
      tick: number;
      roomAt: number[];
      tasks: Array<{ id: number; kind: string }>;
    };
  };
  data: { terrain: Array<{ id: string }> };
  tileToScreen(x: number, y: number, h?: number): { x: number; y: number };
  impToScreen(id: number): { x: number; y: number } | null;
}
const dm = () => (window as unknown as { __dm: Hook }).__dm;

async function advance(page: Page, seconds: number) {
  await page.evaluate((s) => dm().fastForward(s), seconds);
  await page.waitForTimeout(250);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { dm: () => unknown }).dm = () =>
      (window as unknown as { __dm: unknown }).__dm;
  });
  await page.goto('/?mode=solo');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  await page.evaluate(() => {
    const s = dm().sandbox.state;
    const claimed = dm().data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 20; y++)
      for (let x = 2; x < 11; x++) {
        s.terrain[y * s.width + x] = claimed;
        s.owner[y * s.width + x] = 1;
      }
    s.mapVersion++;
    s.players[0]!.gold = 9000;
    // El HUD (9 salas en dos filas) tapa la parte baja: se centra la cámara en la zona de construcción.
    const g = dm() as unknown as { camera: { targetX: number; targetZ: number } };
    g.camera = { ...g.camera, targetX: 7, targetZ: 14 };
  });
  await page.waitForTimeout(300);
});

test('el Taller desbloquea las trampas físicas, que se colocan y construyen los Imps', async ({
  page,
}) => {
  // Antes del Taller, las 6 trampas salen bloqueadas.
  await expect(page.locator('.panel.traps .btn.locked')).toHaveCount(6);
  // La Sala de entrenamiento (4) y el Taller (7, que la exige) se construyen con el ratón.
  await page.keyboard.press('4');
  const training = await page.evaluate(() => dm().tileToScreen(3, 15));
  await page.mouse.click(training.x, training.y);
  await advance(page, 1);
  await page.keyboard.press('7');
  const workshop = await page.evaluate(() => dm().tileToScreen(7, 12));
  await page.mouse.click(workshop.x, workshop.y);
  await advance(page, 1);
  expect(await page.evaluate(() => dm().sandbox.state.rooms.map((r) => r.type))).toContain(
    'workshop',
  );
  // Las físicas ya se pueden usar; las elementales siguen pidiendo Cámara de tortura y Biblioteca.
  await expect(page.locator('.panel.traps .btn.locked')).toHaveCount(3);

  await page.keyboard.press('g'); // Trampa de pinchos
  await expect(page.locator('.panel.traps .btn.active')).toContainText('Trampa de pinchos');
  // La orden se manda directamente (el HUD tapa buena parte del mapa en esta resolución).
  const placed = await page.evaluate(() => {
    const st = dm().sandbox.state;
    for (let y = 12; y < 20; y++)
      for (let x = 10; x >= 2; x--) {
        const i = y * st.width + x;
        if (st.owner[i] === 1 && (st.roomAt as number[])[i] === 0)
          return (dm().sandbox as unknown as { send(c: unknown): { ok: boolean } }).send({
            type: 'buildTrap',
            trap: 'spikeTrap',
            tile: { x, y },
          });
      }
    return null;
  });
  expect(placed).toMatchObject({ ok: true });
  await advance(page, 1);
  expect(await page.evaluate(() => dm().sandbox.state.traps)).toMatchObject([
    { type: 'spikeTrap', built: false },
  ]);
  await advance(page, 100);
  expect(await page.evaluate(() => dm().sandbox.state.traps)).toMatchObject([
    { type: 'spikeTrap', built: true },
  ]);
  await page.screenshot({ path: 'test-results/trap.png' });
});

test('sin Taller, colocar una trampa avisa de lo que falta', async ({ page }) => {
  // Con la Tesorería llena saldría ese aviso en su lugar.
  await page.evaluate(() => (dm().sandbox.state.players[0]!.gold = 5000));
  await advance(page, 1);
  await page.keyboard.press('g');
  const spot = await page.evaluate(() => dm().tileToScreen(10, 12));
  await page.mouse.click(spot.x, spot.y);
  await advance(page, 1);
  await expect(page.locator('.notice', { hasText: 'Te falta construir: Taller' })).toBeVisible();
  expect(await page.evaluate(() => dm().sandbox.state.traps.length)).toBe(0);
});

test('se recoge un Imp con el ratón y al soltarlo va a la tarea marcada más cercana', async ({
  page,
}) => {
  // Una excavación marcada cerca del punto de suelta.
  const a = await page.evaluate(() => dm().tileToScreen(11, 8, 1));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.up();
  await advance(page, 1);
  const id = await page.evaluate(() => dm().sandbox.state.imps.find((i) => i.owner === 1)!.id);
  await page.evaluate((i) => {
    const imp = dm().sandbox.state.imps.find((k) => k.id === i)!;
    imp.x = 6.5;
    imp.y = 6.5;
  }, id);
  const at = await page.evaluate((i) => dm().impToScreen(i), id);
  await page.mouse.click(at!.x, at!.y);
  await advance(page, 1);
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.hand)).toMatchObject([
    { kind: 'imp' },
  ]);
  await expect(page.locator('.chip.hand')).toContainText('Mano 1/10');
  // Un tile de suelo que no quede tapado por ningún muro desde la cámara.
  const drop = await page.evaluate(() => dm().tileToScreen(8, 7));
  await page.mouse.move(drop.x, drop.y);
  await page.mouse.click(drop.x, drop.y, { button: 'right' });
  await advance(page, 1);
  const imp = await page.evaluate((i) => dm().sandbox.state.imps.find((k) => k.id === i)!, id);
  expect(imp.held).toBe(false);
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.hand.length)).toBe(0);
});

test('un clic sobre un tile ya marcado para excavar lo desmarca', async ({ page }) => {
  const a = await page.evaluate(() => dm().tileToScreen(11, 8, 1));
  const digs = () =>
    page.evaluate(() => dm().sandbox.state.tasks.filter((t) => t.kind === 'dig').length);
  const before = await digs();
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.up();
  await advance(page, 1);
  expect(await digs()).toBe(before + 1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.up();
  await advance(page, 1);
  expect(await digs()).toBe(before);
});

test('B sobre un Imp lo abofetea y trabaja más rápido durante un rato', async ({ page }) => {
  const id = await page.evaluate(() => dm().sandbox.state.imps.find((i) => i.owner === 1)!.id);
  await page.evaluate((i) => {
    const imp = dm().sandbox.state.imps.find((k) => k.id === i)!;
    imp.x = 3.5;
    imp.y = 9.5;
  }, id);
  const at = await page.evaluate((i) => dm().impToScreen(i), id);
  await page.mouse.move(at!.x, at!.y);
  await page.waitForTimeout(150);
  await page.keyboard.press('b');
  await advance(page, 1);
  const slapped = await page.evaluate((i) => {
    const st = dm().sandbox.state;
    return st.imps.find((k) => k.id === i)!.slapUntil > st.tick;
  }, id);
  expect(slapped).toBe(true);
  await expect(page.locator('.floater')).toContainText('+25% velocidad');
});

test('las salas con requisitos salen bloqueadas y se desbloquean al construir lo que piden', async ({
  page,
}) => {
  // Taller (7), Cementerio (8), Templo (9) y Casino (0) empiezan bloqueados y dicen qué falta.
  await expect(page.locator('.panel.rooms .btn.locked')).toHaveCount(4);
  await expect(page.locator('.panel.rooms .btn.locked').first()).toContainText(
    'Sala de entrenamiento',
  );
  await page.keyboard.press('7'); // Taller
  await page.mouse.move(400, 300);
  // Elegirla y soltar donde sea da el aviso con el nombre de lo que falta.
  const spot = await page.evaluate(() => dm().tileToScreen(3, 12));
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('.notice').first()).toContainText(
    'Te falta construir: Sala de entrenamiento',
  );
  // Con la Sala de entrenamiento construida, el Taller queda disponible.
  await page.evaluate(() => {
    const s = dm().sandbox.state;
    (
      s.rooms as Array<{
        id: number;
        type: string;
        owner: number;
        tiles: number[];
        timer: number;
        stock: number;
      }>
    ).push({
      id: 998,
      type: 'trainingRoom',
      owner: 1,
      tiles: [],
      timer: 0,
      stock: 0,
    });
  });
  await page.waitForTimeout(400);
  await expect(page.locator('.panel.rooms .btn.locked')).toHaveCount(2);
});
