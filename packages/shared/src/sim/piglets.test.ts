import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { creatureMaxHp } from './creatureStats';
import { pigletCap, pigletCount } from './creatureEconomy';
import { newCreature, populationOf } from './portal';
import { rulesOf } from './rules';
import { step } from './step';
import { buildRooms, matchAtCorner0, run } from './testUtils';
import type { Creature, MatchState, SimEvent } from './types';
import type { DataSet } from '../data';

/** Guarida (8 camas) y Criadero de 9 tiles; sin Portal ni pagos que molesten. */
/** Con `breed` falso no se crían cerditos solos: cada prueba pone los suyos. */
function world(rooms: Parameters<typeof buildRooms>[2] = ['lair', 'hatchery'], breed = false) {
  const m = matchAtCorner0();
  if (!breed) m.data.rooms.find((r) => r.id === 'hatchery')!.pigletIntervalSeconds = 100000;
  m.data.global.portal.attractIntervalSeconds = 100000;
  m.data.economy.paydayIntervalSeconds = 100000;
  m.data.economy.hunger.risePerSecond = 0.0001;
  m.data.economy.sleep.risePerSecond = 0.0001;
  buildRooms(m.state, m.data, rooms);
  m.state.imps = m.state.imps.filter((i) => i.owner !== 1);
  return m;
}

function goblin(state: MatchState, data: DataSet, patch: Partial<Creature> = {}) {
  const c = newCreature(state, rulesOf(data), 1, 'goblin', 9 * 64 + 9);
  c.beds = [11 * 64 + 2];
  c.x = 9.5;
  c.y = 9.5;
  Object.assign(c, patch);
  state.creatures.push(c);
  return c;
}

const hatchery = (state: MatchState) => state.rooms.find((r) => r.type === 'hatchery')!;

describe('Criadero: cerditos', () => {
  it('cada tile cría un cerdito cada 20 s', () => {
    const { state, data } = world(undefined, true);
    for (let i = 0; i < 3; i++) goblin(state, data);
    const tiles = hatchery(state).tiles.length;
    expect(data.rooms.find((r) => r.id === 'hatchery')!.pigletIntervalSeconds).toBe(20);
    run(state, data, 190);
    expect(hatchery(state).piglets).toBe(0);
    run(state, data, 15); // pasan los 20 s
    expect(hatchery(state).piglets).toBe(tiles);
    run(state, data, 200);
    expect(hatchery(state).piglets).toBe(tiles * 2);
  });

  it('con 1 tile solo cría 1 cada 20 s', () => {
    const { state, data } = world(['lair'], true);
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'hatchery',
      rect: { x: 6, y: 17, w: 1, h: 1 },
    });
    for (let i = 0; i < 3; i++) goblin(state, data);
    run(state, data, 230);
    expect(hatchery(state).piglets).toBe(1);
  });

  it('el tope es 3 por cada criatura de la población máxima actual y no se pasa', () => {
    const { state, data } = world(undefined, true);
    const rules = rulesOf(data);
    const max = populationOf(state, rules, 1).max;
    expect(max).toBeGreaterThan(0);
    expect(pigletCap(state, rules, 1)).toBe(3 * max);
    run(state, data, 20 * 10 * 30); // mucho más de lo que hace falta para llenar el tope
    expect(pigletCount(state, 1)).toBe(3 * max);
    run(state, data, 400);
    expect(pigletCount(state, 1)).toBe(3 * max);
  });

  it('sin población máxima (sin Guarida ni nadie) no se cría ninguno', () => {
    const m = matchAtCorner0();
    m.data.global.portal.attractIntervalSeconds = 100000;
    buildRooms(m.state, m.data, ['hatchery']);
    run(m.state, m.data, 600);
    expect(pigletCount(m.state, 1)).toBe(0);
  });
});

describe('devorar cerditos', () => {
  it('una criatura herida va al Criadero, se come un cerdito y recupera el 30 % de su vida máxima', () => {
    const { state, data } = world();
    hatchery(state).piglets = 2;
    const c = goblin(state, data);
    const max = creatureMaxHp(rulesOf(data), c);
    c.hp = max * 0.5;
    const events: SimEvent[] = [];
    for (let n = 0; n < 400; n++) events.push(...step(state, data));
    const eaten = events.filter((e) => e.type === 'pigletEaten');
    expect(eaten).toHaveLength(1);
    expect(hatchery(state).piglets).toBe(1);
    // +30 % de la vida máxima (y algo de curación natural si se acostó).
    expect(c.hp).toBeGreaterThanOrEqual(max * 0.8 - 1);
    expect((eaten[0] as { healed: number }).healed).toBe(Math.round(max * 0.3));
  });

  it('nunca pasa de la vida máxima', () => {
    const { state, data } = world();
    hatchery(state).piglets = 1;
    const c = goblin(state, data);
    const max = creatureMaxHp(rulesOf(data), c);
    c.hp = max * 0.65;
    run(state, data, 400);
    expect(c.hp).toBeLessThanOrEqual(max);
    expect(hatchery(state).piglets).toBe(0);
  });

  it('una criatura con la vida casi llena no se come ninguno', () => {
    const { state, data } = world();
    hatchery(state).piglets = 3;
    const c = goblin(state, data);
    c.hp = creatureMaxHp(rulesOf(data), c) * 0.85;
    run(state, data, 300);
    expect(hatchery(state).piglets).toBe(3);
  });

  it('sin cerditos no va a ningún sitio', () => {
    const { state, data } = world();
    const c = goblin(state, data);
    c.hp = creatureMaxHp(rulesOf(data), c) * 0.4;
    run(state, data, 100);
    expect(state.creatures.some((k) => k.goal === 'piglet')).toBe(false);
  });

  it('cada criatura se come un cerdito: dos heridas y dos cerditos, ninguno sobra', () => {
    const { state, data } = world();
    hatchery(state).piglets = 2;
    const a = goblin(state, data);
    const b = goblin(state, data, { beds: [11 * 64 + 3] });
    for (const c of [a, b]) c.hp = creatureMaxHp(rulesOf(data), c) * 0.4;
    run(state, data, 600);
    expect(hatchery(state).piglets).toBe(0);
  });

  it('los cerditos desaparecen con el Criadero y no se ven en el de otro jugador', () => {
    const { state, data } = world();
    hatchery(state).piglets = 4;
    applyCommand(state, data, 1, { type: 'sellRoom', tile: { x: 6, y: 11 } });
    step(state, data);
    expect(pigletCount(state, 1)).toBe(0);
  });
});
