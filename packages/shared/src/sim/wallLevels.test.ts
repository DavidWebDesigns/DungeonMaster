import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { tileIndex } from './grid';
import { rulesOf } from './rules';
import { step } from './step';
import { canDig, canReinforce, reinforceLevelOf, taskSeconds } from './tasks';
import type { Command } from './types';
import { duel, extendTerritory, pt, run, terrainId } from './testUtils';

/** Muro de tierra pegado a la base del jugador 1 en (11,4); el territorio libre 2..10 × 11..19 sirve para salas. */
function world() {
  const { state, data } = duel();
  extendTerritory(state, data);
  state.players[0]!.gold = 9000;
  return { state, data, rules: rulesOf(data) };
}
const WALL = pt(11, 4);

/** Un muro de nivel 1 que ya es del jugador 1. */
function withLevel1Wall(m: ReturnType<typeof world>) {
  const i = tileIndex(m.state, WALL.x, WALL.y);
  m.state.terrain[i] = m.data.terrain.findIndex((t) => t.id === 'reinforcedWall');
  m.state.owner[i] = 1;
  m.state.mapVersion++;
}

/** Taller con `tiles` tiles en fila (necesita antes la Sala de entrenamiento). */
function withWorkshop(m: ReturnType<typeof world>, tiles: number) {
  m.state.players[0]!.gold = 90000;
  for (const [room, rect] of [
    ['trainingRoom', { x: 2, y: 11, w: 1, h: 1 }],
    // 10 tiles = 5×2; 9 tiles = 3×3 (todo dentro del territorio libre).
    ['workshop', tiles === 10 ? { x: 2, y: 14, w: 5, h: 2 } : { x: 2, y: 14, w: 3, h: 3 }],
  ] as const) {
    const res = applyCommand(m.state, m.data, 1, { type: 'buildRoom', room, rect });
    expect(res.ok, `${room}`).toBe(true);
    step(m.state, m.data);
  }
  m.state.players[0]!.gold = 5000;
}

describe('muros reforzados de nivel 1 y 2', () => {
  it('tierra → nivel 1 (sin requisito); nivel 1 → nivel 2 (pide Taller de nivel 10)', () => {
    const m = world();
    const i = tileIndex(m.state, WALL.x, WALL.y);
    expect(reinforceLevelOf(m.rules, i, m.state)).toBe(1);
    withLevel1Wall(m);
    expect(reinforceLevelOf(m.rules, i, m.state)).toBe(2);
    expect(canReinforce(m.state, m.rules, i, 1, 2)).toBe(false); // sin Taller
    withWorkshop(m, 10);
    expect(canReinforce(m.state, m.rules, i, 1, 2)).toBe(true);
    expect(canReinforce(m.state, m.rules, i, 1, 1)).toBe(false); // el nivel 1 ya está hecho
  });

  it('el comando exige el Taller de nivel 10 (REQUIRES_ROOM) y con 9 tiles tampoco vale', () => {
    const m = world();
    withLevel1Wall(m);
    const cmd: Command = { type: 'reinforce', tiles: [WALL], level: 2 };
    expect(applyCommand(m.state, m.data, 1, cmd)).toEqual({ ok: false, error: 'REQUIRES_ROOM' });
    withWorkshop(m, 9);
    expect(applyCommand(m.state, m.data, 1, cmd)).toEqual({ ok: false, error: 'REQUIRES_ROOM' });
  });

  it('con un Taller de nivel 10 un Imp lo mejora en 8 s y el muro pasa a nivel 2 con el mismo dueño', () => {
    const m = world();
    withLevel1Wall(m);
    withWorkshop(m, 10);
    expect(
      applyCommand(m.state, m.data, 1, { type: 'reinforce', tiles: [WALL], level: 2 }),
    ).toEqual({
      ok: true,
      accepted: 1,
    });
    step(m.state, m.data); // los comandos se ejecutan al avanzar el tick
    const task = m.state.tasks.find((t) => t.kind === 'reinforce')!;
    expect(taskSeconds(m.state, m.rules, task)).toBe(8);
    run(m.state, m.data, 400);
    expect(terrainId(m.state, m.data, WALL.x, WALL.y)).toBe('reinforcedWall2');
    expect(m.state.owner[tileIndex(m.state, WALL.x, WALL.y)]).toBe(1);
  });

  it('no se salta niveles: tierra con level 2 es INVALID_TARGET; level 0, 1,5 o texto son INVALID_COMMAND', () => {
    const m = world();
    expect(
      applyCommand(m.state, m.data, 1, { type: 'reinforce', tiles: [WALL], level: 2 }),
    ).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    for (const level of [0, 1.5, -1, NaN, '2'])
      expect(
        applyCommand(m.state, m.data, 1, { type: 'reinforce', tiles: [WALL], level } as never),
      ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    // Sin level = nivel 1: tierra sí.
    expect(applyCommand(m.state, m.data, 1, { type: 'reinforce', tiles: [WALL] }).ok).toBe(true);
  });

  it('vender el Taller cancela la mejora pendiente', () => {
    const m = world();
    withLevel1Wall(m);
    withWorkshop(m, 10);
    applyCommand(m.state, m.data, 1, { type: 'reinforce', tiles: [WALL], level: 2 });
    step(m.state, m.data);
    expect(m.state.tasks.some((t) => t.kind === 'reinforce')).toBe(true);
    applyCommand(m.state, m.data, 1, { type: 'sellRoom', tile: pt(2, 14) });
    run(m.state, m.data, 5);
    expect(m.state.tasks.some((t) => t.kind === 'reinforce')).toBe(false);
  });

  it('los muros ajenos de nivel 1 y 2 se excavan, pero despacio: 12 s y 30 s', () => {
    const m = world();
    const i = tileIndex(m.state, WALL.x, WALL.y);
    for (const [id, secs] of [
      ['reinforcedWall', 12],
      ['reinforcedWall2', 30],
    ] as const) {
      m.state.terrain[i] = m.data.terrain.findIndex((t) => t.id === id);
      m.state.owner[i] = 1;
      expect(canDig(m.state, m.rules, i, 2)).toBe(true);
      expect(m.rules.terrain[m.state.terrain[i] as number]!.digSeconds).toBe(secs);
    }
  });

  it('un Imp rival derriba el muro, queda suelo neutral y el dueño recibe wallBreached', () => {
    const m = world();
    withLevel1Wall(m);
    for (const imp of m.state.imps.filter((k) => k.owner === 2)) {
      imp.x = 10.5;
      imp.y = 4.5;
    }
    expect(applyCommand(m.state, m.data, 2, { type: 'dig', tiles: [WALL] }).ok).toBe(true);
    const events = run(m.state, m.data, 300);
    // Ya no es un muro (un Imp ocioso puede reclamar enseguida el suelo que queda).
    expect(['neutralFloor', 'claimedFloor']).toContain(terrainId(m.state, m.data, WALL.x, WALL.y));
    expect(events.filter((e) => e.type === 'wallBreached')).toEqual([
      { type: 'wallBreached', playerId: 1, tile: tileIndex(m.state, WALL.x, WALL.y) },
    ]);
  });

  it('cavar tu propio muro no avisa a nadie', () => {
    const m = world();
    withLevel1Wall(m);
    applyCommand(m.state, m.data, 1, { type: 'dig', tiles: [WALL] });
    const events = run(m.state, m.data, 400);
    expect(events.some((e) => e.type === 'wallBreached')).toBe(false);
  });
});
