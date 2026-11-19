import './ui/hud.css';
import './online/online.css';
import { loadGameData } from './data/loadGameData';
import { Game } from './game';
import { startOnline } from './online/app';
import { Sandbox } from './sandbox/sandbox';

const app = document.getElementById('app');
if (!app) throw new Error('Falta #app en index.html');

try {
  const data = loadGameData();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') ?? (params.get('vs') === 'bot' ? 'solo' : 'pve');
  const seed = Number(params.get('seed') ?? 1) || 1;
  if (mode === 'online') {
    // ?mode=online: partida en red (menú, lobby y juego contra otros jugadores). ?code=ABCDEF para unirse directo.
    startOnline(app, data, params);
  } else {
    let sandbox: Sandbox;
    if (mode === 'pve') {
      // Modo por defecto: tu mazmorra contra bots. ?rivals=0..3 y ?difficulty=easy|normal|hard.
      const rivals = Math.round(Number(params.get('rivals') ?? data.pve.defaultRivals));
      const difficulty = params.get('difficulty') ?? data.pve.defaultDifficulty;
      sandbox = new Sandbox(data, seed, {
        rivals: Number.isFinite(rivals) ? rivals : data.pve.defaultRivals,
        difficulty,
      });
    } else {
      // ?mode=solo: sandbox sin rival (o con un bot si se añade ?vs=bot). Lo usan las pruebas de navegador.
      sandbox = new Sandbox(data, seed, { opponent: params.get('vs') === 'bot' });
    }
    const game = new Game(app, data, sandbox);
    game.start();
    // Gancho de depuración y pruebas de navegador.
    (window as unknown as { __dm: Game }).__dm = game;
    const link = document.createElement('a');
    link.className = 'onlinelink';
    link.href = '?mode=online';
    link.textContent = 'Jugar en línea';
    // En partidas con rival el botón de rendirse ocupa esa esquina.
    if (!sandbox.versus) document.body.appendChild(link);
  }
} catch (e) {
  app.textContent = (e as Error).message;
  throw e;
}
