import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { isMining } from './tasks';
import { rulesOf } from './rules';
import { tileIndex } from './grid';
import { matchAtCorner0, pt, run } from './testUtils';

/**
 * Prepara una veta de diamantes pegada a la base del jugador 1: se cambia el muro (11,4) por diamantes y se
 * marca para minar. Así se prueba la mecánica sin depender de dónde esté la veta del mapa.
 */
function withDiamond() {
  const { state, data } = matchAtCorner0();
  const rules = rulesOf(data);
  const tile = tileIndex(state, 11, 4);
  state.terrain[tile] = rules.terrainIndex['diamondVein']!;
  state.mapVersion++;
  expect(applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] }).ok).toBe(true);
  return { state, data, rules, tile };
}

const gold = (s: ReturnType<typeof matchAtCorner0>['state']) => s.players[0]!.gold;

describe('veta de diamantes infinita', () => {
  it('marcarla es minarla (como el oro) y los Imps llevan el oro a la Tesorería', () => {
    const { state, data, rules, tile } = withDiamond();
    run(state, data, 2);
    const task = state.tasks.find((t) => t.tile === tile)!;
    expect(isMining(state, rules, task)).toBe(true);
    const before = gold(state);
    run(state, data, 600);
    expect(gold(state)).toBeGreaterThan(before + 300);
  });

  it('nunca se agota: sigue siendo veta y sigue dando oro mucho después de lo que da una de oro', () => {
    const { state, data, tile } = withDiamond();
    // Una veta de oro normal da 600 por tile; aquí se extrae bastante más y el tile sigue intacto.
    state.players[0]!.gold = 0;
    run(state, data, 3000);
    expect(data.terrain[state.terrain[tile] as number]!.id).toBe('diamondVein');
    expect(state.tasks.some((t) => t.tile === tile)).toBe(true);
    // El oro ya ganado no es solo la reserva inicial: supera con mucho lo que cabría en una veta de oro de un tile.
    expect(gold(state) + state.imps.reduce((s, i) => s + i.carry, 0)).toBeGreaterThan(1200);
  });

  it('el Imp con la carga llena la lleva a la Tesorería y vuelve a la veta (no se queda parado)', () => {
    const { state, data } = withDiamond();
    const cap = data.economy.impCarryGold;
    let maxCarry = 0;
    let deposits = 0;
    for (let i = 0; i < 2500; i++) {
      const events = run(state, data, 1);
      deposits += events.filter((e) => e.type === 'goldDeposited').length;
      for (const imp of state.imps) if (imp.owner === 1) maxCarry = Math.max(maxCarry, imp.carry);
    }
    // Nunca carga más de su capacidad y entregó varias veces.
    expect(maxCarry).toBeLessThanOrEqual(cap + 1e-6);
    expect(deposits).toBeGreaterThan(2);
  });

  it('se puede desmarcar y entonces deja de minarse', () => {
    const { state, data, tile } = withDiamond();
    run(state, data, 200);
    expect(applyCommand(state, data, 1, { type: 'cancelDig', tiles: [pt(11, 4)] }).ok).toBe(true);
    run(state, data, 100);
    expect(state.tasks.some((t) => t.tile === tile)).toBe(false);
    for (const i of state.imps) i.carry = 0;
    state.players[0]!.gold = 100;
    run(state, data, 400);
    expect(gold(state)).toBeLessThanOrEqual(100);
  });

  it('con la Tesorería llena no se extrae más (y no se pierde oro)', () => {
    const { state, data } = withDiamond();
    state.players[0]!.gold = 9000;
    run(state, data, 600);
    expect(gold(state)).toBeLessThanOrEqual(9000);
    for (const imp of state.imps) if (imp.owner === 1) expect(imp.carry).toBeLessThan(1);
  });
});
