import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { matchAtCorner0, pt, run, send, terrainId } from './testUtils';

/** Ticks que tarda en abrirse el muro (11,4) con un solo Imp trabajando, con o sin bofetada. */
function ticksToDig(slap: boolean): number {
  const { state, data } = matchAtCorner0();
  // Un solo Imp: se quitan los demás para que el tiempo dependa solo de su velocidad.
  state.imps = state.imps.filter((i) => i.owner === 1).slice(0, 1);
  const imp = state.imps[0]!;
  imp.x = 10.5;
  imp.y = 4.5;
  send(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] });
  if (slap) applyCommand(state, data, 1, { type: 'slap', id: imp.id, kind: 'imp' });
  let n = 0;
  while (terrainId(state, data, 11, 4) === 'earth' && n < 600) {
    run(state, data, 1);
    n++;
  }
  return n;
}

describe('bofetada a los Imps', () => {
  it('un Imp abofeteado trabaja más rápido (por el bono de los datos) y se emite el evento', () => {
    const { state, data } = matchAtCorner0();
    const imp = state.imps.find((i) => i.owner === 1)!;
    expect(applyCommand(state, data, 1, { type: 'slap', id: imp.id, kind: 'imp' })).toEqual({
      ok: true,
      accepted: 0,
    });
    const events = run(state, data, 1);
    expect(events).toContainEqual({ type: 'impSlapped', playerId: 1, impId: imp.id });
    expect(imp.slapUntil).toBeGreaterThan(state.tick);
    // Con el mismo trabajo, el Imp abofeteado termina antes.
    const normal = ticksToDig(false);
    const fast = ticksToDig(true);
    expect(fast).toBeLessThan(normal);
  });

  it('el bono dura lo que dicen los datos y después vuelve a la velocidad normal', () => {
    const { state, data } = matchAtCorner0();
    const imp = state.imps.find((i) => i.owner === 1)!;
    send(state, data, 1, { type: 'slap', id: imp.id, kind: 'imp' });
    const secs = data.global.slap.durationSeconds;
    run(state, data, Math.round(secs * data.global.tickRate) + 2);
    expect(state.tick).toBeGreaterThanOrEqual(imp.slapUntil);
  });

  it('comparte el tiempo de espera con las criaturas', () => {
    const { state, data } = matchAtCorner0();
    const [a, b] = state.imps.filter((i) => i.owner === 1);
    expect(applyCommand(state, data, 1, { type: 'slap', id: a!.id, kind: 'imp' }).ok).toBe(true);
    run(state, data, 1);
    expect(applyCommand(state, data, 1, { type: 'slap', id: b!.id, kind: 'imp' })).toEqual({
      ok: false,
      error: 'COOLDOWN',
    });
  });

  it('no se puede abofetear a un Imp enemigo, a uno en la mano ni a uno que no existe', () => {
    const { state, data } = matchAtCorner0();
    const enemy = state.imps.find((i) => i.owner === 2)!;
    expect(applyCommand(state, data, 1, { type: 'slap', id: enemy.id, kind: 'imp' })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
    expect(applyCommand(state, data, 1, { type: 'slap', id: 99999, kind: 'imp' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    const mine = state.imps.find((i) => i.owner === 1)!;
    mine.held = true;
    expect(applyCommand(state, data, 1, { type: 'slap', id: mine.id, kind: 'imp' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('sin "kind" sigue siendo la bofetada a criaturas (un id de Imp no vale)', () => {
    const { state, data } = matchAtCorner0();
    const imp = state.imps.find((i) => i.owner === 1)!;
    expect(applyCommand(state, data, 1, { type: 'slap', id: imp.id })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });
});
