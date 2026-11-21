import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { neighbors4, tileIndex } from './grid';
import { maxRoomLevel, removeRoomTile, roomLevel, roomMaxTiles } from './rooms';
import { rulesOf } from './rules';
import { step } from './step';
import { duel, extendTerritory, run } from './testUtils';
import type { MatchState, Room } from './types';

/** Partida con territorio libre (x 2..10, y 11..19) y oro de sobra. */
function world() {
  const { state, data } = duel();
  extendTerritory(state, data);
  state.players[0]!.gold = 9000;
  return { state, data, rules: rulesOf(data) };
}
const build = (
  state: MatchState,
  data: ReturnType<typeof duel>['data'],
  room: string,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const res = applyCommand(state, data, 1, { type: 'buildRoom', room, rect: { x, y, w, h } });
  step(state, data);
  return res;
};
const mine = (state: MatchState, type: string): Room[] =>
  state.rooms.filter((r) => r.owner === 1 && r.type === type);

/** Todas las salas son conexas y sus tiles coinciden con roomAt y están ordenados. */
function checkInvariants(state: MatchState) {
  const seen = new Set<number>();
  for (const room of state.rooms) {
    expect(room.tiles.length).toBeGreaterThan(0);
    expect([...room.tiles].sort((a, b) => a - b)).toEqual(room.tiles);
    const set = new Set(room.tiles);
    const comp = new Set<number>([room.tiles[0]!]);
    const queue = [room.tiles[0]!];
    for (let k = 0; k < queue.length; k++)
      for (const n of neighbors4(state, queue[k]!)) {
        if (!set.has(n) || comp.has(n)) continue;
        comp.add(n);
        queue.push(n);
      }
    expect(comp.size, `sala ${room.id} (${room.type}) conexa`).toBe(room.tiles.length);
    for (const t of room.tiles) {
      expect(state.roomAt[t]).toBe(room.id);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  }
}

describe('niveles de sala', () => {
  it('el nivel de una sala es su número de tiles y el máximo sale de los datos (10)', () => {
    const { state, data, rules } = world();
    expect(roomMaxTiles(rules, 'lair')).toBe(10);
    expect(roomMaxTiles(rules, 'heart')).toBe(Infinity);
    build(state, data, 'lair', 2, 11, 3, 1);
    const lair = mine(state, 'lair')[0]!;
    expect(roomLevel(lair)).toBe(3);
    expect(maxRoomLevel(state, 1, 'lair')).toBe(3);
    expect(maxRoomLevel(state, 1, 'library')).toBe(0);
  });

  it('una sala de 1 tile es válida y es de nivel 1; cuesta lo de un tile', () => {
    const { state, data } = world();
    const gold = state.players[0]!.gold;
    expect(build(state, data, 'treasury', 2, 11, 1, 1).ok).toBe(true);
    expect(
      roomLevel(mine(state, 'treasury').find((r) => r.tiles.includes(tileIndex(state, 2, 11)))!),
    ).toBe(1);
    expect(state.players[0]!.gold).toBe(gold - 100);
  });

  it('un rectángulo de hasta 10 tiles es una sola sala de ese nivel', () => {
    const { state, data } = world();
    build(state, data, 'library', 2, 11, 5, 2);
    expect(mine(state, 'library')).toHaveLength(1);
    expect(roomLevel(mine(state, 'library')[0]!)).toBe(10);
    checkInvariants(state);
  });

  it('un rectángulo de 12 tiles se parte en una sala de nivel 10 y otra de nivel 2, ambas conexas', () => {
    const { state, data } = world();
    const gold = state.players[0]!.gold;
    const events = (() => {
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'library',
        rect: { x: 2, y: 11, w: 6, h: 2 },
      });
      return step(state, data);
    })();
    const rooms = mine(state, 'library');
    expect(rooms.map(roomLevel).sort((a, b) => b - a)).toEqual([10, 2]);
    expect(events.filter((e) => e.type === 'roomBuilt')).toHaveLength(2);
    expect(state.players[0]!.gold).toBe(gold - 12 * 250);
    checkInvariants(state);
  });

  it('un rectángulo ancho (15×1) también queda en trozos conexos de ≤10', () => {
    const { state, data } = world();
    // Territorio extra para una fila larga.
    const claimed = data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let x = 2; x < 20; x++) {
      state.terrain[tileIndex(state, x, 19)] = claimed;
      state.owner[tileIndex(state, x, 19)] = 1;
    }
    const r = build(state, data, 'lair', 2, 19, 15, 1);
    expect(r.ok).toBe(true);
    expect(
      mine(state, 'lair')
        .map(roomLevel)
        .sort((a, b) => b - a),
    ).toEqual([10, 5]);
    checkInvariants(state);
  });

  it('el tile 11 pegado a una sala llena abre una sala nueva de nivel 1', () => {
    const { state, data } = world();
    build(state, data, 'library', 2, 11, 5, 2); // 10 tiles
    build(state, data, 'library', 7, 11, 1, 1); // el tile 11, pegado
    const levels = mine(state, 'library')
      .map(roomLevel)
      .sort((a, b) => b - a);
    expect(levels).toEqual([10, 1]);
    checkInvariants(state);
  });

  it('añadir tiles a una sala no llena la amplía; lo que sobre de 10 forma otra sala', () => {
    const { state, data } = world();
    build(state, data, 'library', 2, 11, 3, 3); // 9 tiles
    const first = mine(state, 'library')[0]!;
    // Se piden 3 tiles pegados: 1 amplía la sala a 10 y 2 abren otra de nivel 2.
    build(state, data, 'library', 5, 11, 1, 3);
    const rooms = mine(state, 'library');
    expect(rooms.map(roomLevel).sort((a, b) => b - a)).toEqual([10, 2]);
    expect(rooms.some((r) => r.id === first.id && roomLevel(r) === 10)).toBe(true);
    checkInvariants(state);
  });

  it('las salas de otro tipo o de otro dueño no se mezclan aunque estén pegadas', () => {
    const { state, data } = world();
    build(state, data, 'library', 2, 11, 2, 1);
    build(state, data, 'lair', 4, 11, 2, 1);
    expect(mine(state, 'library')).toHaveLength(1);
    expect(mine(state, 'lair')).toHaveLength(1);
    expect(roomLevel(mine(state, 'library')[0]!)).toBe(2);
    checkInvariants(state);
  });

  it('el reparto es determinista: mismos comandos, mismas salas', () => {
    const play = () => {
      const { state, data } = world();
      build(state, data, 'library', 2, 11, 6, 3);
      build(state, data, 'library', 8, 11, 2, 3);
      return JSON.stringify(state.rooms.map((r) => [r.id, r.type, r.tiles]));
    };
    expect(play()).toBe(play());
  });

  it('dos construcciones en el mismo tick no pisan los mismos tiles (la segunda se rechaza)', () => {
    const { state, data } = world();
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 2, y: 11, w: 3, h: 1 },
    });
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 3, y: 11, w: 3, h: 1 },
    });
    step(state, data);
    expect(mine(state, 'library').reduce((n, r) => n + r.tiles.length, 0)).toBe(3);
    checkInvariants(state);
  });
});

describe('quitar un tile de una sala', () => {
  it('quitar el del medio de una fila parte la sala en dos (el mayor conserva el id)', () => {
    const { state, data, rules } = world();
    build(state, data, 'library', 2, 11, 5, 1);
    const room = mine(state, 'library')[0]!;
    const id = room.id;
    removeRoomTile(state, rules, tileIndex(state, 4, 11)); // quedan 2 + 2
    const parts = mine(state, 'library');
    expect(parts.map(roomLevel).sort()).toEqual([2, 2]);
    // Empate: conserva el id el trozo con el tile menor.
    expect(state.rooms.find((r) => r.id === id)!.tiles).toContain(tileIndex(state, 2, 11));
    expect(state.roomAt[tileIndex(state, 4, 11)]).toBe(0);
    checkInvariants(state);
  });

  it('quitar un tile del borde no parte la sala; quitar el último la elimina', () => {
    const { state, data, rules } = world();
    build(state, data, 'library', 2, 11, 3, 1);
    removeRoomTile(state, rules, tileIndex(state, 2, 11));
    expect(mine(state, 'library')).toHaveLength(1);
    expect(roomLevel(mine(state, 'library')[0]!)).toBe(2);
    removeRoomTile(state, rules, tileIndex(state, 3, 11));
    removeRoomTile(state, rules, tileIndex(state, 4, 11));
    expect(mine(state, 'library')).toHaveLength(0);
  });

  it('un tile destruido por el enemigo parte la sala y los trozos siguen siendo salas válidas', () => {
    const { state, data, rules } = world();
    build(state, data, 'library', 2, 11, 5, 2);
    removeRoomTile(state, rules, tileIndex(state, 4, 11));
    removeRoomTile(state, rules, tileIndex(state, 4, 12));
    const parts = mine(state, 'library');
    expect(parts.map(roomLevel).sort()).toEqual([4, 4]);
    expect(maxRoomLevel(state, 1, 'library')).toBe(4);
    checkInvariants(state);
  });

  it('vender una sala la quita entera y devuelve su parte; las vecinas del mismo tipo no se tocan', () => {
    const { state, data } = world();
    build(state, data, 'library', 2, 11, 5, 2);
    build(state, data, 'library', 7, 11, 2, 1); // otra sala (la primera estaba llena)
    const gold = state.players[0]!.gold;
    applyCommand(state, data, 1, { type: 'sellRoom', tile: { x: 2, y: 11 } });
    step(state, data);
    expect(mine(state, 'library').map(roomLevel)).toEqual([2]);
    expect(state.players[0]!.gold).toBe(gold + Math.floor(10 * 250 * 0.5));
    checkInvariants(state);
  });
});

describe('invariantes con partida real', () => {
  it('las salas iniciales y las construidas siguen siendo conexas tras 2 minutos', () => {
    const { state, data } = world();
    build(state, data, 'library', 2, 11, 6, 3);
    run(state, data, 1200);
    checkInvariants(state);
  });
});
