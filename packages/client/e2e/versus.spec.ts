import { expect, test, type Page } from '@playwright/test';

interface Hook {
  fastForward(seconds: number): void;
  versus: boolean;
  sandbox: {
    state: {
      tick: number;
      status: string;
      result: { winners: number[]; reason: string } | null;
      players: Array<{
        id: number;
        heartHp: number;
        mana: number;
        eliminated: boolean;
        seen: number[];
      }>;
      creatures: Array<{ id: number; owner: number }>;
      imps: Array<{ owner: number }>;
      rooms: Array<{ owner: number; type: string }>;
    };
  };
  tileToScreen(x: number, y: number, h?: number): { x: number; y: number };
}
const dm = () => (window as unknown as { __dm: Hook }).__dm;

async function open(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { dm: () => unknown }).dm = () =>
      (window as unknown as { __dm: unknown }).__dm;
  });
  await page.goto('/?vs=bot');
  await page.waitForFunction(() => (window as unknown as { __dm?: unknown }).__dm !== undefined);
  await page.waitForTimeout(300);
}

test('contra un bot: hay dos jugadores, niebla y el bot juega por su cuenta sin errores', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await open(page);
  expect(await page.evaluate(() => dm().versus)).toBe(true);
  expect(await page.evaluate(() => dm().sandbox.state.players.length)).toBe(2);
  // Cinco minutos de juego: el bot construye y cría criaturas sin romper nada.
  await page.evaluate(() => dm().fastForward(300));
  await page.waitForTimeout(300);
  const bot = await page.evaluate(() => {
    const s = dm().sandbox.state;
    return {
      rooms: s.rooms.filter((r) => r.owner === 2).map((r) => r.type),
      imps: s.imps.filter((i) => i.owner === 2).length,
    };
  });
  expect(bot.rooms).toContain('lair');
  expect(bot.imps).toBeGreaterThan(4);
  await page.screenshot({ path: 'test-results/versus.png' });
  expect(errors).toEqual([]);
});

test('el HUD muestra los cinco hechizos y se puede elegir uno con W', async ({ page }) => {
  await open(page);
  await expect(page.locator('.panel.spells .btn')).toHaveCount(5);
  await page.keyboard.press('t');
  await expect(page.locator('.panel.spells .btn.active')).toContainText('Rayo');
});

test('rendirse pide confirmación y termina la partida con la pantalla de derrota', async ({
  page,
}) => {
  await open(page);
  const btn = page.locator('.surrender');
  await expect(btn).toHaveText('Rendirse');
  await btn.click();
  await expect(btn).toContainText('¿Seguro?');
  expect(await page.evaluate(() => dm().sandbox.state.players[0]!.eliminated)).toBe(false);
  await btn.click();
  await page.evaluate(() => dm().fastForward(2));
  await expect(page.locator('.gameover')).toContainText('Derrota');
  expect(await page.evaluate(() => dm().sandbox.state.result)).toMatchObject({
    winners: [2],
    reason: 'lastStanding',
  });
  await expect(page.locator('.gameover .btn')).toContainText('Jugar de nuevo');
  // Estadísticas de la partida local: "Tú" y el bot, con las cinco columnas.
  await expect(page.locator('.endstats tbody tr')).toHaveCount(2);
  await expect(page.locator('.endstats')).toContainText('Tú');
  await expect(page.locator('.endstats th')).toHaveCount(5);
});

test('si el Corazón rival cae, sale la pantalla de victoria', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    dm().sandbox.state.players[1]!.heartHp = 0;
    dm().fastForward(2);
  });
  await expect(page.locator('.gameover')).toContainText('¡Victoria!');
});

test('la niebla oculta el terreno nunca visto y recuerda el ya visto', async ({ page }) => {
  await open(page);
  const seen = await page.evaluate(() => {
    const p = dm().sandbox.state.players[0]!;
    return { total: p.seen.reduce((a, b) => a + b, 0), all: p.seen.length };
  });
  expect(seen.total).toBeGreaterThan(50);
  expect(seen.total).toBeLessThan(seen.all / 4);
});
