import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { creatureWage } from './creatureStats';
import { attractionCandidates, newCreature, slotCapacity, speciesCount } from './portal';
import { rulesOf } from './rules';
import { step } from './step';
import { buildRooms, matchAtCorner0, run } from './testUtils';
import type { Creature, MatchState, SimEvent } from './types';
import type { DataSet } from '../data';

const PORTAL_TILE = 9 * 64 + 9;

/** Partida con las salas pedidas, sin llegadas por el Portal ni día de pago salvo que la prueba lo pida. */
function world(rooms: Parameters<typeof buildRooms>[2], mutate?: (d: DataSet) => void) {
  const m = matchAtCorner0();
  m.data.global.portal.attractIntervalSeconds = 100000;
  m.data.economy.paydayIntervalSeconds = 100000;
  // Sin hambre ni sueño: nada distrae a la criatura de lo que se prueba.
  m.data.economy.hunger.risePerSecond = 0.0001;
  m.data.economy.sleep.risePerSecond = 0.0001;
  // El entrenamiento no cobra oro: así el oro que se mide es solo el del sueldo y el Casino.
  m.data.rooms.find((r) => r.id === 'trainingRoom')!.trainingGoldPerSecond = 0;
  mutate?.(m.data);
  buildRooms(m.state, m.data, rooms);
  m.state.imps = m.state.imps.filter((i) => i.owner !== 1);
  return m;
}

function add(state: MatchState, data: DataSet, type: string, patch: Partial<Creature> = {}) {
  const c = newCreature(state, rulesOf(data), 1, type, PORTAL_TILE);
  Object.assign(c, patch);
  state.creatures.push(c);
  return c;
}

const eventsOf = (events: SimEvent[], type: SimEvent['type']) =>
  events.filter((e) => e.type === type);

describe('Casino: la sala y sus criaturas', () => {
  it('pide una Sala de entrenamiento antes y se construye por tiles como las demás', () => {
    const m = matchAtCorner0();
    m.state.players[0]!.gold = 20000;
    const rect = { x: 9, y: 11, w: 2, h: 2 };
    buildRooms(m.state, m.data, []); // territorio libre
    expect(applyCommand(m.state, m.data, 1, { type: 'buildRoom', room: 'casino', rect })).toEqual({
      ok: false,
      error: 'REQUIRES_ROOM',
    });
    buildRooms(m.state, m.data, ['trainingRoom']);
    m.state.players[0]!.gold = 20000;
    expect(applyCommand(m.state, m.data, 1, { type: 'buildRoom', room: 'casino', rect }).ok).toBe(
      true,
    );
  });

  it('con Casino y Guarida el Portal puede traer al Bandido (1 cupo por 3 tiles); con 10 bandidos pero Casino pequeño no sale el Asesino', () => {
    const { state, data } = world(['lair', 'trainingRoom', 'casino']); // Casino de 6 tiles
    const rules = rulesOf(data);
    const types = () =>
      attractionCandidates(state, rules, 1, PORTAL_TILE).candidates.map((c) => c.type);
    expect(types()).toContain('bandit');
    expect(types()).not.toContain('assassin');
    const bandit = data.creatures.find((c) => c.id === 'bandit')!;
    expect(slotCapacity(state, 1, bandit)).toBe(2);
    // Aunque haya 10 bandidos, el Casino sigue siendo de 6 tiles: falta el nivel 10.
    for (let i = 0; i < 10; i++) add(state, data, 'bandit');
    expect(speciesCount(state, 1, 'bandit')).toBe(10);
    expect(types()).not.toContain('assassin');
  });

  it('el Asesino sale con 10 bandidos y un Casino de nivel 10', () => {
    const { state, data } = world(['lair', 'trainingRoom']);
    // Casino de 10 tiles: 5×2 en territorio libre.
    state.players[0]!.gold = 90000;
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'casino',
      rect: { x: 2, y: 19, w: 5, h: 1 },
    });
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'casino',
      rect: { x: 2, y: 18, w: 5, h: 1 },
    });
    step(state, data);
    const level = Math.max(
      ...state.rooms.filter((r) => r.type === 'casino').map((r) => r.tiles.length),
    );
    expect(level).toBe(10);
    const rules = rulesOf(data);
    const types = () =>
      attractionCandidates(state, rules, 1, PORTAL_TILE).candidates.map((c) => c.type);
    for (let i = 0; i < 9; i++) add(state, data, 'bandit');
    expect(types()).not.toContain('assassin');
    add(state, data, 'bandit');
    expect(types()).toContain('assassin');
  });
});

describe('Casino: sueldo, gasto e ingresos', () => {
  /** Una criatura con cama, pagada, junto a un Casino de `rooms`. */
  function paidGoblin(rooms: Parameters<typeof buildRooms>[2]) {
    const m = world(rooms);
    m.state.players[0]!.gold = 5000;
    const c = add(m.state, m.data, 'bandit', { beds: [11 * 64 + 2] });
    return { ...m, c };
  }

  it('al cobrar guarda el sueldo en el bolsillo (y sin oro no cobra nada)', () => {
    const { state, data, c } = paidGoblin(['lair']); // sin Casino: el sueldo se queda en el bolsillo
    const wage = creatureWage(rulesOf(data), c);
    state.nextPayTick = 1; // un único día de pago, en el tick 1
    run(state, data, 300);
    expect(c.purse).toBe(wage);
    // Sin oro: no cobra y no lleva nada.
    const poor = paidGoblin(['lair']);
    poor.state.nextPayTick = 1;
    poor.state.players[0]!.gold = 0;
    run(poor.state, poor.data, 300);
    expect(poor.c.purse).toBe(0);
  });

  it('con Casino va a jugar tras cobrar: gasta parte del sueldo, la Tesorería lo recibe y sale con bono', () => {
    const { state, data, c } = paidGoblin(['lair', 'trainingRoom', 'casino']);
    state.nextPayTick = 1; // un único día de pago, en el tick 1
    const wage = creatureWage(rulesOf(data), c);
    const goldBefore = state.players[0]!.gold;
    const events: SimEvent[] = [];
    let wasAtCasino = false;
    for (let n = 0; n < 600; n++) {
      events.push(...step(state, data));
      if (c.goal === 'casino') wasAtCasino = true;
    }
    expect(wasAtCasino).toBe(true);
    const casino = data.rooms.find((r) => r.id === 'casino')!;
    const spent = wage * casino.casinoSpendFraction!;
    const gambled = eventsOf(events, 'gambled');
    expect(gambled).toHaveLength(1);
    expect(gambled[0]).toMatchObject({ playerId: 1, creatureId: c.id });
    expect((gambled[0] as { amount: number }).amount).toBeCloseTo(spent, 0);
    // Pagó el sueldo (−wage) y recuperó lo gastado en el Casino (+spent × parte de la casa).
    expect(state.players[0]!.gold).toBeCloseTo(
      goldBefore - wage + spent * casino.casinoHouseShare!,
      0,
    );
    expect(c.purse).toBe(0);
    expect(c.funUntil).toBeGreaterThan(0);
    expect(c.goal).not.toBe('casino');
  });

  it('el Casino produce ingresos netos: el sueldo cuesta menos con él', () => {
    const goldAfterPayday = (rooms: Parameters<typeof buildRooms>[2]) => {
      const { state, data } = paidGoblin(rooms);
      state.nextPayTick = 1;
      const before = state.players[0]!.gold;
      run(state, data, 600);
      return state.players[0]!.gold - before;
    };
    const without = goldAfterPayday(['lair', 'trainingRoom']);
    const withCasino = goldAfterPayday(['lair', 'trainingRoom', 'casino']);
    expect(withCasino).toBeGreaterThan(without);
  });

  it('no se pasa de la capacidad de la Tesorería', () => {
    const { state, data, c } = paidGoblin(['lair', 'trainingRoom', 'casino']);
    const cap = 9000; // Tesorería inicial
    state.players[0]!.gold = cap;
    c.purse = 1000;
    run(state, data, 300);
    expect(state.players[0]!.gold).toBeLessThanOrEqual(cap + 1e-6);
  });

  it('el Casino tiene asientos: 1 por cada 2 tiles; la segunda criatura espera su turno', () => {
    const { state, data } = world(['lair', 'trainingRoom', 'casino']); // 6 tiles = 3 asientos
    const rules = rulesOf(data);
    expect(
      Math.floor(
        state.rooms.find((r) => r.type === 'casino')!.tiles.length /
          data.rooms.find((r) => r.id === 'casino')!.casinoTilesPerSeat!,
      ),
    ).toBe(3);
    // Con un solo asiento (2 tiles) solo juega una a la vez.
    const small = world(['lair', 'trainingRoom']);
    small.state.players[0]!.gold = 20000;
    applyCommand(small.state, small.data, 1, {
      type: 'buildRoom',
      room: 'casino',
      rect: { x: 9, y: 11, w: 2, h: 1 },
    });
    step(small.state, small.data);
    const a = add(small.state, small.data, 'bandit', { beds: [11 * 64 + 2], purse: 200 });
    const b = add(small.state, small.data, 'bandit', { beds: [11 * 64 + 3], purse: 200 });
    let maxAtOnce = 0;
    for (let n = 0; n < 400; n++) {
      step(small.state, small.data);
      maxAtOnce = Math.max(
        maxAtOnce,
        small.state.creatures.filter((c) => c.goal === 'casino').length,
      );
    }
    expect(maxAtOnce).toBe(1);
    // Con el tiempo juegan las dos.
    run(small.state, small.data, 600);
    expect(a.funUntil).toBeGreaterThan(0);
    expect(b.funUntil).toBeGreaterThan(0);
    void rules;
  });

  it('sin Casino no cambia nada: nadie va a ningún sitio con el sueldo', () => {
    const { state, data, c } = paidGoblin(['lair']);
    c.purse = 300;
    run(state, data, 200);
    expect(state.creatures.some((k) => k.goal === 'casino')).toBe(false);
    expect(c.purse).toBe(300);
  });
});

describe('Casino: bono de experiencia en el entrenamiento', () => {
  /** XP ganada entrenando 150 ticks con `funUntil` dado. */
  function trainedXp(funUntil: number): number {
    const m = world(['lair', 'trainingRoom']);
    m.state.players[0]!.gold = 5000;
    const c = add(m.state, m.data, 'goblin', { beds: [11 * 64 + 2], funUntil });
    const xp0 = c.xp + c.level * 1e6;
    run(m.state, m.data, 150);
    return c.xp + c.level * 1e6 - xp0;
  }

  it('con el bono del Casino gana más experiencia que sin él (la que dicen los datos)', () => {
    const bonus = matchAtCorner0().data.rooms.find((r) => r.id === 'casino')!.casinoTrainingBonus!;
    const plain = trainedXp(0);
    const fun = trainedXp(100000);
    expect(plain).toBeGreaterThan(0);
    // Mismo tiempo de entrenamiento: la proporción es la del bono (con holgura por subidas de nivel).
    expect(fun / plain).toBeGreaterThan(1 + bonus * 0.7);
    expect(fun / plain).toBeLessThan(1 + bonus * 1.3);
  });

  it('el bono caduca: pasado `funUntil` entrena exactamente como sin él', () => {
    expect(trainedXp(1)).toBe(trainedXp(0));
  });
});

describe('Portal cada 25 s y cobro cada 3 minutos (datos reales)', () => {
  it('los datos dicen 25 s y 180 s', () => {
    const { data } = matchAtCorner0();
    expect(data.global.portal.attractIntervalSeconds).toBe(25);
    expect(data.economy.paydayIntervalSeconds).toBe(180);
  });

  it('mientras haya camas llega una criatura cada 25 s', () => {
    const m = matchAtCorner0();
    m.data.economy.paydayIntervalSeconds = 100000;
    buildRooms(m.state, m.data, ['lair']); // 8 camas
    const events = run(m.state, m.data, 25 * 10 * 3 + 5);
    const mine = eventsOf(events, 'creatureArrived').filter(
      (e) => (e as { playerId: number }).playerId === 1,
    );
    expect(mine).toHaveLength(3);
  });
});
