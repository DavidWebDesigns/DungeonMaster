/**
 * pnpm balance [--games 0] [--players 4] [--seed 1]
 * Informe de balance: tablas de criaturas a partir de /data y, si se pide con --games, un resumen de partidas de bots.
 */
import { loadDataFromDisk } from '@dm/shared/node';
import { runGame } from '../sim/runGame';
import { summarize, type GameRecord } from '../sim/stats';
import { creatureRows, renderReport } from './report';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

const loaded = loadDataFromDisk();
if (!loaded.ok) {
  console.error('Datos inválidos: ejecuta pnpm validate-data');
  process.exit(1);
}
const data = loaded.data;
console.log('# Informe de balance\n');
console.log(renderReport(creatureRows(data)));

const games = arg('games', 0);
if (games > 0) {
  const players = arg('players', 4);
  const seed = arg('seed', 1);
  console.log(`\n## Partidas de bots (${games} de ${players} jugadores)\n`);
  const records: GameRecord[] = [];
  for (let i = 0; i < games; i++) records.push(runGame(data, seed + i, players));
  const s = summarize(records);
  console.log(
    `- Duración media: ${s.minutes.mean.toFixed(1)} min (mediana ${s.minutes.median.toFixed(1)})`,
  );
  console.log(`- Oro depositado por minuto: ${s.goldPerMinute.toFixed(0)}`);
  console.log(
    `- Criaturas por jugador: min 10 ${s.creaturesAt10.toFixed(1)}, min 20 ${s.creaturesAt20.toFixed(1)}`,
  );
  for (const slot of Object.keys(s.gamesBySlot).map(Number).sort()) {
    console.log(
      `- Esquina ${slot}: gana ${((s.winRateBySlot[slot] ?? 0) * 100).toFixed(0)} % (${s.winsBySlot[slot] ?? 0}/${s.gamesBySlot[slot]})`,
    );
  }
} else {
  console.log(
    '\n(Añade --games N para incluir partidas de bots: duración, oro minado y victorias por esquina.)',
  );
}
