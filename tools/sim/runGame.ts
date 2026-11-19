import { playBotMatch, type DataSet } from '@dm/shared';
import type { GameRecord } from './stats';

/** Juega una partida de bots y devuelve su registro (si lanza una excepción, queda anotada). */
export function runGame(data: DataSet, seed: number, players: number): GameRecord {
  const t0 = performance.now();
  let goldMined = 0;
  let at10: number[] | undefined;
  let at20: number[] | undefined;
  const eliminations: Array<{ id: number; slot: number; tick: number }> = [];
  try {
    const r = playBotMatch(data, {
      players,
      seed,
      sampleEvery: 6000,
      onEvents: (events, s) => {
        for (const e of events) {
          if (e.type === 'goldDeposited') goldMined += e.amount;
          if (e.type === 'eliminated') {
            const slot = s.players.find((p) => p.id === e.playerId)?.slot ?? -1;
            eliminations.push({ id: e.playerId, slot, tick: s.tick });
          }
        }
      },
      onSample: (s) => {
        const counts = s.players.map((p) => s.creatures.filter((c) => c.owner === p.id).length);
        if (s.tick === 6000) at10 = counts;
        if (s.tick === 12000) at20 = counts;
      },
    });
    const slots: Record<number, number> = {};
    for (const p of r.state.players) slots[p.id] = p.slot;
    return {
      seed,
      players,
      ticks: r.ticks,
      winners: r.state.result?.winners ?? [],
      reason: r.state.result?.reason ?? 'unfinished',
      slots,
      rejected: r.rejected,
      commands: r.commands,
      ms: performance.now() - t0,
      goldMined,
      creaturesAt10: at10,
      creaturesAt20: at20,
      eliminations,
    };
  } catch (e) {
    return {
      seed,
      players,
      ticks: 0,
      winners: [],
      reason: 'error',
      slots: {},
      rejected: {},
      commands: 0,
      ms: performance.now() - t0,
      goldMined,
      error: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e),
    };
  }
}
