import { describe, expect, it } from 'vitest';
import type { DataSet } from '../data';
import { applyCommand } from './applyCommand';
import { removeCreature } from './needs';
import {
  attractionCandidates,
  newCreature,
  populationOf,
  slotCapacity,
  speciesCount,
  tickPortals,
} from './portal';
import { maxRoomLevel, missingRooms } from './rooms';
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

/** Partida con las salas pedidas; el Goblin da 1 cupo por 8 tiles de Guarida (la de las pruebas tiene 8) y el Troll 1 por cada 3 goblins. */
function world(rooms: Parameters<typeof buildRooms>[2], mutate?: (d: DataSet) => void) {
  const m = matchAtCorner0();
  m.data.global.portal.attractIntervalSeconds = 100000;
  const goblin = m.data.creatures.find((c) => c.id === 'goblin')!;
  goblin.attraction!.slots = { fromRoom: 'lair', tilesPerSlot: 8 };
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

  it('fromRoom: 1 cupo por cada tilesPerSlot tiles de sala; con el cupo lleno no llegan más', () => {
    const { state, data } = world(['lair']);
    const goblin = data.creatures.find((c) => c.id === 'goblin')!;
    expect(slotCapacity(state, 1, goblin)).toBe(1);
    expect(types(state, data)).toContain('goblin');
    add(state, data, 'goblin');
    expect(types(state, data)).not.toContain('goblin');
  });

  it('más tiles de sala (también en otra sala del mismo tipo) suman cupos; 1 tile suelto no regala ninguno', () => {
    const { state, data } = world(['lair']);
    add(state, data, 'goblin');
    expect(types(state, data)).not.toContain('goblin');
    const goblin = data.creatures.find((c) => c.id === 'goblin')!;
    // 1 tile más (aparte o pegado) no llega a otro cupo: hacen falta 8 en total por cupo.
    expect(
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'lair',
        rect: { x: 9, y: 15, w: 1, h: 1 },
      }).ok,
    ).toBe(true);
    step(state, data);
    expect(slotCapacity(state, 1, goblin)).toBe(1);
    expect(types(state, data)).not.toContain('goblin');
    // 7 tiles más hacen 16: dos cupos.
    expect(
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'lair',
        rect: { x: 9, y: 16, w: 1, h: 3 },
      }).ok,
    ).toBe(true);
    expect(
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'lair',
        rect: { x: 8, y: 16, w: 1, h: 4 },
      }).ok,
    ).toBe(true);
    step(state, data);
    expect(slotCapacity(state, 1, goblin)).toBe(2);
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

describe('criaturas superiores: 10 de la base y una sala de nivel 10 (datos reales)', () => {
  const realWorld = () => {
    const m = matchAtCorner0();
    m.data.global.portal.attractIntervalSeconds = 100000;
    return m;
  };
  const claim = (
    state: MatchState,
    data: DataSet,
    x0: number,
    y0: number,
    w: number,
    h: number,
  ) => {
    const claimed = data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        state.terrain[y * state.width + x] = claimed;
        state.owner[y * state.width + x] = 1;
      }
    state.mapVersion++;
  };
  const buildAt = (
    state: MatchState,
    data: DataSet,
    room: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => {
    expect(applyCommand(state, data, 1, { type: 'buildRoom', room, rect: { x, y, w, h } }).ok).toBe(
      true,
    );
    step(state, data);
  };
  const lowLevelWhy = (state: MatchState, data: DataSet) =>
    attractionCandidates(state, rulesOf(data), 1, PORTAL_TILE).why;

  it('el Troll pide 10 goblins vivos Y una Guarida de nivel 10', () => {
    const { state, data } = realWorld();
    claim(state, data, 2, 11, 10, 6);
    state.players[0]!.gold = 9000;
    // 9 tiles de Guarida: hay goblins posibles pero el nivel no llega a 10.
    buildAt(state, data, 'lair', 2, 11, 3, 3);
    add(state, data, 'goblin', 10);
    expect(maxRoomLevel(state, 1, 'lair')).toBe(9);
    expect(types(state, data)).not.toContain('troll');
    // Con 10 tiles conectados (nivel 10) y 10 goblins vivos, ya puede llegar un Troll.
    buildAt(state, data, 'lair', 5, 11, 1, 1);
    expect(maxRoomLevel(state, 1, 'lair')).toBe(10);
    expect(types(state, data)).toContain('troll');
    // Con solo 9 goblins no hay cupo de Troll aunque la sala sea de nivel 10.
    removeCreature(state, state.creatures[0]!.id);
    expect(types(state, data)).not.toContain('troll');
  });

  it('el Portal avisa con "noLevel" cuando la sala existe pero no llega a nivel 10', () => {
    const { state, data } = realWorld();
    claim(state, data, 2, 11, 10, 6);
    state.players[0]!.gold = 9000;
    buildAt(state, data, 'lair', 2, 11, 3, 3);
    // Solo el Troll puede llegar: lo demás sin atracción.
    for (const c of data.creatures) if (c.attraction && c.id !== 'troll') c.attraction = null;
    add(state, data, 'goblin', 10);
    expect(lowLevelWhy(state, data)).toBe('noLevel');
  });

  it('dos salas de nivel 5 no valen como una de nivel 10 (hacen falta 10 tiles conectados)', () => {
    const { state, data } = realWorld();
    claim(state, data, 2, 11, 10, 6);
    state.players[0]!.gold = 9000;
    buildAt(state, data, 'lair', 2, 11, 5, 1);
    buildAt(state, data, 'lair', 2, 13, 5, 1); // separada por una fila vacía
    expect(maxRoomLevel(state, 1, 'lair')).toBe(5);
    add(state, data, 'goblin', 10);
    expect(types(state, data)).not.toContain('troll');
  });

  it('1 tile suelto no regala cupos: 10 salas de 1 tile dan lo mismo que 10 tiles juntos', () => {
    const { state, data } = realWorld();
    claim(state, data, 2, 11, 10, 6);
    state.players[0]!.gold = 9000;
    const goblin = data.creatures.find((c) => c.id === 'goblin')!;
    for (let x = 2; x < 12; x += 2) buildAt(state, data, 'lair', x, 11, 1, 1); // 5 salas sueltas
    // 5 tiles de Guarida a 2 tiles por cupo = 2 cupos (no 5).
    expect(state.rooms.filter((r) => r.type === 'lair' && r.owner === 1)).toHaveLength(5);
    expect(slotCapacity(state, 1, goblin)).toBe(2);
  });

  it('un Vampiro pide 10 esqueletos y un Cementerio de nivel 10; la Bruja, 10 warlocks y una Biblioteca de nivel 10', () => {
    const { state, data } = realWorld();
    claim(state, data, 2, 11, 10, 9);
    state.players[0]!.gold = 90000;
    buildAt(state, data, 'library', 2, 11, 5, 2);
    // Cementerio y Biblioteca de nivel 10 (el Cementerio pide la Biblioteca).
    buildAt(state, data, 'graveyard', 2, 14, 5, 2);
    buildAt(state, data, 'lair', 2, 17, 5, 1); // camas para las criaturas nuevas
    expect(maxRoomLevel(state, 1, 'graveyard')).toBe(10);
    expect(maxRoomLevel(state, 1, 'library')).toBe(10);
    add(state, data, 'skeleton', 9);
    add(state, data, 'warlock', 9);
    expect(types(state, data)).not.toContain('vampire');
    expect(types(state, data)).not.toContain('witch');
    add(state, data, 'skeleton', 1);
    add(state, data, 'warlock', 1);
    expect(types(state, data)).toContain('vampire');
    expect(types(state, data)).toContain('witch');
  });
});

describe('población y máximo actual', () => {
  it('el máximo lo ponen las camas libres si no puede llegar nadie sin cama', () => {
    const { state, data } = world(['lair']);
    add(state, data, 'goblin', 2);
    // Dos goblins ya ocupan su cama (hay que dársela: newCreature no la asigna).
    for (const c of state.creatures.filter((x) => x.owner === 1))
      c.beds = [
        state.rooms
          .find((r) => r.type === 'lair')!
          .tiles.find((t) => !state.creatures.some((o) => o.beds.includes(t)))!,
      ];
    const p = populationOf(state, rulesOf(data), 1);
    expect(p.count).toBe(2);
    expect(p.freeBeds).toBe(6);
    expect(p.bedCap).toBe(8);
    expect(p.max).toBe(Math.min(8, p.portalCap, p.globalCap));
  });

  it('con un Cementerio (el Esqueleto no usa cama) las camas dejan de limitar', () => {
    const { state, data } = world(['lair', 'library', 'graveyard']);
    const p = populationOf(state, rulesOf(data), 1);
    expect(p.bedCap).toBeNull();
    expect(p.max).toBe(Math.min(p.portalCap, p.globalCap));
  });

  it('el tope del Portal y el global son un techo duro', () => {
    const { state, data } = world(['lair']);
    data.global.portal.reservePerPortal = 3;
    expect(populationOf(state, rulesOf(data), 1).max).toBe(3);
    data.global.portal.reservePerPortal = 15;
    data.global.maxCreaturesPerPlayer = 5;
    expect(populationOf(state, rulesOf(data), 1).max).toBe(5);
  });
});
