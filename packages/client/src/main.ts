import './ui/hud.css';
import { loadGameData } from './data/loadGameData';
import { Game } from './game';

const app = document.getElementById('app');
if (!app) throw new Error('Falta #app en index.html');

try {
  const data = loadGameData();
  const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1) || 1;
  // ?vs=bot: partida 1 contra 1 con un bot rival y niebla de guerra.
  const versus = new URLSearchParams(location.search).get('vs') === 'bot';
  const game = new Game(app, data, seed, { versus });
  game.start();
  // Gancho de depuración y pruebas de navegador.
  (window as unknown as { __dm: Game }).__dm = game;
} catch (e) {
  app.textContent = (e as Error).message;
  throw e;
}
