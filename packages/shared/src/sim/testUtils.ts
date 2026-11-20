/** Utilidades solo para pruebas de la simulación. */
import { parseDataSet, type DataSet } from '../data';
import { realRawData } from '../data/testUtils';
import { applyCommand } from './applyCommand';
import { createMatch, type MatchConfig } from './createMatch';
import { tileIndex } from './grid';
import { step } from './step';
import { newCreature } from './portal';
import { rulesOf } from './rules';
import type { Command, CommandResult, Creature, MatchState, PlayerId } from './types';

export function loadData(): DataSet {
  const r = parseDataSet(realRawData());
  if (!r.ok) throw new Error(JSON.stringify(r.errors, null, 2));
  return r.data;
}

export const pt = (x: number, y: number) => ({ x, y });

/** Línea horizontal de tiles. */
export function row(y: number, x0: number, x1: number) {
  const out = [];
  for (let x = x0; x <= x1; x++) out.push(pt(x, y));
  return out;
}

/** Busca una semilla con la que el jugador 1 ocupe la esquina pedida (la geometría de la esquina 0 es conocida). */
export function seedWithPlayer1At(config: MatchConfig, data: DataSet, slot: number): number {
  for (let seed = 1; seed < 500; seed++) {
    if (createMatch(config, data, seed).players[0]?.slot === slot) return seed;
  }
  throw new Error('no se encontró semilla');
}

/** Partida de 2 jugadores con el jugador 1 en la esquina 0 (zona 2..10, vetas en (14..16, 4..5)). */
export function matchAtCorner0(playerCount = 2): { state: MatchState; data: DataSet } {
  const data = loadData();
  const config = { playerCount };
  return { state: createMatch(config, data, seedWithPlayer1At(config, data, 0)), data };
}

export function run(state: MatchState, data: DataSet, ticks: number) {
  const events = [];
  for (let i = 0; i < ticks; i++) events.push(...step(state, data));
  return events;
}

/** Envía un comando y avanza un tick para que se ejecute. */
export function send(state: MatchState, data: DataSet, pid: PlayerId, cmd: Command): CommandResult {
  const res = applyCommand(state, data, pid, cmd);
  step(state, data);
  return res;
}

export const terrainId = (state: MatchState, data: DataSet, x: number, y: number) =>
  data.terrain[state.terrain[tileIndex(state, x, y)] as number]?.id;

/** Amplía el territorio del jugador 1 (esquina 0) con suelo propio libre en x 2..10, y 11..19, para construir salas. */
export function extendTerritory(state: MatchState, data: DataSet): void {
  const claimed = data.terrain.findIndex((t) => t.id === 'claimedFloor');
  for (let y = 11; y < 20; y++) {
    for (let x = 2; x < 11; x++) {
      state.terrain[y * state.width + x] = claimed;
      state.owner[y * state.width + x] = 1;
    }
  }
  state.mapVersion++;
}

export const ROOM_SPOTS = {
  lair: { x: 2, y: 11, w: 4, h: 2 },
  hatchery: { x: 6, y: 11, w: 3, h: 3 },
  trainingRoom: { x: 2, y: 14, w: 3, h: 3 },
  library: { x: 5, y: 14, w: 3, h: 3 },
  tortureChamber: { x: 8, y: 14, w: 3, h: 3 },
  workshop: { x: 2, y: 17, w: 3, h: 3 },
  graveyard: { x: 5, y: 17, w: 3, h: 3 },
  temple: { x: 8, y: 17, w: 3, h: 3 },
} as const;

/** Construye salas (por tipo) en sitios fijos con oro de sobra; deja la partida lista para criaturas. */
export function buildRooms(
  state: MatchState,
  data: DataSet,
  types: ReadonlyArray<keyof typeof ROOM_SPOTS>,
  gold = 50000,
): void {
  extendTerritory(state, data);
  state.players[0]!.gold = gold;
  for (const t of types) {
    const res = applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: t,
      rect: { ...ROOM_SPOTS[t] },
    });
    if (!res.ok) throw new Error(`no se pudo construir ${t}: ${res.error}`);
    step(state, data);
  }
}

/** Partida de 2 jugadores (jugador 1 en la esquina 0, jugador 2 en la 2) sin llegadas por el Portal. */
export function duel(): { state: MatchState; data: DataSet } {
  const m = matchAtCorner0(2);
  m.data.global.portal.attractIntervalSeconds = 100000;
  return m;
}

/** Añade una criatura ya hecha en una posición (en tiles, con decimales). */
export function spawn(
  state: MatchState,
  data: DataSet,
  owner: number,
  type: string,
  x: number,
  y: number,
  patch: Partial<Creature> = {},
): Creature {
  const c = newCreature(
    state,
    rulesOf(data),
    owner,
    type,
    Math.floor(y) * state.width + Math.floor(x),
  );
  c.x = x;
  c.y = y;
  Object.assign(c, patch);
  state.creatures.push(c);
  return c;
}

/** Rectángulo de una sala inicial del jugador de la esquina dada (heart, portal o treasury). */
export function baseRoom(data: DataSet, slot: number, type: 'heart' | 'portal' | 'treasury') {
  const base = data.map.bases.find((b) => b.slot === slot)!;
  return type === 'heart' ? base.heart : base.rooms.find((r) => r.type === type)!.rect;
}
