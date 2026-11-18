import type { DataSet } from '../data';
import { applyCommand } from './applyCommand';
import { createMatch, type MatchConfig } from './createMatch';
import { step } from './step';
import type { CommandRecord, MatchState } from './types';

/** Reproduce una partida desde su semilla y su registro de comandos durante `ticks` ticks. */
export function replay(
  config: MatchConfig,
  data: DataSet,
  seed: number,
  log: readonly CommandRecord[],
  ticks: number,
): MatchState {
  const state = createMatch(config, data, seed);
  let next = 0;
  while (state.tick < ticks) {
    while (next < log.length && (log[next] as CommandRecord).tick === state.tick) {
      const rec = log[next] as CommandRecord;
      applyCommand(state, data, rec.playerId, rec.cmd);
      next++;
    }
    step(state, data);
  }
  return state;
}
