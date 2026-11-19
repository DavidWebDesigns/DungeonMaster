import type { MatchStats, PlayerId, PlayerStats } from '@dm/shared';

export type EndStatsRow = { id: PlayerId; nick: string } & PlayerStats;

/** Filas de la pantalla de fin para una partida local: el jugador es "Tú" y los demás "Bot 1", "Bot 2"... */
export function localStatsRows(stats: MatchStats, me: PlayerId): EndStatsRow[] {
  const rows: EndStatsRow[] = [];
  let bot = 0;
  for (const [id, s] of [...stats.entries()].sort((a, b) => a[0] - b[0])) {
    rows.push({
      id,
      nick: id === me ? 'Tú' : `Bot ${++bot}`,
      ...s,
      goldMined: Math.round(s.goldMined),
      heartDamage: Math.round(s.heartDamage),
    });
  }
  return rows;
}
