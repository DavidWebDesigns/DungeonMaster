/**
 * PUERTA 1 (docs/PLAN.md, sección 8): pruebas que demuestran que el núcleo de la simulación funciona.
 *  - Un Imp excava, reclama y lleva oro.
 *  - Construir sin oro devuelve NO_GOLD.
 *  - La Tesorería llena detiene la minería.
 *  - Misma semilla + mismos comandos = mismo hash tras 6.000 ticks.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { createMatch } from './createMatch';
import { carriedGold, treasuryCapacity } from './economy';
import { tileIndex } from './grid';
import { hashState } from './hashState';
import { nextFloat, nextInt, seedToState } from './rng';
import { replay } from './replay';
import { rulesOf } from './rules';
import { step } from './step';
import { loadData, matchAtCorner0, pt, row, run, send, terrainId } from './testUtils';
import type { Command, CommandRecord, MatchState } from './types';
import type { DataSet } from '../data';

describe('Puerta 1: un Imp excava, reclama y lleva oro', () => {
  it('excava hasta la veta, la mina, lleva el oro a la Tesorería y el territorio crece', () => {
    const { state, data } = matchAtCorner0();
    const goldBefore = state.players[0]!.gold;
    send(state, data, 1, { type: 'dig', tiles: [...row(4, 11, 13), pt(14, 4)] });
    run(state, data, 1200);
    expect(['neutralFloor', 'claimedFloor']).toContain(terrainId(state, data, 12, 4));
    expect(terrainId(state, data, 14, 4)).not.toBe('goldVein');
    expect(state.players[0]!.gold).toBeCloseTo(goldBefore + 600, 3);
    expect(state.owner[tileIndex(state, 12, 4)]).toBe(1);
    expect(terrainId(state, data, 12, 4)).toBe('claimedFloor');
  });
});

describe('Puerta 1: construir sin oro', () => {
  it('devuelve NO_GOLD y no cambia nada', () => {
    const { state, data } = matchAtCorner0();
    state.players[0]!.gold = 0;
    const res = applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 6, y: 2, w: 2, h: 2 },
    });
    expect(res).toEqual({ ok: false, error: 'NO_GOLD' });
    step(state, data);
    expect(state.rooms.some((r) => r.type === 'lair')).toBe(false);
    expect(state.players[0]!.gold).toBe(0);
  });
});

describe('Puerta 1: Tesorería llena', () => {
  it('detiene la minería', () => {
    const { state, data } = matchAtCorner0();
    const rules = rulesOf(data);
    send(state, data, 1, { type: 'dig', tiles: [...row(4, 11, 13), pt(14, 4)] });
    state.players[0]!.gold = treasuryCapacity(state, rules, 1);
    run(state, data, 1500);
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBe(600);
    expect(carriedGold(state, 1)).toBe(0);
  });
});

/* ---------- Determinismo ---------- */

/** Bot de pruebas con su propio generador: manda de todo, también comandos inválidos. */
function botCommands(
  state: MatchState,
  data: DataSet,
  bot: { rng: number },
): Array<[number, Command]> {
  const out: Array<[number, Command]> = [];
  for (const p of state.players) {
    if (nextFloat(bot) > 0.35) continue;
    const base = data.map.bases.find((b) => b.slot === p.slot)!;
    const c = base.claimed;
    const around = (r: number) => ({
      x: Math.max(0, Math.min(63, c.x + nextInt(bot, c.w + 2 * r) - r)),
      y: Math.max(0, Math.min(63, c.y + nextInt(bot, c.h + 2 * r) - r)),
    });
    const line = (r: number) => {
      const a = around(r);
      const horizontal = nextFloat(bot) < 0.5;
      const len = 1 + nextInt(bot, 8);
      return Array.from({ length: len }, (_, k) =>
        pt(Math.min(63, a.x + (horizontal ? k : 0)), Math.min(63, a.y + (horizontal ? 0 : k))),
      );
    };
    const roll = nextInt(bot, 10);
    if (roll <= 2) out.push([p.id, { type: 'dig', tiles: line(18) }]);
    else if (roll === 3) out.push([p.id, { type: 'claim', tiles: line(6) }]);
    else if (roll === 4) out.push([p.id, { type: 'reinforce', tiles: line(4) }]);
    else if (roll === 5) {
      const room = ['lair', 'hatchery', 'treasury', 'trainingRoom', 'library'][nextInt(bot, 5)]!;
      const o = around(0);
      out.push([
        p.id,
        {
          type: 'buildRoom',
          room,
          rect: { x: o.x, y: o.y, w: 2 + nextInt(bot, 3), h: 2 + nextInt(bot, 3) },
        },
      ]);
    } else if (roll === 6) out.push([p.id, { type: 'sellRoom', tile: around(0) }]);
    else if (roll === 7)
      out.push([p.id, { type: 'castSpell', spell: 'createImp', target: around(0) }]);
    else if (roll === 8) out.push([p.id, { type: 'cancelDig', tiles: line(18) }]);
    else out.push([p.id, { type: 'dig', tiles: line(30) }]);
  }
  return out;
}

function checkInvariants(state: MatchState, data: DataSet): void {
  const rules = rulesOf(data);
  for (const p of state.players) {
    expect(p.gold).toBeGreaterThanOrEqual(-1e-6);
    expect(p.gold + carriedGold(state, p.id)).toBeLessThanOrEqual(
      treasuryCapacity(state, rules, p.id) + 1e-6,
    );
    expect(p.mana).toBeLessThanOrEqual(data.global.mana.max);
    expect(p.mana).toBeGreaterThanOrEqual(0);
    expect(state.imps.filter((i) => i.owner === p.id).length).toBeLessThanOrEqual(
      data.global.imps.max,
    );
  }
  for (const imp of state.imps) {
    expect(Number.isFinite(imp.x) && Number.isFinite(imp.y) && Number.isFinite(imp.carry)).toBe(
      true,
    );
    const t = tileIndex(state, Math.floor(imp.x), Math.floor(imp.y));
    expect(rules.walkable[state.terrain[t] as number]).toBe(true);
    expect(imp.carry).toBeLessThanOrEqual(data.economy.impCarryGold + 1e-6);
  }
  const ids = state.imps.map((i) => i.id);
  expect(ids).toEqual([...ids].sort((a, b) => a - b));
  for (const t of state.tasks) {
    if (t.reservedBy !== 0) {
      const imp = state.imps.find((i) => i.id === t.reservedBy);
      expect(imp?.taskId).toBe(t.id);
    }
  }
  for (const r of state.rooms) for (const tile of r.tiles) expect(state.roomAt[tile]).toBe(r.id);
}

function playBots(
  data: DataSet,
  seed: number,
  botSeed: number,
  ticks: number,
  checkpoints: number[] = [],
) {
  const state = createMatch({ playerCount: 4 }, data, seed);
  const bot = { rng: seedToState(botSeed) };
  const hashes: Record<number, string> = {};
  let stepMs = 0;
  for (let n = 0; n < ticks; n++) {
    for (const [pid, cmd] of botCommands(state, data, bot)) applyCommand(state, data, pid, cmd);
    const t0 = performance.now();
    step(state, data);
    stepMs += performance.now() - t0;
    if (n % 100 === 0) checkInvariants(state, data);
    if (checkpoints.includes(state.tick)) hashes[state.tick] = hashState(state);
  }
  return { state, hashes, avgStepMs: stepMs / ticks };
}

describe('Puerta 1: determinismo', () => {
  const data = loadData();
  const TICKS = 6000;
  const checkpoints = [1000, 2000, 3000, 4000, 5000, 6000];

  it('misma semilla + mismos comandos = mismo hash tras 6.000 ticks (y en cada punto intermedio)', () => {
    const a = playBots(data, 1234, 77, TICKS, checkpoints);
    const b = playBots(data, 1234, 77, TICKS, checkpoints);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(b.hashes).toEqual(a.hashes);
    // La partida hizo cosas: no es un hash trivial.
    expect(a.state.log.length).toBeGreaterThan(1000);
    // 12 salas iniciales (Corazón, Portal y Tesorería por jugador): el bot construyó alguna más.
    expect(a.state.nextRoomId).toBeGreaterThan(12 + 1);
    expect(a.state.mapVersion).toBeGreaterThan(100);
  });

  it('reproducir el registro de comandos da el mismo hash final', () => {
    const a = playBots(data, 99, 5, TICKS);
    const log: CommandRecord[] = JSON.parse(JSON.stringify(a.state.log));
    const again = replay({ playerCount: 4 }, data, 99, log, TICKS);
    expect(hashState(again)).toBe(hashState(a.state));
  });

  it('otra semilla de partida o otros comandos dan otro hash', () => {
    const a = playBots(data, 1234, 77, 1500);
    expect(hashState(playBots(data, 4321, 77, 1500).state)).not.toBe(hashState(a.state));
    expect(hashState(playBots(data, 1234, 78, 1500).state)).not.toBe(hashState(a.state));
  });

  it('el hash no depende del orden de las claves ni de pasar por JSON', () => {
    const { state } = playBots(data, 7, 7, 800);
    expect(hashState(JSON.parse(JSON.stringify(state)))).toBe(hashState(state));
  });

  it('el tick es rápido (objetivo: menos de 30 ms con 4 jugadores)', () => {
    const { avgStepMs } = playBots(data, 5, 5, 1500);
    expect(avgStepMs).toBeLessThan(30);
  });
});
