import { loadGameData } from './data/loadGameData';
import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('Falta #app en index.html');

try {
  const data = loadGameData();
  const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1) || 1;
  const game = new Game(app, data, seed);
  game.start();
  // Gancho de depuración y pruebas de navegador.
  (window as unknown as { __dm: Game }).__dm = game;
} catch (e) {
  app.textContent = (e as Error).message;
  throw e;
}
