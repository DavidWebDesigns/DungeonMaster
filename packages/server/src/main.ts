/** pnpm server: arranca el servidor de partidas (PORT, por defecto 2567). */
import { loadDataFromDisk } from '@dm/shared/node';
import { startServer } from './server';

const loaded = loadDataFromDisk();
if (!loaded.ok) {
  console.error('Datos inválidos: ejecuta pnpm validate-data');
  process.exit(1);
}
const port = Number(process.env['PORT'] ?? 2567);
const { port: real } = await startServer(port, {
  data: loaded.data,
  logDir: process.env['MATCH_LOG_DIR'] ?? 'match-logs',
});
console.log(`Servidor de partidas escuchando en ws://localhost:${real}`);
