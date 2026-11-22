import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { creatureMaxHp } from './creatureStats';
import { rulesOf } from './rules';
import { step } from './step';
import { duel, run, spawn } from './testUtils';
import type { Command } from './types';

const noImps = (s: { imps: Array<{ owner: number }> }) => {
  s.imps = s.imps.filter(() => false);
};

function cast(
  state: Parameters<typeof applyCommand>[0],
  data: Parameters<typeof applyCommand>[1],
  cmd: Command,
  pid = 1,
) {
  const res = applyCommand(state, data, pid, cmd);
  step(state, data);
  return res;
}

describe('Rayo', () => {
  it('hace 600 de daño en 1,5 tiles a criaturas e Imps enemigos y a nadie más', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    const enemy = spawn(state, data, 2, 'troll', 5.5, 8.5, { mood: 50 });
    const outside = spawn(state, data, 2, 'troll', 8.5, 8.5, { mood: 50 });
    const own = spawn(state, data, 1, 'goblin', 2.5, 8.5, { mood: 50 });
    const hp = (c: { hp: number }) => c.hp;
    const [e0, o0, w0] = [hp(enemy), hp(outside), hp(own)];
    const res = cast(state, data, {
      type: 'castSpell',
      spell: 'lightning',
      target: { x: 5, y: 8 },
    });
    expect(res.ok).toBe(true);
    expect(e0 - enemy.hp).toBe(600);
    expect(hp(outside)).toBe(o0);
    expect(hp(own)).toBe(w0);
    expect(state.players[0]!.mana).toBeLessThan(4510);
  });

  it('no daña salas ni el Corazón', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    const treasuryBefore = state.rooms.filter((r) => r.owner === 1).map((r) => r.tiles.length);
    cast(state, data, { type: 'castSpell', spell: 'lightning', target: { x: 6, y: 6 } });
    expect(state.players[0]!.heartHp).toBe(8000);
    expect(state.rooms.filter((r) => r.owner === 1).map((r) => r.tiles.length)).toEqual(
      treasuryBefore,
    );
  });

  it('mata a una criatura débil: cuenta como muerte por hechizo y no da experiencia', () => {
    const { state, data } = duel();
    data.global.downed.seconds = 0;
    state.players[0]!.mana = 5000;
    const victim = spawn(state, data, 2, 'goblin', 5.5, 8.5, { hp: 300 });
    const events = (() => {
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'lightning',
        target: { x: 5, y: 8 },
      });
      return step(state, data);
    })();
    expect(
      events.some(
        (e) => e.type === 'creatureDied' && e.creatureId === victim.id && e.cause === 'spell',
      ),
    ).toBe(true);
  });

  it('solo sobre tiles que se ven: fuera de la vista da INVALID_TARGET', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    expect(
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'lightning',
        target: { x: 40, y: 40 },
      }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });

  it('errores de maná y enfriamiento', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 100;
    expect(
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'lightning',
        target: { x: 5, y: 8 },
      }),
    ).toEqual({ ok: false, error: 'NO_MANA' });
    state.players[0]!.mana = 5000;
    expect(
      cast(state, data, { type: 'castSpell', spell: 'lightning', target: { x: 5, y: 8 } }).ok,
    ).toBe(true);
    expect(
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'lightning',
        target: { x: 5, y: 8 },
      }),
    ).toEqual({ ok: false, error: 'COOLDOWN' });
    run(state, data, 101);
    expect(
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'lightning',
        target: { x: 5, y: 8 },
      }).ok,
    ).toBe(true);
  });
});

describe('Acelerar y Curar', () => {
  it('Acelerar da +50 % de velocidad de movimiento y de ataque durante 20 s a una criatura propia', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    const g = spawn(state, data, 1, 'goblin', 4.5, 8.5);
    expect(cast(state, data, { type: 'castSpell', spell: 'haste', creature: g.id }).ok).toBe(true);
    expect(g.hasteUntil - state.tick).toBeGreaterThan(190);
    expect(g.hasteUntil - state.tick).toBeLessThanOrEqual(200);
    run(state, data, 205);
    expect(state.tick).toBeGreaterThan(g.hasteUntil);
  });

  it('un acelerado se mueve más rápido', () => {
    const dist = (hasted: boolean) => {
      const { state, data } = duel();
      noImps(state);
      state.players[0]!.mana = 5000;
      const g = spawn(state, data, 1, 'goblin', 4.5, 8.5);
      g.goal = 'wander';
      g.wanderTile = 9 * 64 + 9;
      g.mode = 'needPath';
      if (hasted) g.hasteUntil = 10000;
      const x0 = g.x;
      const y0 = g.y;
      run(state, data, 10);
      return Math.hypot(g.x - x0, g.y - y0);
    };
    expect(dist(true) / dist(false)).toBeGreaterThan(1.4);
    expect(dist(true) / dist(false)).toBeLessThan(1.6);
  });

  it('Curar devuelve el 40 % de la vida máxima repartido en 3 s, sin pasar del máximo', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    state.players[0]!.mana = 5000;
    const t = spawn(state, data, 1, 'troll', 4.5, 8.5, { hp: 500 });
    const max = creatureMaxHp(rules, t);
    cast(state, data, { type: 'castSpell', spell: 'heal', creature: t.id });
    run(state, data, 40);
    expect(t.hp).toBeCloseTo(500 + max * 0.4, 0);
    t.hp = max - 100;
    cast(state, data, { type: 'castSpell', spell: 'heal', creature: t.id });
    run(state, data, 40);
    expect(t.hp).toBeLessThanOrEqual(max);
  });

  it('solo sobre criaturas propias: la ajena da NOT_OWNER, la inexistente INVALID_TARGET', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    const enemy = spawn(state, data, 2, 'troll', 5.5, 8.5);
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'heal', creature: enemy.id }),
    ).toEqual({ ok: false, error: 'NOT_OWNER' });
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'haste', creature: 999 }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(applyCommand(state, data, 1, { type: 'castSpell', spell: 'haste' })).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
  });

  it('cuestan su maná: Acelerar 300, Curar 400', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 2000;
    const g = spawn(state, data, 1, 'goblin', 4.5, 8.5);
    cast(state, data, { type: 'castSpell', spell: 'haste', creature: g.id });
    expect(state.players[0]!.mana).toBeGreaterThan(1700);
    expect(state.players[0]!.mana).toBeLessThan(1705);
    cast(state, data, { type: 'castSpell', spell: 'heal', creature: g.id });
    expect(state.players[0]!.mana).toBeGreaterThan(1300);
    expect(state.players[0]!.mana).toBeLessThan(1310);
  });
});

describe('Llamada a las armas', () => {
  it('marca un punto 20 s y todas las criaturas disponibles acuden', () => {
    const { state, data } = duel();
    noImps(state);
    state.players[0]!.mana = 5000;
    const a = spawn(state, data, 1, 'goblin', 3.5, 8.5);
    const b = spawn(state, data, 1, 'troll', 3.5, 9.5);
    const sleeping = spawn(state, data, 1, 'goblin', 4.5, 9.5, { held: true });
    expect(
      cast(state, data, { type: 'castSpell', spell: 'callToArms', target: { x: 8, y: 4 } }).ok,
    ).toBe(true);
    expect(state.players[0]!.rallyTile).toBe(4 * 64 + 8);
    run(state, data, 120);
    for (const c of [a, b]) expect(Math.hypot(c.x - 8.5, c.y - 4.5)).toBeLessThan(1.5);
    expect(sleeping.held).toBe(true);
  });

  it('el punto caduca a los 20 s', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    cast(state, data, { type: 'castSpell', spell: 'callToArms', target: { x: 8, y: 4 } });
    run(state, data, 205);
    expect(state.players[0]!.rallyTile).toBe(-1);
  });

  it('pide un tile visible y caminable, y cuesta 600 con 20 s de enfriamiento', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    expect(
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'callToArms',
        target: { x: 11, y: 4 },
      }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' }); // muro
    expect(
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'callToArms',
        target: { x: 40, y: 40 },
      }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' }); // lejos
    cast(state, data, { type: 'castSpell', spell: 'callToArms', target: { x: 8, y: 4 } });
    expect(5000 - state.players[0]!.mana).toBeGreaterThan(595);
    expect(
      applyCommand(state, data, 1, {
        type: 'castSpell',
        spell: 'callToArms',
        target: { x: 8, y: 4 },
      }),
    ).toEqual({ ok: false, error: 'COOLDOWN' });
  });

  it('las criaturas llamadas pelean contra lo que encuentren al llegar', () => {
    const { state, data } = duel();
    state.players[0]!.mana = 5000;
    const mine = spawn(state, data, 1, 'troll', 4.5, 8.5, { mood: 50 });
    const enemy = spawn(state, data, 2, 'goblin', 8.5, 4.5, { mood: 50 });
    cast(state, data, { type: 'castSpell', spell: 'callToArms', target: { x: 8, y: 5 } });
    run(state, data, 300);
    expect(enemy.hp).toBeLessThan(creatureMaxHp(rulesOf(data), enemy));
    void mine;
  });
});
