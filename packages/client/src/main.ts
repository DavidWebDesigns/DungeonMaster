import { loadGameData } from './data/loadGameData';

const app = document.getElementById('app');
if (!app) throw new Error('Falta #app en index.html');

try {
  const data = loadGameData();
  app.textContent = `Dungeon Master · datos válidos: ${data.rooms.length} salas, ${data.creatures.length} criaturas, mapa ${data.map.width}×${data.map.height}`;
} catch (e) {
  app.textContent = (e as Error).message;
}
