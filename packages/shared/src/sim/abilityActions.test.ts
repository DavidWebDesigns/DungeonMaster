import { describe, expect, it } from 'vitest';
import { statusOf } from './abilities';
import { applyStatus } from './abilities';
import { moveSpeed } from './combat';
import { rulesOf } from './rules';
import { tileIndex } from './grid';
import { duel, run, spawn } from './testUtils';
import type { SimEvent } from './types';

const setup = () => {
  const { state, data } = duel();
  state.imps = [];
  return { state, data, rules: rulesOf(data) };
};
const used = (events: SimEvent[]) =>
  events.filter((e) => e.type === 'abilityUsed').map((e) => (e as { ability: string }).ability);

describe('Atadura y Ralentizar (un objetivo)', () => {
  it('la Torturadora de nivel 3 ata al enemigo cercano 2 s y no puede repetir hasta la recarga', () => {
    const { state, data, rules } = setup();
    const t = spawn(state, data, 1, 'torturer', 4.5, 4.5);
    t.level = 3;
    const enemy = spawn(state, data, 2, 'troll', 5.9, 4.5);
    const events = run(state, data, 3);
    expect(used(events)).toEqual(['torturerBind']);
    const root = statusOf(state, enemy, 'root');
    expect(root).toBeDefined();
    expect(moveSpeed(state, rules, enemy)).toBe(0);
    expect(t.abilityReady['torturerBind']).toBeGreaterThan(state.tick);
    // El estado dura 2 s (20 ticks) y la recarga es de 12 s: no se vuelve a lanzar enseguida.
    const more = run(state, data, 60);
    expect(used(more)).toEqual([]);
    // Pasada la recarga, la vuelve a lanzar.
    const later = run(state, data, 80);
    expect(used(later)).toContain('torturerBind');
  });

  it('con menos nivel de desbloqueo no la lanza', () => {
    const { state, data } = setup();
    const t = spawn(state, data, 1, 'torturer', 4.5, 4.5);
    t.level = 2;
    spawn(state, data, 2, 'troll', 5.9, 4.5);
    expect(used(run(state, data, 10))).toEqual([]);
  });

  it('fuera de alcance no se lanza; y no se ata a quien ya está atado', () => {
    const { state, data, rules } = setup();
    const t = spawn(state, data, 1, 'torturer', 3.5, 4.5);
    t.level = 3;
    const enemy = spawn(state, data, 2, 'troll', 8.5, 4.5);
    expect(used(run(state, data, 2))).toEqual([]);
    enemy.x = 5.0;
    applyStatus(state, rules, enemy, 'root', 0, 30);
    expect(used(run(state, data, 3))).toEqual([]);
  });

  it('el Vampiro de nivel 4 ralentiza un 30 % durante 5 s', () => {
    const { state, data } = setup();
    const v = spawn(state, data, 1, 'vampire', 4.5, 4.5);
    v.level = 4;
    const enemy = spawn(state, data, 2, 'goblin', 6.5, 4.5);
    expect(used(run(state, data, 3))).toEqual(['vampireSlow']);
    const slow = statusOf(state, enemy, 'slow')!;
    expect(slow.value).toBeCloseTo(-0.3);
    expect(slow.until - state.tick).toBeLessThanOrEqual(50);
  });

  it('la Bruja debilita (Maldición, nivel 3) y ralentiza en zona (Poción)', () => {
    const { state, data } = setup();
    const w = spawn(state, data, 1, 'witch', 3.5, 4.5);
    w.level = 3;
    const enemy = spawn(state, data, 2, 'troll', 7.5, 4.5);
    const events = run(state, data, 4);
    // La Poción va primero (orden de los datos) y la Maldición en cuanto el siguiente turno de ataque.
    expect(used(events)).toContain('witchSlowPotion');
    run(state, data, 25);
    expect(statusOf(state, enemy, 'weaken')?.value).toBeCloseTo(-0.2);
  });
});

describe('Poción de lentitud (zona)', () => {
  it('ralentiza un 40 % a los enemigos alrededor del objetivo y no a los lejanos ni a los propios', () => {
    const { state, data } = setup();
    const w = spawn(state, data, 1, 'witch', 3.5, 4.5);
    const main = spawn(state, data, 2, 'troll', 7.5, 4.5);
    const near = spawn(state, data, 2, 'goblin', 7.5, 5.5);
    const far = spawn(state, data, 2, 'goblin', 7.5, 8.5);
    const ally = spawn(state, data, 1, 'goblin', 7.0, 4.5);
    run(state, data, 3);
    for (const c of [main, near]) expect(statusOf(state, c, 'slow')?.value).toBeCloseTo(-0.4);
    expect(statusOf(state, far, 'slow')).toBeUndefined();
    expect(statusOf(state, ally, 'slow')).toBeUndefined();
    expect(w.abilityReady['witchSlowPotion']).toBeGreaterThan(0);
  });
});

describe('Carga', () => {
  it('el Caballero de nivel 3 corre hasta el enemigo y lo aturde 1 s', () => {
    const { state, data } = setup();
    const k = spawn(state, data, 1, 'darkKnight', 3.5, 4.5);
    k.level = 3;
    const enemy = spawn(state, data, 2, 'goblin', 7.5, 4.5);
    const events = run(state, data, 3);
    expect(used(events)).toContain('darkKnightCharge');
    expect(Math.hypot(k.x - enemy.x, k.y - enemy.y)).toBeLessThan(1.3);
    expect(statusOf(state, enemy, 'stun')).toBeDefined();
  });

  it('no carga contra quien ya tiene al lado, ni atravesando un muro', () => {
    const { state, data } = setup();
    const k = spawn(state, data, 1, 'darkKnight', 4.5, 4.5);
    k.level = 3;
    spawn(state, data, 2, 'goblin', 5.5, 4.5);
    expect(used(run(state, data, 3))).toEqual([]);
    // Con un muro en medio, no hay línea de visión y no carga.
    const { state: s2, data: d2, rules: r2 } = setup();
    const k2 = spawn(s2, d2, 1, 'darkKnight', 3.5, 9.5);
    k2.level = 3;
    spawn(s2, d2, 2, 'goblin', 7.5, 9.5);
    const rock = r2.terrainIndex['solidRock']!;
    for (let y = 8; y <= 10; y++) s2.terrain[tileIndex(s2, 5, y)] = rock;
    expect(used(run(s2, d2, 3))).toEqual([]);
  });
});

describe('Picada', () => {
  it('el Ángel caído salta sobre el objetivo y hace ×1,5 a todos los enemigos en 1 tile', () => {
    const { state, data } = setup();
    const a = spawn(state, data, 1, 'fallenAngel', 3.5, 4.5);
    const main = spawn(state, data, 2, 'troll', 6.5, 4.5);
    const next = spawn(state, data, 2, 'goblin', 6.5, 5.3);
    const far = spawn(state, data, 2, 'goblin', 6.5, 8.5);
    const hp0 = { main: main.hp, next: next.hp, far: far.hp };
    const events = run(state, data, 3);
    expect(used(events)).toContain('fallenAngelDive');
    // Solo los golpes de la Picada (los que reciben los enemigos); los de los rivales al Ángel no cuentan.
    const hits = (
      events.filter((e) => e.type === 'hit') as Array<{ damage: number; targetOwner: number }>
    ).filter((h) => h.targetOwner === 2);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    // Daño base 240 ×1,5 con variación de ±10 %: entre 324 y 396.
    for (const h of hits) expect(h.damage).toBeGreaterThan(300);
    expect(main.hp).toBeLessThan(hp0.main);
    expect(next.hp).toBeLessThan(hp0.next);
    expect(far.hp).toBe(hp0.far);
    expect(Math.hypot(a.x - main.x, a.y - main.y)).toBeLessThan(1);
  });

  it('también daña a los Imps enemigos del área y da experiencia', () => {
    const { state, data } = setup();
    const a = spawn(state, data, 1, 'fallenAngel', 3.5, 4.5);
    spawn(state, data, 2, 'troll', 6.5, 4.5);
    const before = a.xp;
    // Un Imp enemigo en el área de aterrizaje.
    state.imps.push({
      ...duel().state.imps[0]!,
      id: 777,
      owner: 2,
      x: 6.5,
      y: 5.2,
      hp: 600,
      held: false,
    });
    run(state, data, 3);
    expect(state.imps.find((i) => i.id === 777)!.hp).toBeLessThan(600);
    expect(a.xp).toBeGreaterThan(before);
  });
});

describe('uso de las habilidades', () => {
  it('una criatura aturdida no las lanza y las que están en recarga se saltan', () => {
    const { state, data, rules } = setup();
    const t = spawn(state, data, 1, 'torturer', 4.5, 4.5);
    t.level = 3;
    spawn(state, data, 2, 'troll', 5.9, 4.5);
    applyStatus(state, rules, t, 'stun', 0, 2);
    expect(used(run(state, data, 10))).toEqual([]);
    const later = run(state, data, 30);
    expect(used(later)).toContain('torturerBind');
  });

  it('lanzar una habilidad gasta el turno de ataque', () => {
    const { state, data } = setup();
    const t = spawn(state, data, 1, 'torturer', 4.5, 4.5);
    t.level = 3;
    const enemy = spawn(state, data, 2, 'troll', 5.9, 4.5);
    const hp0 = enemy.hp;
    run(state, data, 1);
    // El primer turno se gastó en la Atadura: aún no hay golpe básico.
    expect(statusOf(state, enemy, 'root')).toBeDefined();
    expect(enemy.hp).toBe(hp0);
  });
});
