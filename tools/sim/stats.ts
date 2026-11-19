/** Registro de una partida de bots y su resumen. Puro y probado. */
export interface GameRecord {
  seed: number;
  players: number;
  ticks: number;
  /** Jugadores ganadores (varios si hay empate); vacío si la partida no terminó. */
  winners: number[];
  reason: string;
  /** Esquina (slot del mapa) de cada jugador, por id. */
  slots: Record<number, number>;
  /** Comandos que la simulación rechazó, por código. */
  rejected: Record<string, number>;
  commands: number;
  ms: number;
  /** Mensaje si la partida lanzó una excepción. */
  error?: string;
  /** Oro depositado en total por todos los jugadores. */
  goldMined: number;
  /** Criaturas vivas por jugador en el minuto 10 y 20 (si la partida llegó). */
  creaturesAt10?: number[];
  creaturesAt20?: number[];
  /** Quién fue eliminado y cuándo, en orden. */
  eliminations?: Array<{ id: number; slot: number; tick: number }>;
}

export interface Summary {
  games: number;
  errors: number;
  finished: number;
  reasons: Record<string, number>;
  minutes: { mean: number; median: number; min: number; max: number };
  /** Victorias por esquina del mapa (slot) y partidas jugadas por esquina. */
  winsBySlot: Record<number, number>;
  gamesBySlot: Record<number, number>;
  /** Victorias / partidas jugadas, por esquina (los empates no cuentan como victoria). */
  winRateBySlot: Record<number, number>;
  /** Victorias por id de jugador (el id decide en qué orden se procesan los comandos). */
  winsById: Record<number, number>;
  draws: number;
  rejected: Record<string, number>;
  goldPerMinute: number;
  creaturesAt10: number;
  creaturesAt20: number;
}

const TICKS_PER_MINUTE = 600;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(
  records: readonly GameRecord[],
  ticksPerMinute = TICKS_PER_MINUTE,
): Summary {
  const ok = records.filter((r) => !r.error);
  const minutes = ok.map((r) => r.ticks / ticksPerMinute);
  const winsBySlot: Record<number, number> = {};
  const winsById: Record<number, number> = {};
  const gamesBySlot: Record<number, number> = {};
  const reasons: Record<string, number> = {};
  const rejected: Record<string, number> = {};
  let draws = 0;
  let finished = 0;
  let gold = 0;
  for (const r of ok) {
    reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
    if (r.winners.length > 0) finished++;
    for (const slot of Object.values(r.slots)) gamesBySlot[slot] = (gamesBySlot[slot] ?? 0) + 1;
    if (r.winners.length === 1) {
      winsById[r.winners[0] as number] = (winsById[r.winners[0] as number] ?? 0) + 1;
      const slot = r.slots[r.winners[0] as number];
      if (slot !== undefined) winsBySlot[slot] = (winsBySlot[slot] ?? 0) + 1;
    } else if (r.winners.length > 1) draws++;
    for (const [code, n] of Object.entries(r.rejected)) rejected[code] = (rejected[code] ?? 0) + n;
    gold += r.goldMined;
  }
  const winRateBySlot: Record<number, number> = {};
  for (const [slot, n] of Object.entries(gamesBySlot))
    winRateBySlot[Number(slot)] = (winsBySlot[Number(slot)] ?? 0) / n;
  const avg = (key: 'creaturesAt10' | 'creaturesAt20') => mean(ok.flatMap((r) => r[key] ?? []));
  return {
    games: records.length,
    errors: records.length - ok.length,
    finished,
    reasons,
    minutes: {
      mean: mean(minutes),
      median: median(minutes),
      min: minutes.length ? Math.min(...minutes) : 0,
      max: minutes.length ? Math.max(...minutes) : 0,
    },
    winsBySlot,
    gamesBySlot,
    winRateBySlot,
    winsById,
    draws,
    rejected,
    goldPerMinute: minutes.length ? gold / minutes.reduce((a, b) => a + b, 0) / 1 : 0,
    creaturesAt10: avg('creaturesAt10'),
    creaturesAt20: avg('creaturesAt20'),
  };
}

/** ¿Cumple la Puerta 4? Sin errores, duración media entre 15 y 35 min y ninguna esquina por encima del 30 % (con 4 jugadores). */
export function checkGate4(s: Summary, players: number): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (s.errors > 0) problems.push(`${s.errors} partida(s) con errores`);
  if (s.minutes.mean < 15 || s.minutes.mean > 35)
    problems.push(`duración media ${s.minutes.mean.toFixed(1)} min (debe estar entre 15 y 35)`);
  if (players === 4) {
    for (const [slot, rate] of Object.entries(s.winRateBySlot)) {
      if (rate > 0.3)
        problems.push(`la esquina ${slot} gana el ${(rate * 100).toFixed(0)} % (máximo 30 %)`);
    }
  }
  return { ok: problems.length === 0, problems };
}
