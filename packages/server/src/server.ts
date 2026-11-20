import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { MatchRoom, configureServer, type ServerConfig } from './matchRoom';

/** Arranca el servidor de partidas en un puerto (0 = uno libre). Devuelve el servidor y el puerto real. */
export async function startServer(
  port: number,
  cfg: ServerConfig,
): Promise<{ server: Server; port: number }> {
  configureServer(cfg);
  // Latidos cada 1,5 s y 2 sin respuesta: una conexión caída se detecta en ~4 s (si no, la reconexión tarda en poder entrar).
  const server = new Server({
    transport: new WebSocketTransport({
      pingInterval: 1500,
      pingMaxRetries: 2,
      // Los mensajes legítimos del cliente son diminutos: más que esto es un abuso y se corta la conexión.
      maxPayload: cfg.data.global.connection.maxPayloadBytes,
    }),
  });
  server.define('match', MatchRoom).filterBy(['code']);
  await server.listen(port);
  const address = (
    server.transport as unknown as { server?: { address(): { port: number } | string | null } }
  ).server?.address();
  const real = typeof address === 'object' && address ? address.port : port;
  return { server, port: real };
}
