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
    // Pasado el tiempo, vuelve al trabajo (y esta vez no vuelve a holgazanear, para no mezclar los dos efectos).
    data.global.imps.loaf.chance = 0;
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
    // Sin objetivo vuelve a su estado por defecto (pasear), no a holgazanear de verdad.
    run(state, data, 3);
    expect(isLoafing(state, imp)).toBe(false);
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

describe('estado por defecto: pasear sin objetivo', () => {
  it('un Imp sin nada que hacer pasea despacio por su territorio, con pausas entre paseos', () => {
    const { state, data, imp, rules } = lazyWorld(0);
    imp.x = 5.5;
    imp.y = 8.5;
    run(state, data, 1);
    expect(imp.goal).toBe('loaf');
    expect(imp.loafUntil).toBe(0); // no es holgazanear de verdad
    const start = { x: imp.x, y: imp.y };
    run(state, data, 10);
    // 1 s: nunca más de la velocidad de paseo.
    expect(Math.hypot(imp.x - start.x, imp.y - start.y)).toBeLessThanOrEqual(
      rules.imp.base.speed * data.global.imps.loaf.speedFactor + 1e-6,
    );
    // Al llegar descansa antes del siguiente paseo.
    run(state, data, 400);
    const visited = new Set<number>();
    for (let n = 0; n < 600; n++) {
      run(state, data, 1);
      visited.add(Math.floor(imp.x) * 100 + Math.floor(imp.y));
    }
    expect(visited.size).toBeGreaterThan(1);
    expect(state.owner[Math.floor(imp.y) * 64 + Math.floor(imp.x)]).toBe(1);
  });

  it('paseando coge el trabajo en cuanto aparece (no se comporta como holgazán)', () => {
    const { state, data, imp } = lazyWorld(0);
    run(state, data, 20);
    expect(imp.goal).toBe('loaf');
    send(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] });
    run(state, data, 2);
    expect(imp.goal === 'task' || imp.taskId !== 0).toBe(true);
  });

  it('con radio de paseo 0 se queda quieto (así lo desactivan las pruebas que lo necesitan)', () => {
    const { state, data, imp } = lazyWorld(0);
    data.economy.wanderRadius = 0;
    const start = { x: imp.x, y: imp.y };
    run(state, data, 300);
    expect([imp.x, imp.y]).toEqual([start.x, start.y]);
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
