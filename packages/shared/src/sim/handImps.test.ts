import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { tileIndex } from './grid';
import { step } from './step';
import { matchAtCorner0, pt, row, run } from './testUtils';

function pick(
  state: ReturnType<typeof matchAtCorner0>['state'],
  data: ReturnType<typeof matchAtCorner0>['data'],
  id: number,
) {
  const res = applyCommand(state, data, 1, { type: 'pickUp', id, kind: 'imp' });
  step(state, data);
  return res;
}

describe('Imps en la mano', () => {
  it('se recoge un Imp propio: queda quieto, sin tarea y sin verse en el mapa', () => {
    const { state, data } = matchAtCorner0();
    applyCommand(state, data, 1, { type: 'dig', tiles: row(4, 11, 13) });
    run(state, data, 20);
    const imp = state.imps.find((i) => i.owner === 1 && i.goal === 'task')!;
    expect(pick(state, data, imp.id).ok).toBe(true);
    expect(imp.held).toBe(true);
    expect(imp.taskId).toBe(0);
    expect(imp.mode).toBe('idle');
    expect(state.players[0]!.hand).toEqual([{ kind: 'imp', id: imp.id }]);
    const { x, y } = imp;
    run(state, data, 100);
    expect([imp.x, imp.y]).toEqual([x, y]);
  });

  it('errores: ajeno, inexistente y mano llena', () => {
    const { state, data } = matchAtCorner0();
    const enemy = state.imps.find((i) => i.owner === 2)!;
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: enemy.id, kind: 'imp' })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: 999, kind: 'imp' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    const mine = state.imps.filter((i) => i.owner === 1);
    for (let k = 0; k < 3; k++)
      applyCommand(state, data, 1, { type: 'pickUp', id: mine[k]!.id, kind: 'imp' });
    step(state, data);
    expect(state.players[0]!.hand).toHaveLength(3);
    // Se llena la mano (10) y el siguiente Imp ya no cabe.
    state.players[0]!.hand.push(
      ...Array.from({ length: 7 }, (_, i) => ({ kind: 'creature' as const, id: 100 + i })),
    );
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: mine[3]!.id, kind: 'imp' })).toEqual({
      ok: false,
      error: 'LIMIT_REACHED',
    });
  });

  it('al soltarlo va a la tarea marcada más cercana al tile de suelta, aunque otra tenga más prioridad', () => {
    const { state, data } = matchAtCorner0();
    // Dos tareas: excavar lejos (prioridad alta) y reforzar cerca del punto de suelta (prioridad baja).
    applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 8)] });
    applyCommand(state, data, 1, { type: 'reinforce', tiles: [pt(11, 3)] });
    step(state, data);
    // Los demás Imps se llevan las tareas: se retiran de la partida para aislar el caso.
    const imp = state.imps.find((i) => i.owner === 1)!;
    state.imps = state.imps.filter((i) => i.id === imp.id || i.owner !== 1);
    state.tasks.forEach((t) => (t.reservedBy = 0));
    imp.mode = 'idle';
    imp.goal = 'none';
    imp.taskId = 0;
    expect(pick(state, data, imp.id).ok).toBe(true);
    state.tasks.forEach((t) => (t.reservedBy = 0));
    expect(applyCommand(state, data, 1, { type: 'drop', tile: pt(10, 3) }).ok).toBe(true);
    step(state, data);
    const task = state.tasks.find((t) => t.id === imp.taskId)!;
    expect(task.kind).toBe('reinforce');
    expect(task.tile).toBe(tileIndex(state, 11, 3));
    expect(imp.held).toBe(false);
    expect([Math.floor(imp.x), Math.floor(imp.y)]).toEqual([10, 3]);
  });

  it('sin tareas marcadas, vuelve a su vida normal (reclama suelo cercano sin dueño)', () => {
    const { state, data } = matchAtCorner0();
    const imp = state.imps.find((i) => i.owner === 1)!;
    pick(state, data, imp.id);
    applyCommand(state, data, 1, { type: 'drop', tile: pt(3, 8) });
    step(state, data);
    expect(imp.held).toBe(false);
    expect(imp.taskId).toBe(0);
  });

  it('un Imp con oro encima lo entrega antes de ir a ninguna tarea', () => {
    const { state, data } = matchAtCorner0();
    applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 8)] });
    const imp = state.imps.find((i) => i.owner === 1)!;
    imp.carry = 120;
    pick(state, data, imp.id);
    applyCommand(state, data, 1, { type: 'drop', tile: pt(10, 8) });
    step(state, data);
    run(state, data, 3);
    expect(imp.goal).toBe('haul');
  });

  it('un Imp en la mano no puede ser atacado ni ve nada', () => {
    const { state, data } = matchAtCorner0();
    const imp = state.imps.find((i) => i.owner === 1)!;
    pick(state, data, imp.id);
    imp.x = 40.5;
    imp.y = 40.5;
    expect(state.imps.some((i) => i.held)).toBe(true);
  });

  it('soltar varios Imps y criaturas a la vez: cada uno según su tipo', () => {
    const { state, data } = matchAtCorner0();
    const mine = state.imps.filter((i) => i.owner === 1).slice(0, 3);
    for (const i of mine) applyCommand(state, data, 1, { type: 'pickUp', id: i.id, kind: 'imp' });
    step(state, data);
    for (let k = 0; k < 3; k++) applyCommand(state, data, 1, { type: 'drop', tile: pt(4, 9) });
    step(state, data);
    expect(state.players[0]!.hand).toEqual([]);
    expect(mine.every((i) => !i.held)).toBe(true);
  });
});
