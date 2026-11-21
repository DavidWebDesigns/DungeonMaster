import { describe, expect, it } from 'vitest';
import { applyCommand, previewCommand } from './applyCommand';
import { planRoomBuild, roomBuildCost, roomCostRange, roomTileCost, roomValue } from './rooms';
import { rulesOf } from './rules';
import { step } from './step';
import { duel, extendTerritory } from './testUtils';

/** Territorio libre (x 2..10, y 11..19) y oro de sobra (la Tesorería guarda hasta 9.000). */
function world(gold = 9000) {
  const { state, data } = duel();
  extendTerritory(state, data);
  state.players[0]!.gold = gold;
  return { state, data, rules: rulesOf(data) };
}
const build = (
  m: ReturnType<typeof world>,
  room: string,
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const res = applyCommand(m.state, m.data, 1, { type: 'buildRoom', room, rect: { x, y, w, h } });
  step(m.state, m.data);
  return res;
};

describe('coste incremental de las salas (+20 % por tile dentro de cada sala)', () => {
  it('el tile n cuesta goldPerTile × 1,2^(n-1), redondeado por tile', () => {
    const { rules } = world();
    expect([1, 2, 3, 4, 5].map((n) => roomTileCost(rules, 'lair', n))).toEqual([
      300, 360, 432, 518, 622,
    ]);
    expect(roomTileCost(rules, 'lair', 0)).toBe(0);
    expect(roomCostRange(rules, 'lair', 0, 3)).toBe(300 + 360 + 432);
    expect(roomCostRange(rules, 'lair', 3, 5)).toBe(518 + 622);
  });

  it('una sala de 3 tiles cobra g + 1,2g + 1,44g y la cobra la simulación', () => {
    const m = world();
    expect(roomBuildCost(m.state, m.rules, 1, 'library', { x: 2, y: 11, w: 3, h: 1 })).toBe(
      250 + 300 + 360,
    );
    const before = m.state.players[0]!.gold;
    expect(build(m, 'library', 2, 11, 3, 1).ok).toBe(true);
    expect(m.state.players[0]!.gold).toBe(before - 910);
  });

  it('la previsión y la simulación cobran lo mismo (también partido en 10 + 2)', () => {
    const m = world(30000);
    const rect = { x: 2, y: 11, w: 6, h: 2 };
    const preview = previewCommand(m.state, m.data, 1, { type: 'buildRoom', room: 'lair', rect });
    expect(preview).toMatchObject({ ok: true, cost: 7787 + 660 });
    const before = m.state.players[0]!.gold;
    build(m, 'lair', 2, 11, 6, 2);
    expect(m.state.players[0]!.gold).toBe(before - 8447);
  });

  it('al ampliar una sala se sigue desde su tamaño; lo que desborda abre una sala nueva desde el precio base', () => {
    const m = world(40000);
    build(m, 'library', 2, 11, 3, 3); // 9 tiles
    // Tres tiles pegados: el 10.º amplía la sala (tile n.º 10) y los otros dos abren una sala nueva (tiles 1 y 2).
    const rect = { x: 5, y: 11, w: 1, h: 3 };
    const plan = planRoomBuild(m.state, m.rules, 1, 'library', rect);
    expect(plan.map((p) => [p.roomId === null, p.tiles.length]).sort()).toEqual([
      [false, 10],
      [true, 2],
    ]);
    const expected = roomTileCost(m.rules, 'library', 10) + roomCostRange(m.rules, 'library', 0, 2);
    expect(roomBuildCost(m.state, m.rules, 1, 'library', rect)).toBe(expected);
  });

  it('dos salas separadas del mismo tipo reinician el precio: es más barato dejar un hueco', () => {
    const m = world(40000);
    const joined = roomBuildCost(m.state, m.rules, 1, 'lair', { x: 2, y: 11, w: 6, h: 1 });
    const a = roomBuildCost(m.state, m.rules, 1, 'lair', { x: 2, y: 11, w: 3, h: 1 });
    const b = roomBuildCost(m.state, m.rules, 1, 'lair', { x: 6, y: 11, w: 3, h: 1 });
    expect(joined).toBe(roomCostRange(m.rules, 'lair', 0, 6));
    expect(a + b).toBeLessThan(joined);
  });

  it('vender devuelve el 50 % de lo que vale la sala hoy', () => {
    const m = world(5000);
    build(m, 'trainingRoom', 2, 11, 2, 2); // 4 tiles: 1.610
    expect(
      roomValue(
        m.rules,
        m.state.rooms.find((r) => r.type === 'trainingRoom')!,
      ),
    ).toBe(1610);
    m.state.players[0]!.gold = 100;
    applyCommand(m.state, m.data, 1, { type: 'sellRoom', tile: { x: 2, y: 11 } });
    step(m.state, m.data);
    expect(m.state.players[0]!.gold).toBe(100 + 805);
  });

  it('con factor 1 el precio vuelve a ser fijo por tile', () => {
    const m = world();
    m.data.economy.roomCostGrowthPerTile = 1;
    expect(roomBuildCost(m.state, m.rules, 1, 'lair', { x: 2, y: 11, w: 4, h: 2 })).toBe(2400);
  });

  it('NO_GOLD con el coste incremental: 1 de oro menos no alcanza', () => {
    const m = world(1609);
    const cmd = { type: 'buildRoom', room: 'lair', rect: { x: 2, y: 11, w: 2, h: 2 } } as const;
    expect(applyCommand(m.state, m.data, 1, cmd)).toEqual({ ok: false, error: 'NO_GOLD' });
    m.state.players[0]!.gold = 1610;
    expect(applyCommand(m.state, m.data, 1, cmd).ok).toBe(true);
  });
});
