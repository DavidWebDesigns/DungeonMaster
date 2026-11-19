/**
 * @dm/server: servidor autoritativo con Colyseus (lobby, partida, vistas por jugador, reconexión).
 */
export {
  MatchSession,
  cleanNick,
  type EndedInfo,
  type OutMessage,
  type SessionOptions,
} from './session';
export { MatchRoom, configureServer, type ServerConfig } from './matchRoom';
export { startServer } from './server';
