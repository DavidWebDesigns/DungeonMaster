/**
 * Duelos 1 contra 1 entre dos dificultades del PvE (data/mvp/pve.json) para comprobar que están bien ordenadas:
 *   pnpm duel [--a hard] [--b easy] [--games 20] [--seed 1]
 * Cada partida se juega dos veces cambiando de bando para que la esquina no decida. Es una medición, no balance.
 */
import { botOptionsFor, playBotMatch } from '@dm/shared';
import { loadDataFromDisk } from '@dm/shared/node';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const loaded = loadDataFromDisk();
if (!loaded.ok) throw new Error('Datos inválidos: ejecuta pnpm validate-data');
const data = loaded.data;
const a = arg('a', 'hard');
const b = arg('b', 'easy');
const games = Number(arg('games', '20'));
const seed0 = Number(arg('seed', '1'));
const optA = botOptionsFor(data, a);
const optB = botOptionsFor(data, b);
if (!optA || !optB) throw new Error(`Dificultad desconocida: ${!optA ? a : b}`);

let winsA = 0;
let winsB = 0;
let draws = 0;
for (let g = 0; g < games; g++) {
  const seed = seed0 + g;
  // Se alternan los bandos: en las partidas pares A es el jugador 1; en las impares, el 2.
  const aId = g % 2 === 0 ? 1 : 2;
  const r = playBotMatch(data, {
    players: 2,
    seed,
    botsByPlayer: { [aId]: optA, [3 - aId]: optB },
  });
  const w = r.state.result?.winners ?? [];
  if (w.length !== 1) draws++;
  else if (w[0] === aId) winsA++;
  else winsB++;
  process.stdout.write(`${g + 1}/${games} `);
}
console.log(`\n${a} gana ${winsA} · ${b} gana ${winsB} · sin ganador ${draws}`);
