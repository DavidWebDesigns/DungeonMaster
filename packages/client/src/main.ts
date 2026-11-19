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
  if (params.get('mode') === 'online') {
    // ?mode=online: partida en red (menú, lobby y juego contra otros jugadores). ?code=ABCDEF para unirse directo.
    startOnline(app, data, params);
  } else {
    const seed = Number(params.get('seed') ?? 1) || 1;
    // ?vs=bot: partida 1 contra 1 con un bot rival y niebla de guerra.
    const versus = params.get('vs') === 'bot';
    const game = new Game(app, data, new Sandbox(data, seed, { opponent: versus }));
    game.start();
    // Gancho de depuración y pruebas de navegador.
    (window as unknown as { __dm: Game }).__dm = game;
    // Solo en el modo solitario: en partidas con rival, el botón de rendirse ocupa esa esquina.
    if (!versus) {
      const link = document.createElement('a');
      link.className = 'onlinelink';
      link.href = '?mode=online';
      link.textContent = 'Jugar en línea';
      document.body.appendChild(link);
    }
  }
} catch (e) {
  app.textContent = (e as Error).message;
  throw e;
}
