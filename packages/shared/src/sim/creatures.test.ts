import { describe, expect, it } from 'vitest';
import type { DataSet } from '../data';
import { applyCommand } from './applyCommand';
import {
  creatureMaxHp,
  creatureWage,
  levelMultiplier,
  moodBandOf,
  scaledStat,
} from './creatureStats';
import { removeCreature } from './needs';
import { attractionCandidates, newCreature, tickPortals } from './portal';
import { rulesOf } from './rules';
import { step } from './step';
import { buildRooms, loadData, matchAtCorner0, run, type ROOM_SPOTS } from './testUtils';
import type { Creature, MatchState, SimEvent } from './types';

const PORTAL_TILE = 9 * 64 + 9;

/** Partida con las salas pedidas; las criaturas se añaden a mano para controlar cada prueba. */
function world(
  rooms: Array<keyof typeof ROOM_SPOTS> = [],
  mutate?: (d: DataSet) => void,
  portalOn = false,
) {
  const m = matchAtCorner0();
  // Salvo en las pruebas del Portal, no llegan criaturas solas: cada prueba controla las suyas.
  if (!portalOn) m.data.global.portal.attractIntervalSeconds = 100000;
  mutate?.(m.data);
  buildRooms(m.state, m.data, rooms);
  return m;
}

function addCreature(
  state: MatchState,
  data: DataSet,
  type: string,
  patch: Partial<Creature> = {},
): Creature {
  const rules = rulesOf(data);
  const c = newCreature(state, rules, 1, type, PORTAL_TILE);
  const def = rules.creatureDefs[type]!;
  if (def.base.lairTiles > 0) {
    // Cama automática si hay Guarida.
    state.creatures.push(c);
    state.creatures.pop();
  }
  Object.assign(c, patch);
  state.creatures.push(c);
  return c;
}

const eventsOf = (events: SimEvent[], type: SimEvent['type']) =>
  events.filter((e) => e.type === type);

describe('niveles y estadísticas', () => {
  const data = loadData();
  const rules = rulesOf(data);

  it('vida, daño y sueldo escalan con mult(n) = 1 + 0,35 × (n − 1) y se redondean hacia abajo', () => {
    const goblin = rules.creatureDefs['goblin']!.base;
    [1, 1.35, 1.7, 2.05, 2.4].forEach((m, i) =>
      expect(levelMultiplier(rules, i + 1)).toBeCloseTo(m, 10),
    );
    expect([1, 2, 3, 4, 5].map((n) => scaledStat(rules, 'hp', goblin.hp, n))).toEqual([
      1500, 2025, 2550, 3075, 3600,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => scaledStat(rules, 'damage', goblin.damage, n))).toEqual([
      60, 81, 102, 123, 144,
    ]);
    expect([1, 2, 3, 4, 5].map((n) => scaledStat(rules, 'wage', goblin.wage, n))).toEqual([
      100, 135, 170, 205, 240,
    ]);
  });

  it('un valor que no escala con el nivel no cambia', () => {
    const d = structuredClone(data);
    d.progression.scalesWithLevel = ['hp'];
    expect(scaledStat(rulesOf(d), 'wage', 100, 5)).toBe(100);
  });

  it('las bandas de ánimo cubren de 0 a 100', () => {
    const ids = [100, 90, 89, 65, 64, 40, 39, 20, 19, 6, 5, 0].map((m) => moodBandOf(rules, m).id);
    expect(ids).toEqual([
      'radiant',
      'radiant',
      'happy',
      'happy',
      'neutral',
      'neutral',
      'unhappy',
      'unhappy',
      'angry',
      'angry',
      'furious',
      'furious',
    ]);
  });

  it('vida máxima y sueldo de una criatura salen de su nivel', () => {
    const c = { type: 'troll', level: 3 };
    expect(creatureMaxHp(rules, c)).toBe(4250);
    expect(creatureWage(rules, c)).toBe(255);
  });
});

describe('el Portal atrae criaturas', () => {
  it('sin Guarida nadie llega y avisa de que falta una Guarida', () => {
    const { state, data } = world([], undefined, true);
    const events = run(state, data, 300);
    expect(state.creatures).toHaveLength(0);
    // La partida de 2 jugadores trae un segundo Portal: solo cuenta el del jugador 1.
    expect(
      eventsOf(events, 'portalIdle').filter((e) => (e as { playerId: number }).playerId === 1),
    ).toEqual([{ type: 'portalIdle', playerId: 1, reason: 'noLair' }]);
  });

  it('con Guarida llega un Goblin a los 30 s y ocupa una cama', () => {
    const { state, data } = world(['lair'], undefined, true);
    const before = state.tick;
    const events = run(state, data, 300);
    expect(state.tick - before).toBe(300);
    const arrived = eventsOf(events, 'creatureArrived');
    expect(arrived).toHaveLength(1);
    expect(arrived[0]).toMatchObject({ creature: 'goblin', playerId: 1 });
    expect(state.creatures).toHaveLength(1);
    expect(state.creatures[0]!.beds).toHaveLength(1);
    expect(state.rooms.find((r) => r.type === 'lair')!.tiles).toContain(
      state.creatures[0]!.beds[0],
    );
  });

  it('cada criatura ocupa su propia cama y al llenarse la Guarida avisa', () => {
    const { state, data } = world(['lair'], undefined, true);
    const events = run(state, data, 300 * 10);
    expect(state.creatures).toHaveLength(8); // 4×2 tiles = 8 camas
    const beds = state.creatures.flatMap((c) => c.beds);
    expect(new Set(beds).size).toBe(8);
    expect(
      eventsOf(events, 'portalIdle').some((e) => e.type === 'portalIdle' && e.reason === 'noLair'),
    ).toBe(true);
  });

  it('el requisito de cada criatura: Troll con Sala de entrenamiento, Warlock con Biblioteca, Demonio con Criadero y entrenamiento', () => {
    const { state, data } = world(['lair']);
    const rules = rulesOf(data);
    const types = () =>
      attractionCandidates(state, rules, 1, PORTAL_TILE).candidates.map((c) => c.type);
    expect(types()).toEqual(['goblin']);
    buildRooms(state, data, ['trainingRoom']);
    expect(types()).toEqual(['goblin', 'troll']);
    buildRooms(state, data, ['library']);
    expect(types()).toEqual(['goblin', 'troll', 'warlock']);
    buildRooms(state, data, ['hatchery']);
    expect(types()).toEqual(['goblin', 'troll', 'warlock', 'bileDemon']);
  });

  it('el reparto sigue los pesos 4, 3, 3 y 2 y es el mismo con la misma semilla', () => {
    const run1 = () => {
      const { state, data } = world(
        ['lair', 'trainingRoom', 'library', 'hatchery'],
        undefined,
        true,
      );
      const rules = rulesOf(data);
      const counts: Record<string, number> = {};
      const interval = Math.round(data.global.portal.attractIntervalSeconds * data.global.tickRate);
      for (let i = 0; i < 1200; i++) {
        state.creatures = [];
        const portal = state.rooms.find((r) => r.type === 'portal')!;
        portal.timer = interval - 1;
        tickPortals(state, rules, []);
        const c = state.creatures[0];
        if (c) counts[c.type] = (counts[c.type] ?? 0) + 1;
      }
      return counts;
    };
    const a = run1();
    expect(run1()).toEqual(a);
    const share = (t: string) => (a[t] ?? 0) / 1200;
    expect(share('goblin')).toBeGreaterThan(4 / 12 - 0.05);
    expect(share('goblin')).toBeLessThan(4 / 12 + 0.05);
    expect(share('troll')).toBeGreaterThan(3 / 12 - 0.05);
    expect(share('warlock')).toBeGreaterThan(3 / 12 - 0.05);
    expect(share('bileDemon')).toBeGreaterThan(2 / 12 - 0.05);
    expect(share('bileDemon')).toBeLessThan(2 / 12 + 0.05);
  });

  it('el Demonio de bilis ocupa dos tiles de cama contiguos', () => {
    const { state, data } = world(['lair', 'trainingRoom', 'hatchery']);
    const rules = rulesOf(data);
    const c = newCreature(state, rules, 1, 'bileDemon', PORTAL_TILE);
    state.creatures.push(c);
    run(state, data, 10); // la cama se asigna en el paso de necesidades
    expect(c.beds).toHaveLength(2);
    expect(
      Math.abs(c.beds[0]! - c.beds[1]!) === 1 || Math.abs(c.beds[0]! - c.beds[1]!) === 64,
    ).toBe(true);
  });

  it('respeta la reserva de 15 criaturas por Portal', () => {
    const { state, data } = world(['lair'], undefined, true);
    const rules = rulesOf(data);
    for (let i = 0; i < 15; i++)
      state.creatures.push(newCreature(state, rules, 1, 'goblin', PORTAL_TILE));
    const events = run(state, data, 300);
    expect(state.creatures).toHaveLength(15);
    expect(eventsOf(events, 'portalIdle')).toContainEqual({
      type: 'portalIdle',
      playerId: 1,
      reason: 'full',
    });
  });

  it('respeta el máximo de criaturas por jugador', () => {
    const { state, data } = world(
      ['lair'],
      (d) => {
        d.global.maxCreaturesPerPlayer = 2;
      },
      true,
    );
    const events = run(state, data, 300 * 4);
    expect(state.creatures).toHaveLength(2);
    expect(
      eventsOf(events, 'portalIdle').some((e) => e.type === 'portalIdle' && e.reason === 'full'),
    ).toBe(true);
  });
});

describe('necesidades', () => {
  it('el hambre sube 0,3889 por segundo y el sueño 0,3333', () => {
    const { state, data } = world();
    const c = addCreature(state, data, 'goblin');
    run(state, data, 100);
    expect(c.hunger).toBeCloseTo(0.3889 * 9, 3); // el primer segundo cuenta al llegar al tick 10
    expect(c.sleep).toBeCloseTo(0.3333 * 9, 3);
  });

  it('con hambre va al Criadero, come un pollo y vuelve a 0', () => {
    const { state, data } = world(['hatchery']);
    const hatchery = state.rooms.find((r) => r.type === 'hatchery')!;
    hatchery.stock = 3;
    hatchery.timer = -1_000_000; // sin producción nueva durante la prueba
    const c = addCreature(state, data, 'goblin', { hunger: 75 });
    const events = run(state, data, 300);
    expect(eventsOf(events, 'ate')).toHaveLength(1);
    expect(c.hunger).toBeLessThan(20);
    expect(state.rooms.find((r) => r.type === 'hatchery')!.stock).toBe(2);
  });

  it('el Criadero produce 1 pollo cada 20 s por cada 3 tiles, con tope de 2 por tile', () => {
    const { state, data } = world(['hatchery']);
    const room = state.rooms.find((r) => r.type === 'hatchery')!;
    room.timer = 0;
    run(state, data, 200);
    expect(room.stock).toBe(3); // 9 tiles → 3 productores
    run(state, data, 200 * 10);
    expect(room.stock).toBe(18); // tope: 2 × 9 tiles
  });

  it('sin pollos no come y a hambre total pierde un 1 % de vida por segundo hasta morir', () => {
    const { state, data } = world();
    const c = addCreature(state, data, 'goblin', { hunger: 100 });
    const max = creatureMaxHp(rulesOf(data), c);
    run(state, data, 100);
    expect(c.hp).toBeCloseTo(max - 0.01 * max * 9, 0);
    const events = run(state, data, 1100);
    expect(state.creatures).toHaveLength(0);
    expect(eventsOf(events, 'creatureDied')).toEqual([
      { type: 'creatureDied', playerId: 1, creatureId: c.id, cause: 'starvation' },
    ]);
  });

  it('con sueño va a su cama, descansa 20 s, se cura y vuelve a 0', () => {
    const { state, data } = world(['lair']);
    const c = addCreature(state, data, 'goblin', { sleep: 85, hp: 1000 });
    c.beds = [2 * 64 + 2 + 9 * 64 + 0]; // un tile de la Guarida (2,11)
    c.beds = [11 * 64 + 2];
    run(state, data, 100);
    expect(c.goal).toBe('bed');
    run(state, data, 300);
    expect(c.sleep).toBeLessThan(10);
    expect(c.hp).toBeGreaterThan(1000 + 100);
  });

  it('sin cama no puede dormir y su ánimo baja de banda', () => {
    const { state, data } = world(); // sin Guarida
    const c = addCreature(state, data, 'goblin', { mood: 60, wageSat: 1 });
    expect(c.beds).toHaveLength(0);
    run(state, data, 600);
    expect(c.mood).toBeLessThan(60);
    expect(c.band).not.toBe('happy');
  });

  it('con cama el ánimo se mantiene alto', () => {
    const { state, data } = world(['lair']);
    const rules = rulesOf(data);
    const c = newCreature(state, rules, 1, 'goblin', PORTAL_TILE);
    c.beds = [11 * 64 + 2];
    c.wageSat = 1;
    state.creatures.push(c);
    run(state, data, 600);
    expect(c.mood).toBeGreaterThan(70);
  });
});

describe('día de pago', () => {
  it('cada 120 s la criatura cobra su sueldo de la Tesorería y queda satisfecha', () => {
    const { state, data } = world(['lair']);
    const c = addCreature(state, data, 'goblin');
    c.beds = [11 * 64 + 2];
    state.players[0]!.gold = 5000;
    const events = run(state, data, 1300);
    const paid = eventsOf(events, 'paid');
    expect(eventsOf(events, 'payday')).toHaveLength(1);
    expect(paid).toEqual([{ type: 'paid', playerId: 1, creatureId: c.id, amount: 100, ok: true }]);
    expect(c.payPending).toBe(false);
    expect(c.wageSat).toBeGreaterThan(0.9);
  });

  it('el sueldo sube con el nivel', () => {
    const { state, data } = world(['lair']);
    const c = addCreature(state, data, 'goblin', { level: 3 });
    c.beds = [11 * 64 + 2];
    state.players[0]!.gold = 5000;
    const events = run(state, data, 1300);
    expect(eventsOf(events, 'paid')[0]).toMatchObject({ amount: 170, ok: true });
  });

  it('sin oro en día de pago no cobra, se enfada y su ánimo cae', () => {
    const { state, data } = world(['lair']);
    const c = addCreature(state, data, 'goblin');
    c.beds = [11 * 64 + 2];
    c.wageSat = 0;
    state.players[0]!.gold = 0;
    const events = run(state, data, 1300);
    expect(eventsOf(events, 'paid')).toEqual([
      { type: 'paid', playerId: 1, creatureId: c.id, amount: 0, ok: false },
    ]);
    expect(c.wageSat).toBeLessThan(-0.9);
    const moodAfterPayday = c.mood;
    run(state, data, 1200 * 2);
    expect(c.mood).toBeLessThan(moodAfterPayday + 1);
    expect(c.mood).toBeLessThan(50);
  });

  it('un impago que se repite lleva a Descontento y luego a Enfadado', () => {
    const { state, data } = world(); // sin Guarida: tampoco tiene cama
    const c = addCreature(state, data, 'goblin', { hunger: 0, wageSat: -1 });
    state.players[0]!.gold = 0;
    const bands = new Set<string>();
    for (let i = 0; i < 40; i++) {
      run(state, data, 100);
      if (state.creatures.length === 0) break;
      bands.add(c.band);
      c.wageSat = -1;
      c.hunger = 60;
      c.sleep = 0;
    }
    expect(bands.has('unhappy') || bands.has('angry')).toBe(true);
  });
});

describe('ánimo y abandono', () => {
  it('una criatura Furiosa 30 s seguidos abandona la mazmorra', () => {
    const { state, data } = world();
    const c = addCreature(state, data, 'goblin', { mood: 2, wageSat: -1, hunger: 100 });
    const events = run(state, data, 50);
    expect(state.creatures).toHaveLength(1);
    expect(c.band).toBe('furious');
    const more = run(state, data, 300);
    expect(state.creatures).toHaveLength(0);
    expect(eventsOf(more, 'creatureLeft')).toEqual([
      { type: 'creatureLeft', playerId: 1, creatureId: c.id },
    ]);
    void events;
  });

  it('si el ánimo sube antes de los 30 s, el contador se reinicia', () => {
    const { state, data } = world(['lair']);
    const c = addCreature(state, data, 'goblin', { mood: 3 });
    c.beds = [11 * 64 + 2];
    c.wageSat = 1;
    run(state, data, 150);
    expect(c.furiousSeconds).toBeLessThan(30);
    run(state, data, 600);
    expect(state.creatures.some((k) => k.id === c.id)).toBe(true);
  });

  it('una criatura Furiosa está detenida', () => {
    const { state, data } = world();
    const c = addCreature(state, data, 'goblin', { mood: 2, wageSat: -1, hunger: 100 });
    const { x, y } = c;
    run(state, data, 200);
    expect([c.x, c.y]).toEqual([x, y]);
  });

  it('una criatura Enfadada va hacia el Portal', () => {
    const { state, data } = world();
    const c = addCreature(state, data, 'goblin', {
      mood: 12,
      wageSat: -1,
      hunger: 50,
      x: 3.5,
      y: 3.5,
    });
    run(state, data, 400);
    const portal = state.rooms.find((r) => r.type === 'portal')!;
    const tile = Math.floor(c.y) * 64 + Math.floor(c.x);
    expect(portal.tiles).toContain(tile);
  });
});

describe('entrenamiento', () => {
  /** Mundo con hambre y sueño casi nulos para medir solo el entrenamiento. */
  const trainingWorld = () =>
    world(['lair', 'trainingRoom'], (d) => {
      d.economy.hunger.risePerSecond = 0.0001;
      d.economy.sleep.risePerSecond = 0.0001;
      d.economy.paydayIntervalSeconds = 100000;
    });

  it('una criatura entrena, gasta 5 de oro por segundo y sube hasta el nivel 4, donde se detiene', () => {
    const { state, data } = trainingWorld();
    const c = addCreature(state, data, 'goblin', { mood: 80, wageSat: 1 });
    c.beds = [11 * 64 + 2];
    const gold0 = state.players[0]!.gold;
    const events = run(state, data, 2600);
    const levels = eventsOf(events, 'levelUp')
      .filter((e) => (e as { creatureId: number }).creatureId === c.id)
      .map((e) => (e as { level: number }).level);
    expect(levels).toEqual([2, 3, 4]);
    expect(c.level).toBe(4);
    expect(c.goal).not.toBe('training');
    // Se detiene en el nivel 4: nunca sube al 5 entrenando.
    run(state, data, 2000);
    expect(c.level).toBe(4);
    // 100 + 250 + 450 = 800 de XP a 4 por segundo = 200 s ≈ 1000 de oro (algo más por el ánimo y los trayectos).
    const spent = gold0 - state.players[0]!.gold;
    expect(spent).toBeGreaterThan(900);
    expect(spent).toBeLessThan(1400);
  });

  it('al subir de nivel gana vida máxima y vida actual', () => {
    const { state, data } = trainingWorld();
    const c = addCreature(state, data, 'goblin', { mood: 80, wageSat: 1, level: 1 });
    c.beds = [11 * 64 + 2];
    run(state, data, 800);
    expect(c.level).toBeGreaterThanOrEqual(2);
    expect(c.hp).toBeGreaterThan(1500);
  });

  it('sin oro no entrena', () => {
    const { state, data } = trainingWorld();
    state.players[0]!.gold = 0;
    const c = addCreature(state, data, 'goblin', { mood: 80 });
    run(state, data, 600);
    expect(c.xp).toBe(0);
  });

  it('en una sala de 3×3 entrenan 4 criaturas a la vez (1 por cada 2 tiles)', () => {
    const { state, data } = trainingWorld();
    for (let i = 0; i < 6; i++) addCreature(state, data, 'goblin', { mood: 80 });
    run(state, data, 200);
    const training = state.creatures.filter((c) => c.goal === 'training');
    expect(training).toHaveLength(4);
  });

  it('el ánimo Radiante entrena más rápido que el Neutral', () => {
    const xpAfter = (mood: number) => {
      const { state, data } = trainingWorld();
      const c = addCreature(state, data, 'goblin', { mood, wageSat: 1 });
      c.beds = [11 * 64 + 2];
      // Se mantiene el ánimo fijo para comparar.
      for (let i = 0; i < 400; i++) {
        c.mood = mood;
        run(state, data, 1);
      }
      return c.xp;
    };
    expect(xpAfter(95)).toBeGreaterThan(xpAfter(50));
  });
});

describe('la mano', () => {
  function withCreatures(n: number) {
    const m = world(['lair']);
    const list = Array.from({ length: n }, () => addCreature(m.state, m.data, 'goblin'));
    return { ...m, list };
  }

  it('recoge una criatura, la deja de la mano y se queda quieta', () => {
    const { state, data, list } = withCreatures(1);
    const c = list[0]!;
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: c.id }).ok).toBe(true);
    step(state, data);
    expect(c.held).toBe(true);
    expect(state.players[0]!.hand).toEqual([c.id]);
    const { x, y } = c;
    run(state, data, 100);
    expect([c.x, c.y]).toEqual([x, y]);
  });

  it('lleva hasta 8 y la novena da LIMIT_REACHED', () => {
    const { state, data, list } = withCreatures(9);
    for (let i = 0; i < 8; i++)
      expect(applyCommand(state, data, 1, { type: 'pickUp', id: list[i]!.id }).ok).toBe(true);
    step(state, data);
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: list[8]!.id })).toEqual({
      ok: false,
      error: 'LIMIT_REACHED',
    });
  });

  it('no se recoge lo ajeno, lo que no existe ni lo que ya está en la mano', () => {
    const { state, data, list } = withCreatures(1);
    list[0]!.owner = 2;
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: list[0]!.id })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: 999 })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    list[0]!.owner = 1;
    applyCommand(state, data, 1, { type: 'pickUp', id: list[0]!.id });
    step(state, data);
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: list[0]!.id })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('soltar la deja en el tile pedido, incluso en territorio ajeno', () => {
    const { state, data, list } = withCreatures(1);
    const c = list[0]!;
    applyCommand(state, data, 1, { type: 'pickUp', id: c.id });
    step(state, data);
    // Un tile caminable lejos de la base (suelo neutral del mapa).
    const far = data.map.bases.find((b) => b.slot === state.players[0]!.slot)!;
    void far;
    expect(applyCommand(state, data, 1, { type: 'drop', tile: { x: 3, y: 8 } }).ok).toBe(true);
    step(state, data);
    expect(c.held).toBe(false);
    expect([Math.floor(c.x), Math.floor(c.y)]).toEqual([3, 8]);
    expect(state.players[0]!.hand).toEqual([]);
  });

  it('no se puede soltar sobre un muro ni con la mano vacía', () => {
    const { state, data, list } = withCreatures(1);
    expect(applyCommand(state, data, 1, { type: 'drop', tile: { x: 3, y: 8 } })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    applyCommand(state, data, 1, { type: 'pickUp', id: list[0]!.id });
    step(state, data);
    expect(applyCommand(state, data, 1, { type: 'drop', tile: { x: 11, y: 4 } })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('la bofetada resta 3 de ánimo, da +25 % de velocidad de trabajo 10 s y tiene 1 s de enfriamiento', () => {
    const { state, data, list } = withCreatures(1);
    const rules = rulesOf(data);
    const c = list[0]!;
    c.mood = 60;
    expect(applyCommand(state, data, 1, { type: 'slap', id: c.id }).ok).toBe(true);
    step(state, data);
    expect(c.mood).toBe(57);
    expect(applyCommand(state, data, 1, { type: 'slap', id: c.id })).toEqual({
      ok: false,
      error: 'COOLDOWN',
    });
    // workSpeedFactor: banda Neutral (0) × 1,25 mientras dure.
    c.mood = 50;
    const boosted = state.tick < c.slapUntil;
    expect(boosted).toBe(true);
    expect(workSpeedFactorOf(state, rules, c)).toBeCloseTo(1.25);
    run(state, data, 110);
    const band = moodBandOf(rules, c.mood);
    expect(workSpeedFactorOf(state, rules, c)).toBeCloseTo(1 + (band.workSpeedMod ?? 0));
    expect(applyCommand(state, data, 1, { type: 'slap', id: c.id }).ok).toBe(true);
  });

  it('abofetear lo ajeno da NOT_OWNER', () => {
    const { state, data, list } = withCreatures(1);
    list[0]!.owner = 2;
    expect(applyCommand(state, data, 1, { type: 'slap', id: list[0]!.id })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
  });

  it('una criatura que muere o se va sale también de la mano', () => {
    const { state, data, list } = withCreatures(1);
    const c = list[0]!;
    applyCommand(state, data, 1, { type: 'pickUp', id: c.id });
    step(state, data);
    expect(state.players[0]!.hand).toEqual([c.id]);
    removeCreature(state, c.id);
    expect(state.players[0]!.hand).toEqual([]);
    expect(state.creatures).toHaveLength(0);
  });
});

import { workSpeedFactor as workSpeedFactorOf } from './creatureStats';
