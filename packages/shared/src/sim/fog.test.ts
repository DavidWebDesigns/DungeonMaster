import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { canSee, computeVisible, isVisible, visibleMask } from './fog';
import { tileIndex } from './grid';
import { rulesOf } from './rules';
import { step } from './step';
import { baseRoom, duel, run, spawn } from './testUtils';

describe('niebla de guerra', () => {
  it('ves tu base (tiles propios 2, Corazón 8, criaturas 6) y no la base enemiga', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    expect(isVisible(state, rules, 1, tileIndex(state, 6, 6))).toBe(true);
    expect(isVisible(state, rules, 1, tileIndex(state, 12, 6))).toBe(true); // del Corazón a ≤ 8
    expect(isVisible(state, rules, 1, tileIndex(state, 30, 30))).toBe(false);
    const h = baseRoom(data, 2, 'heart');
    expect(isVisible(state, rules, 1, tileIndex(state, h.x + 1, h.y + 1))).toBe(false);
    expect(isVisible(state, rules, 2, tileIndex(state, h.x + 1, h.y + 1))).toBe(true);
  });

  it('una criatura ve 6 tiles a su alrededor y no 7', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    spawn(state, data, 1, 'goblin', 30.5, 30.5);
    expect(canSee(state, rules, 1, 36.4, 30.5)).toBe(true);
    expect(canSee(state, rules, 1, 37.6, 30.5)).toBe(false);
    expect(canSee(state, rules, 2, 30.5, 30.5)).toBe(false);
  });

  it('el terreno visto queda recordado aunque ya no se vea', () => {
    const { state, data } = duel();
    const c = spawn(state, data, 1, 'goblin', 30.5, 30.5);
    run(state, data, 2);
    const p = state.players[0]!;
    const t = tileIndex(state, 32, 30);
    expect(p.seen[t]).toBe(1);
    c.x = 5.5;
    c.y = 8.5;
    run(state, data, 2);
    expect(p.seen[t]).toBe(1);
    expect(isVisible(state, rulesOf(data), 1, t)).toBe(false);
    // Lo que nunca se vio sigue en la niebla.
    expect(p.seen[tileIndex(state, 50, 20)]).toBe(0);
  });

  it('los Imps también ven', () => {
    const { state, data } = duel();
    const imp = state.imps.find((i) => i.owner === 1)!;
    imp.x = 20.5;
    imp.y = 20.5;
    expect(canSee(state, rulesOf(data), 1, 24.5, 20.5)).toBe(true);
  });

  it('soltar una criatura en territorio enemigo solo vale en un tile que se ve', () => {
    const { state, data } = duel();
    const g = spawn(state, data, 1, 'goblin', 4.5, 8.5);
    applyCommand(state, data, 1, { type: 'pickUp', id: g.id });
    step(state, data);
    const h = baseRoom(data, 2, 'heart');
    const enemyFloor = { x: h.x - 1, y: h.y + 1 };
    expect(applyCommand(state, data, 1, { type: 'drop', tile: enemyFloor })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    // Otra criatura propia que ve ese lugar lo hace posible.
    spawn(state, data, 1, 'troll', enemyFloor.x + 0.5, enemyFloor.y + 1.5);
    expect(applyCommand(state, data, 1, { type: 'drop', tile: enemyFloor }).ok).toBe(true);
  });

  it('en territorio propio se puede soltar siempre', () => {
    const { state, data } = duel();
    const g = spawn(state, data, 1, 'goblin', 4.5, 8.5);
    applyCommand(state, data, 1, { type: 'pickUp', id: g.id });
    step(state, data);
    expect(applyCommand(state, data, 1, { type: 'drop', tile: { x: 3, y: 8 } }).ok).toBe(true);
  });

  it('el resultado es una máscara por jugador y se recalcula al cambiar las entidades', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    const a = visibleMask(state, rules, 1);
    expect(a[tileIndex(state, 30, 30)]).toBe(0);
    spawn(state, data, 1, 'goblin', 30.5, 30.5);
    expect(visibleMask(state, rules, 1)[tileIndex(state, 30, 30)]).toBe(1);
    expect(computeVisible(state, rules, 2)[tileIndex(state, 30, 30)]).toBe(0);
  });
});
