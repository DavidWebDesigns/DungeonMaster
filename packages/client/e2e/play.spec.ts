import { expect, test, type Page } from '@playwright/test';

/** Lo que las pruebas necesitan del juego (gancho de depuración en window.__dm). */
interface DmHook {
  sandbox: {
    state: {
      tick: number;
      players: Array<{ gold: number; mana: number }>;
      rooms: Array<{ type: string; tiles: number[] }>;
      imps: unknown[];
      terrain: number[];
      owner: number[];
      mapVersion: number;
      width: number;
    };
    advance(ms: number): void;
  };
  data: { terrain: Array<{ id: string }> };
  camera: unknown;
  fps: number;
  notice: { text: string } | null;
  input: { tool: { kind: string; room?: string } };
  tileToScreen(x: number, y: number, height?: number): { x: number; y: number };
}

const hook = (page: Page) =>
  page.evaluateHandle(() => (window as unknown as { __dm: DmHook }).__dm);

async function terrainAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(
    ([tx, ty]) => {
      const g = (window as unknown as { __dm: DmHook }).__dm;
      return g.data.terrain[g.sandbox.state.terrain[ty! * g.sandbox.state.width + tx!] as number]!
        .id;
    },
    [x, y] as const,
  );
}

/** Avanza la simulación `seconds` segundos de juego sin esperar al reloj real. */
async function fastForward(page: Page, seconds: number) {
  await page.evaluate((s) => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    for (let i = 0; i < s; i++) g.sandbox.advance(1000);
  }, seconds);
}

/** Arrastra entre dos tiles de muro: se apunta a su cara superior (altura 1). */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const a = await page.evaluate(
    ([x, y]) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(x!, y!, 1),
    from,
  );
  const b = await page.evaluate(
    ([x, y]) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(x!, y!, 1),
    to,
  );
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?mode=solo');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  await hook(page);
  await page.waitForTimeout(300);
});

test('arrastrar con el ratón excava un pasillo y los Imps lo abren', async ({ page }) => {
  expect(await terrainAt(page, 12, 4)).toBe('earth');
  await drag(page, [11, 4], [13, 4]);
  await fastForward(page, 15);
  expect(['neutralFloor', 'claimedFloor']).toContain(await terrainAt(page, 12, 4));
});

test('llega a la veta, mina y el oro sube', async ({ page }) => {
  const gold0 = await page.evaluate(
    () => (window as unknown as { __dm: DmHook }).__dm.sandbox.state.players[0]!.gold,
  );
  await drag(page, [11, 4], [14, 4]);
  await fastForward(page, 90);
  const gold1 = await page.evaluate(
    () => (window as unknown as { __dm: DmHook }).__dm.sandbox.state.players[0]!.gold,
  );
  expect(gold1).toBeGreaterThan(gold0 + 500);
  await page.screenshot({ path: 'test-results/mined.png' });
});

test('las 5 salas se construyen con las teclas 1 a 5', async ({ page }) => {
  // Hueco libre: ampliamos el territorio desde la propia simulación para tener sitio.
  await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state;
    const claimed = g.data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 20; y++)
      for (let x = 2; x < 11; x++) {
        s.terrain[y * s.width + x] = claimed;
        s.owner[y * s.width + x] = 1;
      }
    s.mapVersion++;
    s.players[0]!.gold = 20000;
    // El HUD (9 salas en dos filas) tapa la parte baja del mapa: se centra la cámara en la zona de construcción.
    (g as unknown as { camera: { targetX: number; targetZ: number } }).camera = {
      ...(g as unknown as { camera: { targetX: number; targetZ: number } }).camera,
      targetX: 9,
      targetZ: 16,
    };
  });
  const spots: Array<[string, string, [number, number]]> = [
    ['1', 'lair', [2, 11]],
    ['2', 'hatchery', [5, 11]],
    ['3', 'treasury', [2, 15]],
    ['4', 'trainingRoom', [5, 15]],
    ['5', 'library', [8, 15]],
  ];
  for (const [key, room, [x, y]] of spots) {
    await page.keyboard.press(key);
    const p = await page.evaluate(
      ([tx, ty]) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(tx!, ty!),
      [x, y] as const,
    );
    await page.mouse.move(p.x, p.y);
    await page.mouse.click(p.x, p.y);
    await fastForward(page, 1);
    const types = await page.evaluate(() =>
      (window as unknown as { __dm: DmHook }).__dm.sandbox.state.rooms.map((r) => r.type),
    );
    expect(types, `falta ${room}`).toContain(room);
  }
  await page.screenshot({ path: 'test-results/rooms.png' });
});

test('construir sin oro avisa y no cambia nada', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __dm: DmHook }).__dm.sandbox.state.players[0]!.gold = 0;
  });
  await page.keyboard.press('1');
  const p = await page.evaluate(() =>
    (window as unknown as { __dm: DmHook }).__dm.tileToScreen(6, 2),
  );
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await fastForward(page, 1);
  const notice = await page.evaluate(
    () => (window as unknown as { __dm: DmHook }).__dm.notice?.text,
  );
  expect(notice).toContain('oro');
  const rooms = await page.evaluate(
    () =>
      (window as unknown as { __dm: DmHook }).__dm.sandbox.state.rooms.filter(
        (r) => r.type === 'lair',
      ).length,
  );
  expect(rooms).toBe(0);
});

test('Esc y clic derecho vuelven a excavar', async ({ page }) => {
  await page.keyboard.press('2');
  expect(
    await page.evaluate(() => (window as unknown as { __dm: DmHook }).__dm.input.tool.kind),
  ).toBe('build');
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(() => (window as unknown as { __dm: DmHook }).__dm.input.tool.kind),
  ).toBe('dig');
  await page.keyboard.press('3');
  await page.mouse.click(600, 400, { button: 'right' });
  expect(
    await page.evaluate(() => (window as unknown as { __dm: DmHook }).__dm.input.tool.kind),
  ).toBe('dig');
});

test('Crear Imp con Q y un clic en suelo propio', async ({ page }) => {
  await page.keyboard.press('q');
  const p = await page.evaluate(() =>
    (window as unknown as { __dm: DmHook }).__dm.tileToScreen(3, 8),
  );
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await fastForward(page, 1);
  expect(
    await page.evaluate(
      () => (window as unknown as { __dm: DmHook }).__dm.sandbox.state.imps.length,
    ),
  ).toBe(5);
});

test('rotar la cámara con Z y X sigue apuntando al mismo tile', async ({ page }) => {
  // El tile bajo el punto de mira (el encuadre deja el Corazón algo por encima del centro).
  const focus = await page.evaluate(() => {
    const cam = (window as unknown as { __dm: { camera: { targetX: number; targetZ: number } } })
      .__dm.camera;
    return { x: Math.floor(cam.targetX), y: Math.floor(cam.targetZ) };
  });
  const before = await page.evaluate(
    (f) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(f.x, f.y),
    focus,
  );
  await page.keyboard.press('x');
  await page.waitForTimeout(100);
  const after = await page.evaluate(
    (f) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(f.x, f.y),
    focus,
  );
  // El tile del centro no se mueve de sitio al girar alrededor de él.
  expect(Math.abs(before.x - after.x)).toBeLessThan(40);
  expect(Math.abs(before.y - after.y)).toBeLessThan(40);
});

test('sin errores en consola', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.reload();
  await page.waitForTimeout(1200);
  expect(errors).toEqual([]);
});

test('el HUD muestra oro, maná y salas, y sus botones eligen la herramienta', async ({ page }) => {
  await expect(page.locator('.bar.gold')).toContainText('Oro 5000 / 9000');
  await expect(page.locator('.bar.mana')).toContainText('Maná');
  await expect(page.locator('.chip').first()).toContainText('Imps 4/12');
  await expect(page.locator('.panel.rooms .btn')).toHaveCount(10);

  await page.getByRole('button', { name: /Guarida/ }).click();
  expect(
    await page.evaluate(() => (window as unknown as { __dm: DmHook }).__dm.input.tool),
  ).toEqual({
    kind: 'build',
    room: 'lair',
  });
  await expect(page.locator('.panel.rooms .btn.active')).toContainText('Guarida');

  await page.getByRole('button', { name: /^Reforzar\s*F$/ }).click();
  expect(
    (await page.evaluate(() => (window as unknown as { __dm: DmHook }).__dm.input.tool)).kind,
  ).toBe('reinforce');
  await page.screenshot({ path: 'test-results/hud.png' });
});

test('un clic en el HUD no marca nada en el mapa', async ({ page }) => {
  await page.getByRole('button', { name: /Quitar marca/ }).click();
  const log = await page.evaluate(
    () =>
      (window as unknown as { __dm: { sandbox: { state: { log: unknown[] } } } }).__dm.sandbox.state
        .log.length,
  );
  expect(log).toBe(0);
});

test('arrastrar 12 tiles de Biblioteca da una sala de nivel 10 y otra de nivel 2; el texto lo anuncia', async ({
  page,
}) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state;
    const claimed = g.data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 20; y++)
      for (let x = 2; x < 11; x++) {
        s.terrain[y * s.width + x] = claimed;
        s.owner[y * s.width + x] = 1;
      }
    s.mapVersion++;
    s.players[0]!.gold = 20000;
    (g as unknown as { camera: { targetX: number; targetZ: number } }).camera = {
      ...(g as unknown as { camera: { targetX: number; targetZ: number } }).camera,
      targetX: 9,
      targetZ: 16,
    };
  });
  await page.keyboard.press('5'); // Biblioteca
  const at = (x: number, y: number) =>
    page.evaluate(
      ([tx, ty]) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(tx!, ty!),
      [x, y] as const,
    );
  const a = await at(2, 11);
  const b = await at(7, 12); // 6 × 2 = 12 tiles
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(page.locator('.infoline')).toContainText(
    'sala nueva de nivel 10 + sala nueva de nivel 2',
  );
  await page.screenshot({ path: 'test-results/room-levels.png' });
  await page.mouse.up();
  await fastForward(page, 1);
  const levels = await page.evaluate(() =>
    (window as unknown as { __dm: DmHook }).__dm.sandbox.state.rooms
      .filter((r) => r.type === 'library')
      .map((r) => r.tiles.length)
      .sort((x, y) => y - x),
  );
  expect(levels).toEqual([10, 2]);
  // Con el cursor sobre la sala llena, la tarjeta muestra su nivel.
  await page.keyboard.press('Escape');
  await page.mouse.move(a.x, a.y);
  await expect(page.locator('.infoline')).toContainText('Biblioteca · nivel 10/10 (completa)');
});

test('V mejora un muro reforzado a nivel 2 cuando hay un Taller de nivel 10', async ({ page }) => {
  // Un muro de nivel 1 propio junto a la base y un Taller de 10 tiles (puesto por el estado, sin pasar por las salas previas).
  await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state;
    const i = 4 * s.width + 11;
    s.terrain[i] = g.data.terrain.findIndex((t) => t.id === 'reinforcedWall');
    (s as unknown as { owner: number[] }).owner[i] = 1;
    (s.rooms as unknown as Array<Record<string, unknown>>).push({
      id: 999,
      type: 'workshop',
      owner: 1,
      tiles: Array.from({ length: 10 }, (_, k) => 30 * s.width + k),
      timer: 0,
      stock: 0,
      piglets: 0,
      pigletTimer: 0,
    });
    s.mapVersion++;
  });
  await page.waitForTimeout(300);
  await expect(page.locator('.tools .btn', { hasText: 'Reforzar II' })).not.toHaveClass(/locked/);
  await page.keyboard.press('v');
  await drag(page, [11, 4], [11, 4]);
  await fastForward(page, 40);
  const id = await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    return g.data.terrain[g.sandbox.state.terrain[4 * g.sandbox.state.width + 11] as number]?.id;
  });
  expect(id).toBe('reinforcedWall2');
});

test('un Imp que holgazanea se anuncia en el HUD y B lo despierta', async ({ page }) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state as unknown as {
      tick: number;
      imps: Array<{ owner: number; loafUntil: number }>;
    };
    for (const i of s.imps.filter((k) => k.owner === 1).slice(0, 2)) i.loafUntil = s.tick + 600;
  });
  await expect(page.locator('.chip').first()).toContainText('2 holgazanean');
  const woke = await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state as unknown as {
      tick: number;
      imps: Array<{ id: number; owner: number; loafUntil: number }>;
    };
    const imp = s.imps.find((k) => k.owner === 1 && k.loafUntil > s.tick)!;
    (g.sandbox as unknown as { send(c: unknown): unknown }).send({
      type: 'slap',
      id: imp.id,
      kind: 'imp',
    });
    g.sandbox.advance(200);
    return imp.loafUntil;
  });
  expect(woke).toBe(0);
  await expect(page.locator('.chip').first()).toContainText('1 holgazanean');
});

test('O coloca una puerta básica: los Imps la construyen y cierra el paso a los enemigos', async ({
  page,
}) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state;
    const claimed = g.data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 20; y++)
      for (let x = 2; x < 11; x++) {
        s.terrain[y * s.width + x] = claimed;
        (s as unknown as { owner: number[] }).owner[y * s.width + x] = 1;
      }
    s.mapVersion++;
    s.players[0]!.gold = 5000;
    (g as unknown as { camera: { targetX: number; targetZ: number } }).camera = {
      ...(g as unknown as { camera: { targetX: number; targetZ: number } }).camera,
      targetX: 9,
      targetZ: 17,
    };
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('o');
  const p = await page.evaluate(() =>
    (window as unknown as { __dm: DmHook }).__dm.tileToScreen(5, 15),
  );
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await fastForward(page, 60);
  const door = await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state as unknown as {
      traps: Array<{ type: string; built: boolean; tile: number }>;
      doorAt: number[];
      width: number;
    };
    const t = s.traps.find((k) => k.type === 'basicDoor');
    return t ? { built: t.built, owner: s.doorAt[t.tile] } : null;
  });
  expect(door).toEqual({ built: true, owner: 1 });
  await expect(page.locator('.panel.doors .btn', { hasText: 'Puerta básica' })).toBeVisible();
  await page.screenshot({ path: 'test-results/door.png' });
});

test('0 construye el Casino (décima sala) cuando ya hay una Sala de entrenamiento', async ({
  page,
}) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state;
    const claimed = g.data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 20; y++)
      for (let x = 2; x < 11; x++) {
        s.terrain[y * s.width + x] = claimed;
        (s as unknown as { owner: number[] }).owner[y * s.width + x] = 1;
      }
    (s.rooms as unknown as Array<Record<string, unknown>>).push({
      id: 998,
      type: 'trainingRoom',
      owner: 1,
      tiles: [30 * s.width + 2],
      timer: 0,
      stock: 0,
      piglets: 0,
      pigletTimer: 0,
    });
    s.mapVersion++;
    s.players[0]!.gold = 5000;
    (g as unknown as { camera: { targetX: number; targetZ: number } }).camera = {
      ...(g as unknown as { camera: { targetX: number; targetZ: number } }).camera,
      targetX: 9,
      targetZ: 16,
    };
  });
  await page.waitForTimeout(300);
  await expect(page.locator('.panel.rooms .btn', { hasText: 'Casino' })).not.toHaveClass(/locked/);
  await page.keyboard.press('0');
  expect(
    await page.evaluate(() => (window as unknown as { __dm: DmHook }).__dm.input.tool),
  ).toEqual({ kind: 'build', room: 'casino' });
  const at = (x: number, y: number) =>
    page.evaluate(
      ([tx, ty]) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(tx!, ty!),
      [x, y] as const,
    );
  const a = await at(4, 14);
  const b = await at(6, 15);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await fastForward(page, 1);
  const tiles = await page.evaluate(
    () =>
      (window as unknown as { __dm: DmHook }).__dm.sandbox.state.rooms.find(
        (r) => r.type === 'casino',
      )?.tiles.length ?? 0,
  );
  expect(tiles).toBe(6);
  await page.screenshot({ path: 'test-results/casino.png' });
});

test('el coste se ve en vivo al pasar el cursor y un tile que conecta dos salas se paga sobre el total', async ({
  page,
}) => {
  await page.evaluate(() => {
    const g = (window as unknown as { __dm: DmHook }).__dm;
    const s = g.sandbox.state;
    const claimed = g.data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 20; y++)
      for (let x = 2; x < 11; x++) {
        s.terrain[y * s.width + x] = claimed;
        (s as unknown as { owner: number[] }).owner[y * s.width + x] = 1;
      }
    s.mapVersion++;
    s.players[0]!.gold = 50000;
    const send = (g.sandbox as unknown as { send(c: unknown): unknown }).send.bind(g.sandbox);
    send({ type: 'buildRoom', room: 'library', rect: { x: 2, y: 11, w: 4, h: 1 } });
    send({ type: 'buildRoom', room: 'library', rect: { x: 7, y: 11, w: 3, h: 1 } });
    g.sandbox.advance(300);
    (g as unknown as { camera: { targetX: number; targetZ: number } }).camera = {
      ...(g as unknown as { camera: { targetX: number; targetZ: number } }).camera,
      targetX: 9,
      targetZ: 16,
    };
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('5'); // Biblioteca
  const at = (x: number, y: number) =>
    page.evaluate(
      ([tx, ty]) => (window as unknown as { __dm: DmHook }).__dm.tileToScreen(tx!, ty!),
      [x, y] as const,
    );
  // El tile del hueco que une las dos bibliotecas (4 + 3 + 1 = 8): se paga como el tile n.º 8.
  const gap = await at(6, 11);
  await page.mouse.move(gap.x, gap.y);
  await expect(page.locator('.buildtag')).toContainText('tile n.º 8');
  await expect(page.locator('.buildtag')).toContainText('une 2 salas');
  await expect(page.locator('.panel.rooms .btn.active .cost.live')).toContainText('896');
  // Lejos de ambas, el precio vuelve a ser el del primer tile (250).
  const far = await at(5, 17);
  await page.mouse.move(far.x, far.y);
  await expect(page.locator('.buildtag')).toContainText('precio base');
  await expect(page.locator('.panel.rooms .btn.active .cost.live')).toContainText('250');
  // Construirlo une las dos salas en una de nivel 8.
  await page.mouse.move(gap.x, gap.y);
  await page.mouse.down();
  await page.mouse.up();
  await fastForward(page, 1);
  const levels = await page.evaluate(() =>
    (window as unknown as { __dm: DmHook }).__dm.sandbox.state.rooms
      .filter((r) => r.type === 'library')
      .map((r) => r.tiles.length),
  );
  expect(levels).toEqual([8]);
});

test('la Llamada a las armas se puede cancelar con el botón o con Y', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __dm: DmHook }).__dm.sandbox.state.players[0]!.mana = 5000;
  });
  const rally = () =>
    page.evaluate(() => {
      const p = (window as unknown as { __dm: DmHook }).__dm.sandbox.state
        .players[0] as unknown as { rallyTile: number };
      return p.rallyTile;
    });
  const cast = async () => {
    await page.keyboard.press('w'); // Llamada a las armas
    const at = await page.evaluate(() =>
      (window as unknown as { __dm: DmHook }).__dm.tileToScreen(6, 6),
    );
    await page.mouse.move(at.x, at.y);
    await page.mouse.click(at.x, at.y);
    await fastForward(page, 1);
  };
  await cast();
  expect(await rally()).toBeGreaterThanOrEqual(0);
  await expect(page.locator('.cancel-rally')).toBeVisible();
  await page.keyboard.press('y');
  await fastForward(page, 1);
  expect(await rally()).toBe(-1);
  await expect(page.locator('.cancel-rally')).toHaveCount(0);
  // Con el botón: la llamada tiene enfriamiento, así que se vuelve a poner por el estado.
  await page.evaluate(() => {
    const p = (window as unknown as { __dm: DmHook }).__dm.sandbox.state.players[0] as unknown as {
      rallyTile: number;
      rallyUntil: number;
    };
    const s = (window as unknown as { __dm: DmHook }).__dm.sandbox.state as unknown as {
      tick: number;
    };
    p.rallyTile = 6 * 64 + 6;
    p.rallyUntil = s.tick + 300;
  });
  await expect(page.locator('.cancel-rally')).toBeVisible();
  await page.locator('.cancel-rally').click();
  await fastForward(page, 1);
  expect(await rally()).toBe(-1);
});
