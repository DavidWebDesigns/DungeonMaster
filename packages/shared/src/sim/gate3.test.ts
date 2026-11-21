/**
 * PUERTA 3 (docs/PLAN.md, sección 8): criaturas vivas.
 *  - Una criatura sin cama baja de banda de ánimo.
 *  - Sin oro en día de pago se enfada.
 *  - Furiosa 30 s se va.
 *  - Entrenando sube a nivel 4 y se detiene.
 *  - Una mazmorra vive sola 10 minutos sin intervención, sin errores y de forma determinista.
 * Las tres primeras y la cuarta se prueban en creatures.test.ts; aquí está la partida larga.
 */
import { describe, expect, it } from 'vitest';
import type { DataSet } from '../data';
import { applyCommand } from './applyCommand';
import { createMatch } from './createMatch';
import { creatureMaxHp } from './creatureStats';
import { tileIndex } from './grid';
import { hashState } from './hashState';
import { replay } from './replay';
import { rulesOf } from './rules';
import { step } from './step';
import { loadData, pt, row, seedWithPlayer1At } from './testUtils';
import type { Command, MatchState, SimEvent } from './types';

const TEN_MINUTES = 6000;

/** Solo comandos: construir las tres salas (de 4 tiles: con el precio incremental, 4.025 de los 5.000 iniciales) y excavar hasta las vetas para tener ingresos. */
const SCRIPT: Command[] = [
  { type: 'buildRoom', room: 'lair', rect: { x: 5, y: 2, w: 2, h: 2 } },
  { type: 'buildRoom', room: 'hatchery', rect: { x: 2, y: 5, w: 2, h: 2 } },
  { type: 'buildRoom', room: 'trainingRoom', rect: { x: 2, y: 8, w: 2, h: 2 } },
  { type: 'dig', tiles: [...row(4, 11, 16), ...row(5, 14, 16)] },
];

function startMatch(data: DataSet, seed: number): MatchState {
  const state = createMatch({ playerCount: 2 }, data, seed);
  for (const cmd of SCRIPT) {
    const res = applyCommand(state, data, 1, cmd);
    if (!res.ok) throw new Error(`${cmd.type}: ${res.error}`);
  }
  return state;
}

function checkInvariants(state: MatchState, data: DataSet): void {
  const rules = rulesOf(data);
  const beds = new Set<number>();
  for (const c of state.creatures) {
    expect(
      Number.isFinite(c.x) &&
        Number.isFinite(c.y) &&
        Number.isFinite(c.hp) &&
        Number.isFinite(c.mood),
    ).toBe(true);
    expect(c.hp).toBeGreaterThan(0);
    expect(c.hp).toBeLessThanOrEqual(creatureMaxHp(rules, c) + 1e-6);
    expect(c.mood).toBeGreaterThanOrEqual(0);
    expect(c.mood).toBeLessThanOrEqual(100);
    expect(c.hunger).toBeGreaterThanOrEqual(0);
    expect(c.hunger).toBeLessThanOrEqual(100);
    expect(c.sleep).toBeLessThanOrEqual(100);
    expect(c.level).toBeGreaterThanOrEqual(1);
    expect(c.level).toBeLessThanOrEqual(data.progression.maxLevel);
    expect(
      rules.walkable[state.terrain[tileIndex(state, Math.floor(c.x), Math.floor(c.y))] as number],
    ).toBe(true);
    for (const b of c.beds) {
      expect(beds.has(b), 'dos criaturas comparten cama').toBe(false);
      beds.add(b);
      const room = state.rooms.find((r) => r.id === state.roomAt[b]);
      expect(room?.type).toBe('lair');
      expect(room?.owner).toBe(c.owner);
    }
  }
  const ids = state.creatures.map((c) => c.id);
  expect(ids).toEqual([...ids].sort((a, b) => a - b));
  for (const p of state.players) {
    const own = state.creatures.filter((c) => c.owner === p.id).length;
    expect(own).toBeLessThanOrEqual(data.global.maxCreaturesPerPlayer);
    expect(own).toBeLessThanOrEqual(data.global.portal.reservePerPortal);
    expect(p.gold).toBeGreaterThanOrEqual(-1e-6);
  }
}

function live(data: DataSet, seed: number) {
  const state = startMatch(data, seed);
  const events: SimEvent[] = [];
  for (let n = 0; n < TEN_MINUTES; n++) {
    events.push(...step(state, data));
    if (n % 50 === 0) checkInvariants(state, data);
  }
  return { state, events };
}

describe('Puerta 3: una mazmorra con vida propia durante 10 minutos', () => {
  const data = loadData();
  // Las tres salas juntas cuestan más que el oro inicial desde que la Sala de entrenamiento cuesta 300 por tile.
  data.global.startingGold = 6000;
  const SLOW = 120_000;

  it(
    'llegan criaturas, comen, duermen, cobran y entrenan sin intervención y sin romper ninguna regla',
    () => {
      const seed = seedWithPlayer1At({ playerCount: 2 }, data, 0);
      const { state, events } = live(data, seed);
      const count = (t: SimEvent['type']) =>
        events.filter((e) => e.type === t && (e as { playerId?: number }).playerId !== 2).length;
      expect(count('creatureArrived')).toBeGreaterThanOrEqual(3);
      expect(events.filter((e) => e.type === 'payday')).toHaveLength(4); // ticks 1200, 2400, 3600 y 4800
      expect(count('paid')).toBeGreaterThan(0);
      expect(count('levelUp')).toBeGreaterThan(0);
      expect(state.tick).toBe(TEN_MINUTES);
      // Vive alguna criatura del jugador 1 al final, o ha habido un motivo registrado (se fue o murió).
      const mine = state.creatures.filter((c) => c.owner === 1).length;
      expect(mine + count('creatureLeft') + count('creatureDied')).toBeGreaterThanOrEqual(
        count('creatureArrived'),
      );
    },
    SLOW,
  );

  it(
    'misma semilla y mismos comandos dan el mismo hash a los 10 minutos, y también al reproducir el registro',
    () => {
      const seed = seedWithPlayer1At({ playerCount: 2 }, data, 0);
      const a = live(data, seed).state;
      const b = live(data, seed).state;
      expect(hashState(a)).toBe(hashState(b));
      const log = JSON.parse(JSON.stringify(a.log));
      // `startMatch` aplica los comandos en el tick 0 antes de avanzar: el registro los tiene en el tick 0.
      expect(log.length).toBe(SCRIPT.length);
      const again = replay({ playerCount: 2 }, data, seed, log, TEN_MINUTES);
      expect(hashState(again)).toBe(hashState(a));
      expect(hashState(JSON.parse(JSON.stringify(a)))).toBe(hashState(a));
    },
    SLOW,
  );

  it('con otra semilla la mazmorra evoluciona distinto', () => {
    const s1 = seedWithPlayer1At({ playerCount: 2 }, data, 0);
    const a = startMatch(data, s1);
    const b = startMatch(data, s1 + 1);
    for (let i = 0; i < 1500; i++) {
      step(a, data);
      step(b, data);
    }
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('los Imps siguen minando mientras viven las criaturas', () => {
    const seed = seedWithPlayer1At({ playerCount: 2 }, data, 0);
    const { state } = live(data, seed);
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBe(0);
    expect(pt(14, 4)).toBeDefined();
  });
});
