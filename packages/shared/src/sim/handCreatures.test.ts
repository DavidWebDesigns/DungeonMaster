import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { tileIndex } from './grid';
import { step } from './step';
import { duel, pt, spawn } from './testUtils';

describe('coger y soltar criaturas', () => {
  it('es imposible coger una criatura de otro jugador (NOT_OWNER) y la mano no cambia', () => {
    const { state, data } = duel();
    const theirs = spawn(state, data, 2, 'goblin', 40.5, 40.5);
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: theirs.id })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
    step(state, data);
    expect(theirs.held).toBe(false);
    expect(state.players[0]!.hand).toEqual([]);
    // Ni aunque la tenga el rival en la mano ni con una orden inventada del tipo de unidad.
    theirs.held = true;
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: theirs.id }).ok).toBe(false);
  });

  it('una criatura propia se recoge y se suelta en un tile ya reclamado como propio', () => {
    const { state, data } = duel();
    const mine = spawn(state, data, 1, 'goblin', 6.5, 6.5);
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: mine.id }).ok).toBe(true);
    step(state, data);
    expect(mine.held).toBe(true);
    expect(state.players[0]!.hand).toEqual([{ kind: 'creature', id: mine.id }]);
    // (6,6) es suelo reclamado propio de la base inicial.
    expect(applyCommand(state, data, 1, { type: 'drop', tile: pt(6, 6) }).ok).toBe(true);
    step(state, data);
    expect(mine.held).toBe(false);
    expect([Math.floor(mine.x), Math.floor(mine.y)]).toEqual([6, 6]);
  });

  it('no se suelta en terreno sin reclamar, ajeno ni en un muro', () => {
    const { state, data } = duel();
    const mine = spawn(state, data, 1, 'goblin', 6.5, 6.5);
    applyCommand(state, data, 1, { type: 'pickUp', id: mine.id });
    step(state, data);
    // Un tile de suelo sin dueño (tierra de nadie) y un muro de tierra.
    const neutral = data.terrain.findIndex((t) => t.id === 'neutralFloor');
    state.terrain[tileIndex(state, 20, 20)] = neutral;
    state.owner[tileIndex(state, 20, 20)] = 0;
    expect(applyCommand(state, data, 1, { type: 'drop', tile: pt(20, 20) })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
    expect(applyCommand(state, data, 1, { type: 'drop', tile: pt(11, 4) })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    // Un tile de la base del rival (reclamado, pero suyo).
    const enemy = data.map.bases.find((b) => b.slot === state.players[1]!.slot)!.claimed;
    expect(
      applyCommand(state, data, 1, { type: 'drop', tile: pt(enemy.x + 1, enemy.y + 1) }),
    ).toEqual({ ok: false, error: 'NOT_OWNER' });
    expect(mine.held).toBe(true);
  });
});
