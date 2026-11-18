import { describe, expect, it } from 'vitest';
import { claimedTileCount, createImpCost, manaRegenPerSecond, treasuryCapacity } from './economy';
import { rulesOf } from './rules';
import { matchAtCorner0, run } from './testUtils';

describe('economía', () => {
  const { state, data } = matchAtCorner0();
  const rules = rulesOf(data);

  it('la Tesorería inicial guarda 9.000 (3×3 tiles a 1.000)', () => {
    expect(treasuryCapacity(state, rules, 1)).toBe(9000);
  });

  it('el maná regenera 4/s + 0,1/s por tile reclamado', () => {
    expect(claimedTileCount(state, rules, 1)).toBe(81);
    expect(manaRegenPerSecond(state, rules, 1)).toBeCloseTo(12.1);
  });

  it('el maná sube por tick, con tope de regeneración de 25/s y máximo de 5.000', () => {
    const m = matchAtCorner0();
    run(m.state, m.data, 10);
    expect(m.state.players[0]!.mana).toBeCloseTo(2000 + 12.1, 6);
    m.state.players[0]!.mana = 4999;
    run(m.state, m.data, 50);
    expect(m.state.players[0]!.mana).toBe(5000);
    // Con muchísimo territorio la regeneración se queda en 25/s.
    for (let i = 0; i < m.state.owner.length; i++)
      if (m.state.terrain[i] === m.state.terrain[100]) m.state.owner[i] = 1;
    expect(manaRegenPerSecond(m.state, rulesOf(m.data), 1)).toBeLessThanOrEqual(25);
  });

  it('Crear Imp: 300 con 4 Imps y +50 por cada uno de más', () => {
    expect(createImpCost(state, rules, 1)).toBe(300);
    const m = matchAtCorner0();
    m.state.imps.push({ ...m.state.imps[0]!, id: 99 });
    expect(createImpCost(m.state, rulesOf(m.data), 1)).toBe(350);
  });
});
