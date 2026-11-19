/**
 * Partidas completas de bots, sin gráficos: sirven para `pnpm sim`, el informe de balance y las pruebas.
 */
import type { DataSet } from '../data';
import { applyCommand } from '../sim/applyCommand';
import { createMatch } from '../sim/createMatch';
import { step } from '../sim/step';
import type { MatchState, SimEvent } from '../sim/types';
import { createBot, type BotOptions } from './bot';

export interface BotMatchOptions {
  players: number;
  seed: number;
  /** Tope de ticks (por defecto, la duración máxima de la partida). */
  maxTicks?: number;
  bot?: BotOptions;
  /** Se llama con los eventos de cada tick (para estadísticas). */
  onEvents?: (events: SimEvent[], state: MatchState) => void;
  /** Se llama cada `sampleEvery` ticks con el estado (para muestrear oro, criaturas...). */
  sampleEvery?: number;
  onSample?: (state: MatchState) => void;
}

export interface BotMatchResult {
  state: MatchState;
  ticks: number;
  /** Comandos que el bot mandó y la simulación rechazó (por código). */
  rejected: Record<string, number>;
  commands: number;
}

/** Juega una partida hasta que termina o se acaba el tiempo. Los bots solo usan `applyCommand`. */
export function playBotMatch(data: DataSet, opts: BotMatchOptions): BotMatchResult {
  const state = createMatch({ playerCount: opts.players }, data, opts.seed);
  const bots = state.players.map((p) =>
    createBot(p.id, opts.seed * 7919 + p.id * 104729, opts.bot),
  );
  const limit =
    opts.maxTicks ?? Math.round(data.global.match.maxMinutes * 60 * data.global.tickRate) + 5;
  const rejected: Record<string, number> = {};
  let commands = 0;
  while (state.status === 'playing' && state.tick < limit) {
    for (const bot of bots) {
      for (const cmd of bot.act(state, data)) {
        commands++;
        const res = applyCommand(state, data, bot.playerId, cmd);
        if (!res.ok) rejected[res.error] = (rejected[res.error] ?? 0) + 1;
      }
    }
    const events = step(state, data);
    opts.onEvents?.(events, state);
    if (opts.sampleEvery && opts.onSample && state.tick % opts.sampleEvery === 0)
      opts.onSample(state);
  }
  return { state, ticks: state.tick, rejected, commands };
}
