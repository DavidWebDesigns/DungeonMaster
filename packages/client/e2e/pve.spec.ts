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
  ).toBeGreaterThan(t1 + 30);
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

test('el minimapa se dibuja y un clic en él mueve la cámara a ese punto', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?rivals=1');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  const mini = page.locator('canvas.minimap');
  await expect(mini).toBeVisible();
  type Cam = { __dm: { camera: { targetX: number; targetZ: number } } };
  const countDigs = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { __dm: { sandbox: { state: { tasks: Array<{ kind: string }> } } } }
        ).__dm.sandbox.state.tasks.filter((t) => t.kind === 'dig').length,
    );
  const digsBefore = await countDigs();
  const before = await page.evaluate(() => (window as unknown as Cam).__dm.camera.targetX);
  const box = (await mini.boundingBox())!;
  // Esquina inferior derecha del minimapa = esquina inferior derecha del mapa (64×64).
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.9);
  const after = await page.evaluate(() => (window as unknown as Cam).__dm.camera);
  expect(after.targetX).toBeGreaterThan(before + 10);
  expect(after.targetX).toBeGreaterThan(50);
  expect(after.targetZ).toBeGreaterThan(50);
  // El clic en el minimapa no marca nada para excavar en el mapa (las tareas de reclamar son automáticas de los Imps).
  expect(await countDigs()).toBe(digsBefore);
  await page.screenshot({ path: 'test-results/minimap.png' });
});

test('P pausa la partida y el reloj lo indica; ] sube la velocidad y se ve en la barra', async ({
  page,
}) => {
  await page.goto('/?rivals=1');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  const tick = () =>
    page.evaluate(() => (window as unknown as { __dm: Hook }).__dm.sandbox.state.tick);
  await page.keyboard.press('p');
  await expect(page.locator('.chip.clock')).toContainText('Pausa');
  const t1 = await tick();
  await page.waitForTimeout(800);
  expect(await tick()).toBe(t1);
  await page.keyboard.press('p');
  await expect(page.locator('.chip.clock')).not.toContainText('Pausa');
  await page.keyboard.press(']');
  await expect(page.locator('.chip.clock')).toContainText('×2');
});

test('el minimapa no tapa ningún otro panel de la interfaz', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?rivals=1');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  const mini = (await page.locator('canvas.minimap').boundingBox())!;
  const overlaps = (b: { x: number; y: number; width: number; height: number }) =>
    b.x < mini.x + mini.width &&
    b.x + b.width > mini.x &&
    b.y < mini.y + mini.height &&
    b.y + b.height > mini.y;
  for (const sel of [
    '.surrender',
    '.creatures',
    '.top',
    '.tools',
    '.rooms',
    '.spells',
    '.notices',
  ]) {
    for (const el of await page.locator(sel).all()) {
      const b = await el.boundingBox();
      if (b && b.width > 0 && b.height > 0)
        expect(overlaps(b), `${sel} solapa el minimapa`).toBe(false);
    }
  }
});

test('las unidades rivales llevan un símbolo de enemigo y las propias no', async ({ page }) => {
  await page.goto('/?rivals=1');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  type Dbg = {
    __dm: {
      sandbox: { state: { imps: Array<{ id: number; owner: number }> } };
      renderer: { scene: { getMeshByName(n: string): { isEnabled(): boolean } | null } };
    };
  };
  await page.evaluate(() => (window as unknown as Dbg).__dm.sandbox.state.imps.length);
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => {
    const d = (window as unknown as Dbg).__dm;
    const mark = (id: number) => d.renderer.scene.getMeshByName(`enemyMark${id}i`) !== null;
    return {
      mine: d.sandbox.state.imps.filter((i) => i.owner === 1).map((i) => mark(i.id)),
      theirs: d.sandbox.state.imps.filter((i) => i.owner !== 1).map((i) => mark(i.id)),
    };
  });
  expect(res.mine.length).toBeGreaterThan(0);
  expect(res.mine.every((m) => !m)).toBe(true);
  expect(res.theirs.length).toBeGreaterThan(0);
  expect(res.theirs.every((m) => m)).toBe(true);
});

test('el Corazón muestra su barra de vida cuando recibe daño (y no antes)', async ({ page }) => {
  await page.goto('/?mode=solo');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  type Dbg = {
    __dm: {
      sandbox: {
        state: {
          players: Array<{ id: number; heartHp: number }>;
          rooms: Array<{ id: number; type: string; owner: number }>;
        };
      };
      renderer: { scene: { getMeshByName(n: string): { isEnabled(): boolean } | null } };
    };
  };
  const heartId = await page.evaluate(
    () =>
      (window as unknown as Dbg).__dm.sandbox.state.rooms.find(
        (r) => r.type === 'heart' && r.owner === 1,
      )!.id,
  );
  const barOf = () =>
    page.evaluate(
      (id) =>
        (window as unknown as Dbg).__dm.renderer.scene.getMeshByName(`heartBarFill${id}`) !== null,
      heartId,
    );
  await page.waitForTimeout(400);
  expect(await barOf()).toBe(false);
  await page.evaluate(() => {
    (window as unknown as Dbg).__dm.sandbox.state.players.find((p) => p.id === 1)!.heartHp -= 2000;
  });
  await page.waitForTimeout(400);
  expect(await barOf()).toBe(true);
  await page.screenshot({ path: 'test-results/heartbar.png' });
});
