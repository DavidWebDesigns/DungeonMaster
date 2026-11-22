import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { step } from './step';
import { buildRooms, duel, run, spawn } from './testUtils';

const CALL = { type: 'castSpell', spell: 'callToArms', target: { x: 8, y: 4 } } as const;

function setup() {
  const m = duel();
  m.data.global.portal.attractIntervalSeconds = 100000;
  m.data.economy.paydayIntervalSeconds = 100000;
  m.data.economy.hunger.risePerSecond = 0.0001;
  m.data.economy.sleep.risePerSecond = 0.0001;
  m.state.players[0]!.mana = 5000;
  return m;
}
const cast = (m: ReturnType<typeof setup>) => {
  const res = applyCommand(m.state, m.data, 1, CALL);
  step(m.state, m.data);
  return res;
};

describe('cancelar la Llamada a las armas', () => {
  it('quita el punto y las criaturas dejan de acudir', () => {
    const m = setup();
    const a = spawn(m.state, m.data, 1, 'goblin', 3.5, 8.5);
    expect(cast(m).ok).toBe(true);
    run(m.state, m.data, 20);
    expect(a.goal).toBe('rally');
    expect(m.state.players[0]!.rallyTile).toBe(4 * 64 + 8);
    expect(applyCommand(m.state, m.data, 1, { type: 'cancelRally' }).ok).toBe(true);
    const events = step(m.state, m.data);
    expect(events).toContainEqual({ type: 'rallyCancelled', playerId: 1 });
    expect(m.state.players[0]!.rallyTile).toBe(-1);
    run(m.state, m.data, 5);
    expect(a.goal).not.toBe('rally');
  });

  it('las criaturas siguen en lo que estaban: una que entrenaba vuelve a entrenar', () => {
    const m = setup();
    buildRooms(m.state, m.data, ['lair', 'trainingRoom']);
    m.state.imps = m.state.imps.filter((i) => i.owner !== 1);
    const c = spawn(m.state, m.data, 1, 'goblin', 3.5, 14.5, { beds: [11 * 64 + 2] });
    run(m.state, m.data, 60);
    expect(c.goal).toBe('training');
    cast(m);
    run(m.state, m.data, 10);
    expect(c.goal).toBe('rally'); // la llamada la sacó del entrenamiento
    applyCommand(m.state, m.data, 1, { type: 'cancelRally' });
    run(m.state, m.data, 60);
    expect(c.goal).toBe('training'); // y al cancelar vuelve a lo suyo
  });

  it('una que dormía no se interrumpió nunca y sigue durmiendo', () => {
    const m = setup();
    buildRooms(m.state, m.data, ['lair']);
    m.state.imps = m.state.imps.filter((i) => i.owner !== 1);
    const c = spawn(m.state, m.data, 1, 'goblin', 2.5, 11.5, {
      beds: [11 * 64 + 2],
      goal: 'bed',
      mode: 'acting',
      sleep: 80,
    });
    cast(m);
    run(m.state, m.data, 20);
    expect(c.goal).toBe('bed');
    applyCommand(m.state, m.data, 1, { type: 'cancelRally' });
    run(m.state, m.data, 5);
    expect(c.goal).toBe('bed');
  });

  it('sin Llamada activa, o ya caducada, se rechaza (INVALID_TARGET)', () => {
    const m = setup();
    expect(applyCommand(m.state, m.data, 1, { type: 'cancelRally' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    cast(m);
    run(m.state, m.data, 215); // pasan los 20 s
    expect(applyCommand(m.state, m.data, 1, { type: 'cancelRally' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('solo cancela la del propio jugador y no devuelve el maná ni el enfriamiento', () => {
    const m = setup();
    m.state.players[1]!.mana = 5000;
    applyCommand(m.state, m.data, 2, {
      type: 'castSpell',
      spell: 'callToArms',
      target: { x: 55, y: 59 },
    });
    step(m.state, m.data);
    const theirs = m.state.players[1]!.rallyTile;
    cast(m);
    const manaAfterCast = m.state.players[0]!.mana;
    applyCommand(m.state, m.data, 1, { type: 'cancelRally' });
    step(m.state, m.data);
    expect(m.state.players[1]!.rallyTile).toBe(theirs); // la del rival sigue
    expect(m.state.players[0]!.mana).toBeLessThanOrEqual(manaAfterCast + 25); // sin reembolso (solo la regeneración)
    expect(applyCommand(m.state, m.data, 1, CALL)).toEqual({ ok: false, error: 'COOLDOWN' });
  });

  it('cancelar no rompe la partida (determinismo)', () => {
    const run2 = () => {
      const m = setup();
      spawn(m.state, m.data, 1, 'goblin', 3.5, 8.5);
      cast(m);
      run(m.state, m.data, 30);
      applyCommand(m.state, m.data, 1, { type: 'cancelRally' });
      run(m.state, m.data, 100);
      return JSON.stringify(m.state.creatures.map((c) => [c.x, c.y, c.goal]));
    };
    expect(run2()).toBe(run2());
  });
});
