import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { neighbors4 } from './grid';
import { planRoomBuild, roomBuildCost, roomCostRange, roomTileCost } from './rooms';
import { newCreature } from './portal';
import { rulesOf } from './rules';
import { step } from './step';
import { duel, extendTerritory } from './testUtils';
import type { MatchState, Room, SimEvent } from './types';

/** Territorio libre (x 2..10, y 11..19) y oro de sobra. */
function world() {
  const { state, data } = duel();
  extendTerritory(state, data);
  state.players[0]!.gold = 90000;
  return { state, data, rules: rulesOf(data) };
}
type W = ReturnType<typeof world>;

function build(w: W, room: string, x: number, y: number, ww: number, h: number): SimEvent[] {
  const res = applyCommand(w.state, w.data, 1, {
    type: 'buildRoom',
    room,
    rect: { x, y, w: ww, h },
  });
  expect(res.ok, JSON.stringify(res)).toBe(true);
  return step(w.state, w.data);
}
const mine = (state: MatchState, type: string): Room[] =>
  state.rooms.filter((r) => r.owner === 1 && r.type === type);
const levels = (state: MatchState, type: string) =>
  mine(state, type)
    .map((r) => r.tiles.length)
    .sort((a, b) => b - a);

/** Cada sala es conexa, sus tiles coinciden con roomAt y no hay dos salas con el mismo tile. */
function checkInvariants(state: MatchState) {
  const seen = new Set<number>();
  for (const room of state.rooms) {
    expect([...room.tiles].sort((a, b) => a - b)).toEqual(room.tiles);
    const set = new Set(room.tiles);
    const comp = new Set<number>([room.tiles[0]!]);
    for (const t of comp) for (const n of neighbors4(state, t)) if (set.has(n)) comp.add(n);
    expect(comp.size).toBe(room.tiles.length);
    for (const t of room.tiles) {
      expect(state.roomAt[t]).toBe(room.id);
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  }
}

describe('un tile que conecta salas separadas las une', () => {
  it('dos salas de 4 y 3 tiles unidas por un tile dan una de 8, y ese tile cuesta como el n.º 8', () => {
    const w = world();
    build(w, 'library', 2, 11, 4, 1); // 4 tiles
    build(w, 'library', 7, 11, 3, 1); // 3 tiles, separada por un hueco en x = 6
    expect(levels(w.state, 'library')).toEqual([4, 3]);
    const before = w.state.players[0]!.gold;
    const [a, b] = mine(w.state, 'library');
    const rect = { x: 6, y: 11, w: 1, h: 1 };
    expect(roomBuildCost(w.state, w.rules, 1, 'library', rect)).toBe(
      roomTileCost(w.rules, 'library', 8),
    );
    const events = build(w, 'library', 6, 11, 1, 1);
    expect(levels(w.state, 'library')).toEqual([8]);
    expect(w.state.players[0]!.gold).toBe(before - roomTileCost(w.rules, 'library', 8));
    // Sobrevive la de menor id y la otra desaparece.
    const survivor = mine(w.state, 'library')[0]!;
    expect(survivor.id).toBe(Math.min(a!.id, b!.id));
    expect(w.state.rooms.some((r) => r.id === Math.max(a!.id, b!.id))).toBe(false);
    expect(events.filter((e) => e.type === 'roomBuilt')).toHaveLength(1);
    checkInvariants(w.state);
  });

  it('si el total pasaría de 10, el tile que conecta abre una sala nueva de nivel 1 (pegada a las otras)', () => {
    const w = world();
    build(w, 'library', 2, 11, 6, 1); // 6 tiles (x 2..7)
    build(w, 'library', 9, 11, 2, 1); // 2 tiles... (x 9..10)
    build(w, 'library', 2, 12, 5, 1); // otra, pegada a la primera: se une (6 + 5 = 11 > 10 → nueva)
    // La primera quedó en 6 y la tercera no cabe junto a ella: 6 + 5 > 10 → cada tile fue por su cuenta.
    expect(levels(w.state, 'library').reduce((n, x) => n + x, 0)).toBe(13);
    expect(Math.max(...levels(w.state, 'library'))).toBeLessThanOrEqual(10);
    checkInvariants(w.state);
  });

  it('6 + 5 tiles conectados por un tile: 12 > 10, el tile empieza una sala nueva de nivel 1 y cuesta el tile n.º 1', () => {
    const w = world();
    build(w, 'lair', 2, 11, 6, 1); // x 2..7
    build(w, 'lair', 9, 11, 2, 2); // 4 tiles: x 9..10, y 11..12 (separada en x = 8)
    build(w, 'lair', 9, 13, 1, 1); // +1 pegado (5 tiles)
    expect(levels(w.state, 'lair')).toEqual([6, 5]);
    const rect = { x: 8, y: 11, w: 1, h: 1 };
    expect(roomBuildCost(w.state, w.rules, 1, 'lair', rect)).toBe(roomTileCost(w.rules, 'lair', 1));
    build(w, 'lair', 8, 11, 1, 1);
    expect(levels(w.state, 'lair')).toEqual([6, 5, 1]);
    checkInvariants(w.state);
  });

  it('5 + 4 + el tile que las conecta = 10: se unen en una sala llena', () => {
    const w = world();
    build(w, 'library', 2, 11, 5, 1); // x 2..6
    build(w, 'library', 8, 11, 3, 1); // x 8..10 (3 tiles)
    build(w, 'library', 8, 12, 1, 1); // 4 tiles
    expect(levels(w.state, 'library')).toEqual([5, 4]);
    build(w, 'library', 7, 11, 1, 1);
    expect(levels(w.state, 'library')).toEqual([10]);
    checkInvariants(w.state);
  });

  it('una sala llena a un lado no cuenta: el tile se une solo a la que aún admite tiles', () => {
    const w = world();
    build(w, 'library', 2, 11, 5, 2); // 10 tiles, llena (x 2..6, y 11..12)
    build(w, 'library', 8, 11, 2, 1); // 2 tiles, separada (x 8..9)
    // El tile (7,11) toca la llena y la de 2: la llena no admite más, así que se une a la de 2.
    build(w, 'library', 7, 11, 1, 1);
    expect(levels(w.state, 'library')).toEqual([10, 3]);
    checkInvariants(w.state);
  });

  it('un arrastre que rellena el hueco entre dos salas también las une; cada tile se paga por su número', () => {
    const w = world();
    build(w, 'library', 2, 11, 3, 1); // x 2..4
    build(w, 'library', 7, 11, 3, 1); // x 7..9; hueco en x 5..6
    const rect = { x: 5, y: 11, w: 2, h: 1 };
    // Primer tile: toca la de 3 (se amplía a 4: tile n.º 4). Segundo: toca la de 4 y la de 3: 4 + 3 + 1 = 8 (tile n.º 8).
    expect(roomBuildCost(w.state, w.rules, 1, 'library', rect)).toBe(
      roomTileCost(w.rules, 'library', 4) + roomTileCost(w.rules, 'library', 8),
    );
    build(w, 'library', 5, 11, 2, 1);
    expect(levels(w.state, 'library')).toEqual([8]);
    checkInvariants(w.state);
  });

  it('no se unen salas de otro tipo ni de otro dueño', () => {
    const w = world();
    build(w, 'library', 2, 11, 3, 1);
    build(w, 'lair', 6, 11, 1, 1); // otro tipo en medio
    build(w, 'library', 7, 11, 3, 1);
    expect(levels(w.state, 'library')).toEqual([3, 3]);
    expect(levels(w.state, 'lair')).toEqual([1]);
    checkInvariants(w.state);
  });

  it('al unirse, la sala que sobrevive hereda los pollos, cerditos y a quien la usaba', () => {
    const w = world();
    build(w, 'hatchery', 2, 11, 3, 1);
    build(w, 'hatchery', 6, 11, 2, 1);
    const [a, b] = mine(w.state, 'hatchery');
    a!.stock = 2;
    a!.piglets = 3;
    b!.stock = 4;
    b!.piglets = 1;
    const c = newCreature(w.state, w.rules, 1, 'goblin', 11 * 64 + 6);
    c.targetRoom = b!.id;
    w.state.creatures.push(c);
    build(w, 'hatchery', 5, 11, 1, 1);
    const merged = mine(w.state, 'hatchery');
    expect(merged).toHaveLength(1);
    expect(merged[0]!.stock).toBe(6);
    expect(merged[0]!.piglets).toBe(4);
    expect(c.targetRoom).toBe(merged[0]!.id);
  });

  it('el reparto es determinista y la vista previa coincide con lo que se construye y cobra', () => {
    const run = () => {
      const w = world();
      build(w, 'library', 2, 11, 3, 1);
      build(w, 'library', 7, 11, 3, 1);
      const rect = { x: 5, y: 11, w: 2, h: 3 };
      const plan = planRoomBuild(w.state, w.rules, 1, 'library', rect);
      const cost = roomBuildCost(w.state, w.rules, 1, 'library', rect);
      const before = w.state.players[0]!.gold;
      build(w, 'library', rect.x, rect.y, rect.w, rect.h);
      expect(before - w.state.players[0]!.gold).toBe(cost);
      for (const piece of plan)
        expect(mine(w.state, 'library').some((r) => r.tiles.join() === piece.tiles.join())).toBe(
          true,
        );
      checkInvariants(w.state);
      return JSON.stringify(w.state.rooms.map((r) => [r.id, r.tiles]));
    };
    expect(run()).toBe(run());
  });

  it('vender la sala unida devuelve el 50 % de lo que vale ahora (su valor es el de una sala de ese tamaño)', () => {
    const w = world();
    build(w, 'library', 2, 11, 4, 1);
    build(w, 'library', 7, 11, 3, 1);
    build(w, 'library', 6, 11, 1, 1);
    w.state.players[0]!.gold = 1000;
    applyCommand(w.state, w.data, 1, { type: 'sellRoom', tile: { x: 2, y: 11 } });
    step(w.state, w.data);
    expect(w.state.players[0]!.gold).toBe(
      1000 + Math.floor(roomCostRange(w.rules, 'library', 0, 8) * 0.5),
    );
    expect(mine(w.state, 'library')).toHaveLength(0);
  });
});
