/**
 * pnpm sim [--games 100] [--players 4] [--seed 1] [--jobs 4]
 * Juega partidas completas de bots sin gráficos y resume duración, ganadores por esquina y errores.
 * Sale con código 1 si alguna partida falla.
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadDataFromDisk } from '@dm/shared/node';
import { runGame } from './runGame';
import { checkGate4, summarize, type GameRecord } from './stats';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) ? v : fallback;
}

const games = arg('games', 100);
const players = arg('players', 4);
const seed0 = arg('seed', 1);
const jobs = Math.max(1, Math.min(arg('jobs', 4), games));
const outFile = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : undefined;
const isWorker = process.argv.includes('--worker');

function load() {
  const r = loadDataFromDisk();
  if (!r.ok) {
    console.error('Datos inválidos: ejecuta pnpm validate-data');
    process.exit(1);
  }
  return r.data;
}

if (isWorker) {
  // Proceso hijo: juega las semillas [seed, seed + games) y manda un registro JSON por línea.
  const data = load();
  for (let s = seed0; s < seed0 + games; s++)
    console.log(`REC ${JSON.stringify(runGame(data, s, players))}`);
} else {
  const records: GameRecord[] = [];
  const per = Math.ceil(games / jobs);
  const script = fileURLToPath(import.meta.url);
  console.log(`Jugando ${games} partidas de ${players} bots con ${jobs} procesos...`);
  const t0 = Date.now();
  let running = 0;
  for (let j = 0; j < jobs; j++) {
    const from = seed0 + j * per;
    const count = Math.min(per, seed0 + games - from);
    if (count <= 0) continue;
    running++;
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        script,
        '--worker',
        '--games',
        String(count),
        '--players',
        String(players),
        '--seed',
        String(from),
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.startsWith('REC ')) {
          records.push(JSON.parse(line.slice(4)) as GameRecord);
          process.stdout.write(`\r${records.length}/${games}`);
        }
      }
    });
    child.on('exit', () => {
      if (--running > 0) return;
      if (outFile) writeFileSync(outFile, JSON.stringify(records));
      const s = summarize(records);
      const gate = checkGate4(s, players);
      console.log(`\n\nTerminado en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      console.log(
        `Partidas: ${s.games} · con errores: ${s.errors} · terminadas con ganador: ${s.finished} · empates: ${s.draws}`,
      );
      console.log(
        `Duración (min): media ${s.minutes.mean.toFixed(1)} · mediana ${s.minutes.median.toFixed(1)} · mín ${s.minutes.min.toFixed(1)} · máx ${s.minutes.max.toFixed(1)}`,
      );
      console.log(`Motivo de fin: ${JSON.stringify(s.reasons)}`);
      console.log('Victorias por esquina:');
      for (const slot of Object.keys(s.gamesBySlot).map(Number).sort()) {
        console.log(
          `  esquina ${slot}: ${s.winsBySlot[slot] ?? 0}/${s.gamesBySlot[slot]} (${((s.winRateBySlot[slot] ?? 0) * 100).toFixed(0)} %)`,
        );
      }
      console.log(
        `Oro depositado por minuto: ${s.goldPerMinute.toFixed(0)} · criaturas por jugador: min 10 ${s.creaturesAt10.toFixed(1)}, min 20 ${s.creaturesAt20.toFixed(1)}`,
      );
      console.log(`Comandos rechazados: ${JSON.stringify(s.rejected)}`);
      for (const r of records.filter((x) => x.error))
        console.log(`\nERROR en la semilla ${r.seed}:\n${r.error}`);
      console.log(
        gate.ok
          ? '\n✓ Cumple la Puerta 4 (según esta muestra)'
          : `\n✗ No cumple la Puerta 4:\n  - ${gate.problems.join('\n  - ')}`,
      );
      process.exit(s.errors > 0 ? 1 : 0);
    });
  }
}
