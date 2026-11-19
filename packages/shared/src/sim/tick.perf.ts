/**
 * Criterio de aceptación 6.14: el tick tarda menos de 30 ms con 4 jugadores y unas 800 entidades.
 * Mide tiempo real: se ejecuta con `pnpm perf` (no en `pnpm check`, porque en paralelo con otras pruebas sale inestable).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { createMatch } from './createMatch';
import { step } from './step';
import { newCreature } from './portal';
import { rulesOf } from './rules';
import { loadData } from './testUtils';
import { ClientKnowledge, computeDelta } from '../net/view';

describe('rendimiento del tick', () => {
  it('con 4 jugadores y ~800 entidades (criaturas e Imps) cada tick cuesta mucho menos de 30 ms', () => {
    const data = loadData();
    data.global.portal.attractIntervalSeconds = 100000;
    const state = createMatch({ playerCount: 4 }, data, 7);
    const rules = rulesOf(data);
    const walk: number[] = [];
    for (let i = 0; i < state.terrain.length; i++)
      if (rules.walkable[state.terrain[i] as number]) walk.push(i);
    // 200 criaturas por jugador (40 000 de oro de sueldos aparte: solo importa el coste de simular).
    const types = ['goblin', 'troll', 'warlock', 'bileDemon', 'executioner', 'torturer'];
    for (const p of state.players) {
      const own = walk.filter((t) => state.owner[t] === p.id);
      for (let n = 0; n < 196; n++) {
        const c = newCreature(
          state,
          rules,
          p.id,
          types[n % types.length]!,
          own[(n * 7) % own.length]!,
        );
        state.creatures.push(c);
      }
      // Hasta 12 Imps: los que ya hay más 4.
      for (let k = 0; k < 2; k++)
        applyCommand(state, data, p.id, { type: 'dig', tiles: [{ x: 1, y: 1 }] });
    }
    const entities = state.creatures.length + state.imps.length;
    expect(entities).toBeGreaterThanOrEqual(780);
    // Calentamiento y medición.
    for (let i = 0; i < 20; i++) step(state, data);
    const times: number[] = [];
    for (let i = 0; i < 150; i++) {
      const t0 = performance.now();
      step(state, data);
      times.push(performance.now() - t0);
    }
    // Coste de preparar el delta de cada jugador (lo que hace el servidor tras cada tick).
    const known = state.players.map(() => new ClientKnowledge(state.width * state.height));
    const deltaTimes: number[] = [];
    for (let i = 0; i < 60; i++) {
      step(state, data);
      const t0 = performance.now();
      state.players.forEach((p, n) => computeDelta(state, data, p.id, known[n]!));
      deltaTimes.push(performance.now() - t0);
    }
    const deltaAvg = deltaTimes.reduce((a, b) => a + b, 0) / deltaTimes.length;
    console.log(`deltas de los 4 jugadores: ${deltaAvg.toFixed(2)} ms por tick`);
    expect(deltaAvg).toBeLessThan(20);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const worst = Math.max(...times);
    console.log(
      `${entities} entidades: tick medio ${avg.toFixed(2)} ms, peor ${worst.toFixed(2)} ms`,
    );
    expect(avg).toBeLessThan(30);
    expect(worst).toBeLessThan(100);
  }, 120_000);
});
