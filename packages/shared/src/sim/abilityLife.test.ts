import { describe, expect, it } from 'vitest';
import { applyStatus } from './abilities';
import { creatureMaxHp } from './creatureStats';
import { tileIndex } from './grid';
import { rulesOf } from './rules';
import { buildRooms, duel, run, spawn } from './testUtils';
import type { MatchState } from './types';

const setup = (mutate?: (d: ReturnType<typeof duel>['data']) => void) => {
  const m = duel();
  // Estas pruebas son de Rearmarse e Inmortal: la muerte es inmediata (el estado de derrotada se prueba en bodies.test).
  m.data.global.downed.seconds = 0;
  mutate?.(m.data);
  m.state.imps = [];
  return { ...m, rules: rulesOf(m.data) };
};
const reassembleChance = (data: ReturnType<typeof duel>['data'], chance: number) => {
  const a = data.abilities.find((x) => x.id === 'skeletonReassemble')!;
  if (a.effect.type === 'reassemble') a.effect.chance = chance;
};

describe('Rearmarse (Esqueleto)', () => {
  it('con suerte vuelve con el 30 % de la vida, una sola vez por vida', () => {
    const { state, data, rules } = setup((d) => reassembleChance(d, 1));
    const sk = spawn(state, data, 1, 'skeleton', 5.5, 5.5);
    sk.hp = 0;
    const events = run(state, data, 1);
    expect(state.creatures.includes(sk)).toBe(true);
    expect(sk.hp).toBe(Math.floor(creatureMaxHp(rules, sk) * 0.3));
    expect(sk.reassembled).toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'abilityUsed', ability: 'skeletonReassemble' }),
    );
    expect(events.some((e) => e.type === 'creatureDied')).toBe(false);
    // La segunda vez, muere de verdad.
    sk.hp = 0;
    const second = run(state, data, 1);
    expect(state.creatures.includes(sk)).toBe(false);
    expect(second.some((e) => e.type === 'creatureDied')).toBe(true);
  });

  it('con probabilidad 0 muere a la primera, y sin la habilidad no hay tirada de azar', () => {
    const { state, data } = setup((d) => reassembleChance(d, 0));
    const sk = spawn(state, data, 1, 'skeleton', 5.5, 5.5);
    sk.hp = 0;
    run(state, data, 1);
    expect(state.creatures.includes(sk)).toBe(false);
    // Un Goblin que muere no gasta ni un número del generador (la secuencia no cambia por esta habilidad).
    const rngBefore = state.rng;
    const g = spawn(state, data, 1, 'goblin', 6.5, 5.5);
    g.hp = 0;
    run(state, data, 1);
    expect(state.rng).toBe(rngBefore);
  });

  it('con la probabilidad real (25 %) el reparto es razonable y reproducible', () => {
    const outcome = () => {
      const { state, data } = setup();
      let back = 0;
      for (let i = 0; i < 200; i++) {
        const sk = spawn(state, data, 1, 'skeleton', 5.5, 5.5);
        sk.hp = 0;
        run(state, data, 1);
        if (state.creatures.includes(sk)) back++;
        state.creatures = [];
      }
      return back;
    };
    const a = outcome();
    expect(outcome()).toBe(a);
    expect(a / 200).toBeGreaterThan(0.15);
    expect(a / 200).toBeLessThan(0.35);
  });
});

describe('Inmortal (Vampiro)', () => {
  const withGraveyard = (state: MatchState, data: ReturnType<typeof duel>['data']) =>
    buildRooms(state, data, ['library', 'graveyard']);

  it('con Cementerio, el Vampiro vuelve a los 60 s con un nivel menos', () => {
    const { state, data } = setup();
    withGraveyard(state, data);
    const v = spawn(state, data, 1, 'vampire', 5.5, 5.5);
    v.level = 3;
    v.hp = 0;
    const ticks0 = state.tick;
    run(state, data, 1);
    expect(state.creatures.includes(v)).toBe(false);
    expect(state.revives).toEqual(
      [{ owner: 1, type: 'vampire', level: 2, at: ticks0 + 1 + 600 - 1 }].map((r) => ({
        ...r,
        at: state.revives[0]!.at,
      })),
    );
    expect(state.revives[0]!.at - ticks0).toBeGreaterThanOrEqual(600);
    // Antes de tiempo no está; pasado el plazo reaparece en el Cementerio con su vida completa.
    run(state, data, 540);
    expect(state.creatures.filter((c) => c.type === 'vampire')).toHaveLength(0);
    // Se avanza tick a tick hasta que reaparece, para ver dónde aparece antes de que se mueva.
    let events = run(state, data, 1);
    for (let i = 0; i < 120 && !state.creatures.some((c) => c.type === 'vampire'); i++)
      events = run(state, data, 1);
    const back = state.creatures.find((c) => c.type === 'vampire')!;
    expect(back).toBeDefined();
    expect(back.level).toBe(2);
    expect(back.hp).toBe(creatureMaxHp(rulesOf(data), back));
    const graveyard = state.rooms.find((r) => r.type === 'graveyard')!;
    expect(graveyard.tiles).toContain(tileIndex(state, Math.floor(back.x), Math.floor(back.y)));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'creatureArrived', creature: 'vampire' }),
    );
    expect(state.revives).toEqual([]);
  });

  it('sin Cementerio, o con nivel 1, no hay segunda vida', () => {
    const { state, data } = setup();
    const v = spawn(state, data, 1, 'vampire', 5.5, 5.5);
    v.level = 3;
    v.hp = 0;
    run(state, data, 1);
    expect(state.revives).toEqual([]);
    const m2 = setup();
    withGraveyard(m2.state, m2.data);
    const v2 = spawn(m2.state, m2.data, 1, 'vampire', 5.5, 5.5);
    v2.hp = 0;
    run(m2.state, m2.data, 1);
    expect(m2.state.revives).toEqual([]);
  });

  it('si se vende el Cementerio antes de la hora, se pierde', () => {
    const { state, data } = setup();
    withGraveyard(state, data);
    const v = spawn(state, data, 1, 'vampire', 5.5, 5.5);
    v.level = 2;
    v.hp = 0;
    run(state, data, 1);
    expect(state.revives).toHaveLength(1);
    state.rooms = state.rooms.filter((r) => r.type !== 'graveyard');
    run(state, data, 700);
    expect(state.creatures.filter((c) => c.type === 'vampire')).toHaveLength(0);
    expect(state.revives).toEqual([]);
  });

  it('si la mazmorra está llena espera hasta que haya sitio', () => {
    const { state, data } = setup((d) => {
      d.global.maxCreaturesPerPlayer = 2;
    });
    withGraveyard(state, data);
    const v = spawn(state, data, 1, 'vampire', 5.5, 5.5);
    v.level = 2;
    v.hp = 0;
    run(state, data, 1);
    const filler = [
      spawn(state, data, 1, 'goblin', 6.5, 5.5),
      spawn(state, data, 1, 'goblin', 7.5, 5.5),
    ];
    run(state, data, 700);
    expect(state.creatures.filter((c) => c.type === 'vampire')).toHaveLength(0);
    expect(state.revives).toHaveLength(1);
    state.creatures = state.creatures.filter((c) => !filler.includes(c));
    run(state, data, 5);
    expect(state.creatures.filter((c) => c.type === 'vampire')).toHaveLength(1);
  });
});

describe('Vuelo e Hija de la lava: cruzar terreno', () => {
  /** Una franja de lava de 3 tiles de ancho parte la base en dos. */
  function lavaWall(state: MatchState, data: ReturnType<typeof duel>['data']) {
    const lava = rulesOf(data).terrainIndex['lava']!;
    for (let y = 2; y <= 10; y++)
      for (let x = 5; x <= 7; x++) state.terrain[tileIndex(state, x, y)] = lava;
    state.mapVersion++;
  }

  it('el Ángel caído cruza la lava para llegar al enemigo; un Goblin no puede', () => {
    const { state, data } = setup();
    lavaWall(state, data);
    const angel = spawn(state, data, 1, 'fallenAngel', 3.5, 4.5);
    spawn(state, data, 2, 'troll', 9.5, 4.5);
    run(state, data, 120);
    expect(angel.x).toBeGreaterThan(7.5);

    const m2 = setup();
    lavaWall(m2.state, m2.data);
    const goblin = spawn(m2.state, m2.data, 1, 'goblin', 3.5, 6.5);
    spawn(m2.state, m2.data, 2, 'troll', 9.5, 6.5);
    run(m2.state, m2.data, 120);
    expect(goblin.x).toBeLessThan(5);
  });

  it('la Salamandra cruza lava pero no agua', () => {
    const { state, data, rules } = setup();
    lavaWall(state, data);
    const sal = spawn(state, data, 1, 'salamander', 3.5, 4.5);
    // El enemigo está aturdido (no se acerca a la orilla): para alcanzarlo hay que cruzar la lava.
    applyStatus(state, rules, spawn(state, data, 2, 'troll', 9.5, 4.5), 'stun', 0, 100);
    run(state, data, 150);
    expect(sal.x).toBeGreaterThan(5.5);

    const m2 = setup();
    const water = rulesOf(m2.data).terrainIndex['water']!;
    for (let y = 2; y <= 10; y++)
      for (let x = 5; x <= 7; x++) m2.state.terrain[tileIndex(m2.state, x, y)] = water;
    m2.state.mapVersion++;
    const sal2 = spawn(m2.state, m2.data, 1, 'salamander', 3.5, 4.5);
    applyStatus(m2.state, m2.rules, spawn(m2.state, m2.data, 2, 'troll', 9.5, 4.5), 'stun', 0, 100);
    run(m2.state, m2.data, 150);
    expect(sal2.x).toBeLessThan(5);
  });
});
