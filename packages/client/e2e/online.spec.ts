/**
 * Partida en red con dos navegadores: uno crea la sala, el otro se une con el código, juegan y ven el mismo resultado.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

interface Hook {
  me: number;
  versus: boolean;
  sandbox: {
    state: {
      tick: number;
      status: string;
      result: { winners: number[]; reason: string } | null;
      players: Array<{ id: number; slot: number; gold: number; eliminated: boolean }>;
      imps: Array<{ owner: number }>;
      tasks: Array<{ kind: string }>;
      terrain: number[];
    };
    framesApplied: number;
    ghosts: unknown[];
  };
  data: {
    terrain: Array<{ id: string }>;
    map: {
      bases: Array<{ slot: number; claimed: { x: number; y: number; w: number; h: number } }>;
    };
  };
  tileToScreen(x: number, y: number, h?: number): { x: number; y: number };
}
const dm = () => (window as unknown as { __dm: Hook }).__dm;

async function newPlayer(browser: Browser, nick: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    (window as unknown as { dm: () => unknown }).dm = () =>
      (window as unknown as { __dm: unknown }).__dm;
  });
  await page.goto('/?mode=online');
  await page.locator('input.nick').fill(nick);
  return page;
}

test('dos navegadores: crear sala con código, unirse, lobby, partida, órdenes y resultado compartido', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ana = await newPlayer(browser, 'Ana');
  const errors: string[] = [];
  ana.on('pageerror', (e) => errors.push(String(e)));

  // Ana crea la sala y ve su código.
  await ana.getByRole('button', { name: 'Crear sala' }).click();
  const code = (await ana.locator('.roomcode').innerText()).trim();
  expect(code).toMatch(/^[A-Z]{6}$/);

  // Beto se une con el código.
  const beto = await newPlayer(browser, 'Beto');
  beto.on('pageerror', (e) => errors.push(String(e)));
  await beto.locator('input.code').fill(code);
  await beto.getByRole('button', { name: 'Unirse' }).click();
  await expect(beto.locator('.roomcode')).toHaveText(code);
  await expect(ana.locator('.players li')).toHaveCount(4); // 2 jugadores + 2 huecos
  await expect(ana.locator('.players li.me .pname')).toContainText('Ana');
  await expect(ana.locator('.players')).toContainText('Beto');

  // Ana no puede empezar hasta que Beto esté listo.
  await expect(ana.getByRole('button', { name: 'Empezar partida' })).toBeDisabled();
  await beto.getByRole('button', { name: '¡Listo!' }).click();
  await expect(ana.getByRole('button', { name: 'Empezar partida' })).toBeEnabled();
  await ana.getByRole('button', { name: 'Empezar partida' }).click();
  await expect(ana.locator('.countdown')).toBeVisible();

  // Cuenta atrás (10 s) y partida: los dos ven su juego.
  await ana.waitForFunction(
    () => (window as unknown as { __dm?: unknown }).__dm !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  await beto.waitForFunction(
    () => (window as unknown as { __dm?: unknown }).__dm !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  const idA = await ana.evaluate(() => dm().me);
  const idB = await beto.evaluate(() => dm().me);
  expect([idA, idB].sort()).toEqual([1, 2]);
  await expect(ana.locator('.bar.gold')).toContainText('Oro');

  // Cada uno ve a sus 4 Imps y a ninguno del rival (niebla en el servidor).
  for (const [page, me] of [
    [ana, idA],
    [beto, idB],
  ] as const) {
    const imps = await page.evaluate(() => dm().sandbox.state.imps.map((i) => i.owner));
    expect(imps.filter((o) => o === me)).toHaveLength(4);
    expect(imps.filter((o) => o !== me)).toHaveLength(0);
  }

  // Ana da una orden de excavar con el ratón: aparece como tarea en su estado, y Beto nunca ve esa tarea.
  // Un muro de tierra pegado a su base (la esquina sale al azar con la semilla de la partida).
  const wall = await ana.evaluate(() => {
    const g = dm();
    const st = g.sandbox.state;
    const slot = st.players.find((p) => p.id === g.me)!.slot;
    const c = g.data.map.bases.find((b) => b.slot === slot)!.claimed;
    const earth = g.data.terrain.findIndex((t) => t.id === 'earth');
    for (let y = c.y; y < c.y + c.h; y++) {
      for (const x of [c.x - 1, c.x + c.w]) if (st.terrain[y * 64 + x] === earth) return { x, y };
    }
    return null;
  });
  expect(wall).not.toBeNull();
  const spot = await ana.evaluate(([x, y]) => dm().tileToScreen(x!, y!, 1), [
    wall!.x,
    wall!.y,
  ] as const);
  await ana.mouse.move(spot.x, spot.y);
  await ana.mouse.down();
  await ana.mouse.up();
  await expect
    .poll(() => ana.evaluate(() => dm().sandbox.state.tasks.length), { timeout: 10_000 })
    .toBeGreaterThan(0);
  expect(await beto.evaluate(() => dm().sandbox.state.tasks.length)).toBe(0);

  // Los dos relojes avanzan al ritmo del servidor.
  const t1 = await ana.evaluate(() => dm().sandbox.state.tick);
  await ana.waitForTimeout(1500);
  const t2 = await ana.evaluate(() => dm().sandbox.state.tick);
  expect(t2 - t1).toBeGreaterThan(8);
  expect(t2 - t1).toBeLessThan(25);

  // Beto se rinde (dos pulsaciones) y ambos ven el resultado.
  await beto.locator('.surrender').click();
  await beto.locator('.surrender').click();
  await expect(ana.locator('.gameover')).toContainText('¡Victoria!', { timeout: 15_000 });
  await expect(beto.locator('.gameover')).toContainText('Derrota', { timeout: 15_000 });
  expect(await ana.evaluate(() => dm().sandbox.state.result)).toEqual(
    await beto.evaluate(() => dm().sandbox.state.result),
  );
  await expect(ana.locator('.endstats')).toContainText('Beto');
  await expect(ana.locator('.endstats th')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('unirse con un código que no existe avisa y no entra', async ({ browser }) => {
  const p = await newPlayer(browser, 'Zoe');
  await p.locator('input.code').fill('ZZZZZZ');
  await p.getByRole('button', { name: 'Unirse' }).click();
  await expect(p.locator('.error')).toContainText('No existe');
});

test('un enlace con ?code= lleva directo a la sala', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana');
  await ana.getByRole('button', { name: 'Crear sala' }).click();
  const code = (await ana.locator('.roomcode').innerText()).trim();
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.addInitScript(() => localStorage.setItem('dm.nick', 'Carla'));
  await p.goto(`/?mode=online&code=${code}`);
  await expect(p.locator('.roomcode')).toHaveText(code);
  await expect(ana.locator('.players')).toContainText('Carla');
});

test('reconexión: un jugador recarga la página en plena partida y vuelve a su juego sin perder nada', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ana = await newPlayer(browser, 'Ana');
  await ana.getByRole('button', { name: 'Crear sala' }).click();
  const code = (await ana.locator('.roomcode').innerText()).trim();
  const beto = await newPlayer(browser, 'Beto');
  await beto.locator('input.code').fill(code);
  await beto.getByRole('button', { name: 'Unirse' }).click();
  await expect(beto.locator('.roomcode')).toHaveText(code);
  await beto.getByRole('button', { name: '¡Listo!' }).click();
  await ana.getByRole('button', { name: 'Empezar partida' }).click();
  for (const p of [ana, beto]) {
    await p.waitForFunction(
      () => (window as unknown as { __dm?: unknown }).__dm !== undefined,
      undefined,
      { timeout: 30_000 },
    );
  }
  const before = await beto.evaluate(() => ({ me: dm().me, tick: dm().sandbox.state.tick }));

  // Beto recarga la página: vuelve con el token guardado y recibe una instantánea de lo que ve.
  await beto.reload();
  await beto.waitForFunction(
    () => (window as unknown as { __dm?: unknown }).__dm !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  const after = await beto.evaluate(() => ({
    me: dm().me,
    tick: dm().sandbox.state.tick,
    imps: dm().sandbox.state.imps.map((i) => i.owner),
  }));
  expect(after.me).toBe(before.me);
  expect(after.tick).toBeGreaterThan(before.tick);
  expect(after.imps.filter((o) => o === after.me)).toHaveLength(4);
  await expect(beto.locator('.bar.gold')).toContainText('Oro');
  // La partida de Ana sigue en marcha y no terminó por la caída.
  expect(await ana.evaluate(() => dm().sandbox.state.status)).toBe('playing');

  // Tras reconectar, Beto puede dar órdenes otra vez (se rinde y Ana gana).
  await beto.locator('.surrender').click();
  await beto.locator('.surrender').click();
  await expect(ana.locator('.gameover')).toContainText('¡Victoria!', { timeout: 15_000 });
});
