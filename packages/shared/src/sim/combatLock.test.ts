import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { isInCombat } from './combat';
import { rulesOf } from './rules';
import { step } from './step';
import { duel, run, spawn } from './testUtils';

const pick = (
  state: ReturnType<typeof duel>['state'],
  data: ReturnType<typeof duel>['data'],
  id: number,
) => applyCommand(state, data, 1, { type: 'pickUp', id });

describe('las criaturas en combate no se pueden retirar del mapa', () => {
  it('con objetivo de combate o de asedio: IN_COMBAT y siguen en el mapa', () => {
    for (const goal of ['combat', 'siege'] as const) {
      const { state, data } = duel();
      const c = spawn(state, data, 1, 'goblin', 6.5, 6.5, { goal, mode: 'acting' });
      expect(pick(state, data, c.id)).toEqual({ ok: false, error: 'IN_COMBAT' });
      step(state, data);
      expect(c.held).toBe(false);
      expect(state.players[0]!.hand).toEqual([]);
    }
  });

  it('si la han atacado hace poco también cuenta (aunque huya) y deja de contar pasado el tiempo de los datos', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    const c = spawn(state, data, 1, 'goblin', 6.5, 6.5, { goal: 'flee', mode: 'moving' });
    c.attackedTick = state.tick - 5;
    expect(isInCombat(state, rules, c)).toBe(true);
    expect(pick(state, data, c.id)).toEqual({ ok: false, error: 'IN_COMBAT' });
    const lock = data.global.combat.retaliationSeconds * data.global.tickRate;
    c.attackedTick = state.tick - lock - 1;
    c.goal = 'none';
    c.mode = 'idle';
    expect(isInCombat(state, rules, c)).toBe(false);
    expect(pick(state, data, c.id).ok).toBe(true);
  });

  it('en una pelea real: no se puede retirar mientras dura y sí cuando termina', () => {
    const { state, data } = duel();
    const mine = spawn(state, data, 1, 'troll', 6.5, 6.5, { mood: 50 });
    const foe = spawn(state, data, 2, 'goblin', 7.5, 6.5, { mood: 50 });
    let blocked = false;
    for (let n = 0; n < 40 && !blocked; n++) {
      step(state, data);
      if (mine.goal === 'combat' && foe.hp > 0) {
        blocked = pick(state, data, mine.id).ok === false;
      }
    }
    expect(blocked).toBe(true);
    // Muerto el rival y pasado el tiempo de recuerdo, se puede coger.
    foe.hp = 0;
    run(state, data, 100);
    expect(isInCombat(state, rulesOf(data), mine)).toBe(false);
    expect(pick(state, data, mine.id).ok).toBe(true);
  });

  it('las de otro jugador siguen siendo NOT_OWNER antes que nada, y los Imps se pueden coger siempre', () => {
    const { state, data } = duel();
    const foe = spawn(state, data, 2, 'goblin', 40.5, 40.5, { goal: 'combat', mode: 'acting' });
    expect(pick(state, data, foe.id)).toEqual({ ok: false, error: 'NOT_OWNER' });
    const imp = state.imps.find((i) => i.owner === 1)!;
    imp.attackedTick = state.tick - 1;
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: imp.id, kind: 'imp' }).ok).toBe(true);
  });
});
