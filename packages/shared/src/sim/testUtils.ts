/** Utilidades solo para pruebas de la simulación. */
import { parseDataSet, type DataSet } from '../data';
import { realRawData } from '../data/testUtils';
import { applyCommand } from './applyCommand';
import { createMatch, type MatchConfig } from './createMatch';
import { tileIndex } from './grid';
import { step } from './step';
import type { Command, CommandResult, MatchState, PlayerId } from './types';

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
