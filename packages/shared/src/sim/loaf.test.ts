import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { isLoafing, maybeLoaf } from './imps';
import { rulesOf } from './rules';
import { step } from './step';
import { matchAtCorner0, pt, run, send, terrainId } from './testUtils';

/** Un solo Imp propio, al lado del muro (11,4), con holgazanería siempre (5 s). */
function lazyWorld(chance = 1) {
  const { state, data } = matchAtCorner0();
  data.global.imps.loaf = { chance, minSeconds: 5, maxSeconds: 5, speedFactor: 0.4 };
  state.imps = state.imps.filter((i) => i.owner === 1).slice(0, 1);
  const imp = state.imps[0]!;
  imp.x = 10.5;
  imp.y = 4.5;
  return { state, data, imp, rules: rulesOf(data) };
}

describe('Imps holgazanes', () => {
  it('al terminar una tarea se quedan sin coger trabajo durante el tiempo sorteado', () => {
    const { state, data, imp } = lazyWorld();
    send(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] });
    let n = 0;
    while (terrainId(state, data, 11, 4) === 'earth' && n++ < 600) run(state, data, 1);
    run(state, data, 2);
    expect(isLoafing(state, imp)).toBe(true);
    expect(imp.loafUntil - state.tick).toBeLessThanOrEqual(5 * data.global.tickRate);
    // Hay trabajo nuevo, pero no lo coge mientras holgazanea.
    send(state, data, 1, { type: 'dig', tiles: [pt(11, 5)] });
    run(state, data, 30);
    expect(imp.taskId).toBe(0);
    expect(imp.goal === 'loaf' || imp.goal === 'none').toBe(true);
    // Pasado el tiempo, vuelve al trabajo.
    run(state, data, 6 * data.global.tickRate);
    expect(isLoafing(state, imp)).toBe(false);
    run(state, data, 100);
    expect(terrainId(state, data, 11, 5)).not.toBe('earth');
  });

  it('pasea solo por suelo propio y despacio', () => {
    const { state, data, imp, rules } = lazyWorld();
    imp.x = 5.5;
    imp.y = 5.5;
    maybeLoaf(state, rules, imp);
    expect(imp.goal).toBe('loaf');
    expect(imp.loafTile).toBeGreaterThanOrEqual(0);
    expect(state.owner[imp.loafTile]).toBe(1);
    const start = { x: imp.x, y: imp.y };
    run(state, data, 10);
    const moved = Math.hypot(imp.x - start.x, imp.y - start.y);
    // 10 ticks = 1 s: nunca más de la velocidad de paseo (la normal × speedFactor).
    expect(moved).toBeLessThanOrEqual(rules.imp.base.speed * 0.4 * 1.0 + 1e-6);
  });

  it('con probabilidad 0 no holgazanean ni gastan números aleatorios', () => {
    const { state, imp, rules } = lazyWorld(0);
    const before = state.rng;
    maybeLoaf(state, rules, imp);
    expect(imp.loafUntil).toBe(0);
    expect(state.rng).toBe(before);
  });

  it('un Imp cargado de oro no holgazanea (primero entrega)', () => {
    const { state, imp, rules } = lazyWorld();
    imp.carry = 100;
    maybeLoaf(state, rules, imp);
    expect(imp.loafUntil).toBe(0);
  });

  it('la bofetada lo despierta, le da el bono y lo manda a la tarea pendiente más cercana por camino', () => {
    const { state, data, imp, rules } = lazyWorld();
    imp.x = 10.5;
    imp.y = 4.5;
    maybeLoaf(state, rules, imp);
    expect(isLoafing(state, imp)).toBe(true);
    // Dos tareas pendientes (nadie las ha cogido): el Imp está justo al lado de (11,4).
    applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] });
    applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 9)] });
    applyCommand(state, data, 1, { type: 'slap', id: imp.id, kind: 'imp' });
    step(state, data);
    expect(isLoafing(state, imp)).toBe(false);
    expect(imp.slapUntil).toBeGreaterThan(state.tick);
    const task = state.tasks.find((t) => t.id === imp.taskId);
    expect(task?.tile).toBe(4 * 64 + 11);
  });

  it('si no hay nada pendiente, la bofetada solo lo despierta y sigue su vida', () => {
    const { state, data, imp, rules } = lazyWorld();
    maybeLoaf(state, rules, imp);
    send(state, data, 1, { type: 'slap', id: imp.id, kind: 'imp' });
    expect(isLoafing(state, imp)).toBe(false);
    expect(imp.taskId).toBe(0);
    expect(imp.loafTile).toBe(-1);
  });

  it('a un Imp que ya trabaja la bofetada no le cambia la tarea', () => {
    const { state, data, imp } = lazyWorld(0);
    send(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] });
    run(state, data, 15);
    const current = imp.taskId;
    expect(current).not.toBe(0);
    applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 9)] });
    send(state, data, 1, { type: 'slap', id: imp.id, kind: 'imp' });
    expect(imp.taskId).toBe(current);
  });

  it('la misma semilla y los mismos comandos dan la misma holgazanería', () => {
    const play = () => {
      const w = lazyWorld(0.5);
      send(w.state, w.data, 1, { type: 'dig', tiles: [pt(11, 4), pt(11, 5), pt(11, 6)] });
      run(w.state, w.data, 600);
      return [w.imp.x, w.imp.y, w.imp.loafUntil, w.state.rng];
    };
    expect(play()).toEqual(play());
  });
});

describe('los Imps no atacan', () => {
  it('un Imp junto a un enemigo no produce golpes propios', () => {
    const { state, data } = matchAtCorner0();
    const mine = state.imps.find((i) => i.owner === 1)!;
    const enemy = state.imps.find((i) => i.owner === 2)!;
    enemy.x = mine.x + 0.5;
    enemy.y = mine.y;
    const events = run(state, data, 100);
    expect(events.filter((e) => e.type === 'hit' && e.attackerOwner === 1)).toEqual([]);
    expect(enemy.hp).toBeGreaterThan(0);
  });
});
