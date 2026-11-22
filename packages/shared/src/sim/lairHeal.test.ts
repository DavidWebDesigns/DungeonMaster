import { describe, expect, it } from 'vitest';
import { creatureMaxHp } from './creatureStats';
import { newCreature } from './portal';
import { rulesOf } from './rules';
import { buildRooms, matchAtCorner0, run } from './testUtils';
import type { Creature, MatchState } from './types';
import type { DataSet } from '../data';

function world() {
  const m = matchAtCorner0();
  m.data.global.portal.attractIntervalSeconds = 100000;
  m.data.economy.paydayIntervalSeconds = 100000;
  m.data.economy.hunger.risePerSecond = 0.0001;
  buildRooms(m.state, m.data, ['lair']);
  m.state.imps = m.state.imps.filter((i) => i.owner !== 1);
  return m;
}

function resting(state: MatchState, data: DataSet, patch: Partial<Creature> = {}) {
  const rules = rulesOf(data);
  const bed = 11 * 64 + 2;
  const c = newCreature(state, rules, 1, 'goblin', bed);
  c.beds = [bed];
  c.x = 2.5;
  c.y = 11.5;
  c.goal = 'bed';
  c.mode = 'acting';
  c.sleep = 80;
  Object.assign(c, patch);
  state.creatures.push(c);
  return { c, max: creatureMaxHp(rules, c) };
}

describe('descansar en la Guarida cura de forma progresiva', () => {
  it('un 3 % de la vida máxima cada 2,5 s (los datos lo dicen)', () => {
    const { state, data } = world();
    expect(data.economy.sleep.lairHealFraction).toBe(0.03);
    expect(data.economy.sleep.lairHealIntervalSeconds).toBe(2.5);
    const { c, max } = resting(state, data);
    c.hp = max * 0.5;
    run(state, data, 25); // 2,5 s
    expect(c.hp).toBeCloseTo(max * 0.53, 0);
    run(state, data, 75); // 7,5 s más (10 s en total)
    expect(c.hp).toBeCloseTo(max * (0.5 + 0.12), 0);
  });

  it('es gradual: sube en cada tick, no a saltos', () => {
    const { state, data } = world();
    const { c, max } = resting(state, data);
    c.hp = max * 0.4;
    const samples: number[] = [];
    for (let n = 0; n < 10; n++) {
      run(state, data, 1);
      samples.push(c.hp);
    }
    for (let n = 1; n < samples.length; n++) expect(samples[n]!).toBeGreaterThan(samples[n - 1]!);
    expect(samples[9]! - max * 0.4).toBeCloseTo(max * 0.012 * 1, 0); // 1 s = 1,2 %
  });

  it('nunca pasa de la vida máxima', () => {
    const { state, data } = world();
    const { c, max } = resting(state, data);
    c.hp = max - 1;
    run(state, data, 50);
    expect(c.hp).toBe(max);
  });

  it('solo se cura quien descansa (durmiendo o recuperándose tras huir), no quien anda o espera', () => {
    const { state, data } = world();
    const walking = resting(state, data, { mode: 'moving', goal: 'wander', sleep: 0 });
    walking.c.hp = walking.max * 0.5;
    const fleeing = resting(state, data, { goal: 'flee', mode: 'acting', hp: 0 });
    fleeing.c.hp = fleeing.max * 0.1;
    run(state, data, 30);
    expect(walking.c.hp).toBeLessThanOrEqual(walking.max * 0.5 + 1); // no sube por descansar
    expect(fleeing.c.hp).toBeGreaterThan(fleeing.max * 0.1);
  });
});
