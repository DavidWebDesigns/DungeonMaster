import { describe, expect, it } from 'vitest';
import type { DataSet } from '../data';
import { applyCommand } from './applyCommand';
import { removeCreature } from './needs';
import {
  attractionCandidates,
  newCreature,
  slotCapacity,
  speciesCount,
  tickPortals,
} from './portal';
import { missingRooms } from './rooms';
import { rulesOf } from './rules';
import { step } from './step';
import { buildRooms, matchAtCorner0 } from './testUtils';
import type { MatchState, SimEvent } from './types';

const PORTAL_TILE = 9 * 64 + 9;
const types = (state: MatchState, data: DataSet) =>
  attractionCandidates(state, rulesOf(data), 1, PORTAL_TILE).candidates.map((c) => c.type);
const why = (state: MatchState, data: DataSet) =>
  attractionCandidates(state, rulesOf(data), 1, PORTAL_TILE).why;

function add(state: MatchState, data: DataSet, type: string, n = 1) {
  for (let i = 0; i < n; i++)
    state.creatures.push(newCreature(state, rulesOf(data), 1, type, PORTAL_TILE));
}

/** Partida con las salas pedidas y la regla de cupos del Goblin (por Guarida) y del Troll (por cada 3 goblins). */
function world(rooms: Parameters<typeof buildRooms>[2], mutate?: (d: DataSet) => void) {
  const m = matchAtCorner0();
  m.data.global.portal.attractIntervalSeconds = 100000;
  const goblin = m.data.creatures.find((c) => c.id === 'goblin')!;
  goblin.attraction!.slots = { fromRoom: 'lair' };
  const troll = m.data.creatures.find((c) => c.id === 'troll')!;
  troll.attraction = {
    requires: [{ room: 'lair' }],
    attractWeight: 3,
    slots: { fromCreature: 'goblin', unlockEvery: 3 },
  };
  mutate?.(m.data);
  buildRooms(m.state, m.data, rooms);
  return m;
}

describe('cupos de la progresión de salas', () => {
  it('sin cupos (como el Demonio de bilis) no hay límite: es el comportamiento de siempre', () => {
    const { state, data } = world(['lair', 'hatchery', 'trainingRoom']);
    add(state, data, 'bileDemon', 6);
    expect(types(state, data)).toContain('bileDemon');
    expect(
      slotCapacity(
        state,
        1,
        data.creatures.find((c) => c.id === 'bileDemon')!,
      ),
    ).toBe(Infinity);
  });

  it('fromRoom: una sala construida = un cupo; con el cupo lleno no llegan más', () => {
    const { state, data } = world(['lair']);
    const goblin = data.creatures.find((c) => c.id === 'goblin')!;
    expect(slotCapacity(state, 1, goblin)).toBe(1);
    expect(types(state, data)).toContain('goblin');
    add(state, data, 'goblin');
    expect(types(state, data)).not.toContain('goblin');
  });

  it('otra sala del mismo tipo suma otro cupo (no se fusionan)', () => {
    const { state, data } = world(['lair']);
    add(state, data, 'goblin');
    expect(types(state, data)).not.toContain('goblin');
    // Una segunda Guarida, aparte de la primera.
    const res = applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 9, y: 11, w: 2, h: 2 },
    });
    expect(res.ok).toBe(true);
    step(state, data);
    expect(
      slotCapacity(
        state,
        1,
        data.creatures.find((c) => c.id === 'goblin')!,
      ),
    ).toBe(2);
    expect(types(state, data)).toContain('goblin');
  });

  it('fromCreature: 1 cupo por cada `unlockEvery` criaturas vivas de la especie base', () => {
    const { state, data } = world(['lair']);
    const troll = data.creatures.find((c) => c.id === 'troll')!;
    for (const [goblins, expected] of [
      [0, 0],
      [2, 0],
      [3, 1],
      [5, 1],
      [6, 2],
    ] as const) {
      state.creatures = [];
      add(state, data, 'goblin', goblins);
      expect(slotCapacity(state, 1, troll)).toBe(expected);
      expect(types(state, data).includes('troll')).toBe(expected > 0);
    }
    // Los trolls que ya tiene ocupan cupo.
    state.creatures = [];
    add(state, data, 'goblin', 3);
    add(state, data, 'troll');
    expect(types(state, data)).not.toContain('troll');
  });

  it('maxPerPlayer limita aunque haya cupos de sobra', () => {
    const { state, data } = world(['lair'], (d) => {
      d.creatures.find((c) => c.id === 'goblin')!.attraction!.maxPerPlayer = 1;
    });
    // Aunque hubiera 5 Guaridas, el tope duro es 1.
    const goblin = data.creatures.find((c) => c.id === 'goblin')!;
    expect(slotCapacity(state, 1, goblin)).toBe(1);
    add(state, data, 'goblin');
    expect(types(state, data)).not.toContain('goblin');
  });

  it('maxPerPlayer sin cupos también funciona (un solo Ángel caído)', () => {
    const { state, data } = world(['lair', 'trainingRoom'], (d) => {
      d.creatures.find((c) => c.id === 'troll')!.attraction = {
        requires: [{ room: 'trainingRoom' }],
        attractWeight: 1,
        maxPerPlayer: 1,
      };
    });
    const troll = data.creatures.find((c) => c.id === 'troll')!;
    expect(slotCapacity(state, 1, troll)).toBe(1);
    add(state, data, 'troll');
    expect(types(state, data)).not.toContain('troll');
  });

  it('solo cuentan las criaturas vivas: al morir una, el cupo vuelve a estar libre', () => {
    const { state, data } = world(['lair']);
    add(state, data, 'goblin');
    expect(types(state, data)).not.toContain('goblin');
    removeCreature(state, state.creatures[0]!.id);
    expect(speciesCount(state, 1, 'goblin')).toBe(0);
    expect(types(state, data)).toContain('goblin');
  });

  it('las criaturas de otro jugador no ocupan mis cupos', () => {
    const { state, data } = world(['lair']);
    const c = newCreature(state, rulesOf(data), 2, 'goblin', PORTAL_TILE);
    state.creatures.push(c);
    expect(speciesCount(state, 1, 'goblin')).toBe(0);
    expect(types(state, data)).toContain('goblin');
  });

  it('el Portal avisa con "noSlots" cuando lo único posible está al tope de cupos', () => {
    const { state, data } = world(['lair'], (d) => {
      // Solo el Goblin puede llegar con una Guarida.
      for (const c of d.creatures) if (c.attraction && c.id !== 'goblin') c.attraction = null;
      d.creatures.find((c) => c.id === 'imp')!.attraction = null;
      d.global.portal.attractIntervalSeconds = 1;
    });
    add(state, data, 'goblin');
    expect(why(state, data)).toBe('noSlots');
    const events: SimEvent[] = [];
    for (let i = 0; i < 12; i++) tickPortals(state, rulesOf(data), events);
    expect(events).toContainEqual({ type: 'portalIdle', playerId: 1, reason: 'noSlots' });
  });
});

describe('requisitos entre salas', () => {
  it('missingRooms nombra solo lo que falta, sin repetir y en orden', () => {
    const { state } = world(['library']);
    expect(missingRooms(state, 1, ['library', 'trainingRoom', 'trainingRoom', 'lair'])).toEqual([
      'trainingRoom',
      'lair',
    ]);
    expect(missingRooms(state, 1, undefined)).toEqual([]);
    expect(missingRooms(state, 2, ['library'])).toEqual(['library']);
  });

  it('construir una sala con requisitos sin cumplir da REQUIRES_ROOM; con ellos, funciona', () => {
    const { state, data } = world([], (d) => {
      d.rooms.find((r) => r.id === 'trainingRoom')!.requiresRooms = ['library'];
    });
    const build = () =>
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'trainingRoom',
        rect: { x: 2, y: 14, w: 3, h: 3 },
      });
    expect(build()).toEqual({ ok: false, error: 'REQUIRES_ROOM' });
    buildRooms(state, data, ['library']);
    expect(build().ok).toBe(true);
  });

  it('los requisitos son de cada jugador: el de otro no cuenta', () => {
    const { state, data } = world(['library'], (d) => {
      d.rooms.find((r) => r.id === 'trainingRoom')!.requiresRooms = ['library'];
    });
    state.rooms.find((r) => r.type === 'library')!.owner = 2;
    expect(
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'trainingRoom',
        rect: { x: 2, y: 17, w: 3, h: 3 },
      }),
    ).toEqual({ ok: false, error: 'REQUIRES_ROOM' });
  });
});
