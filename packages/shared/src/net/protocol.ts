/**
 * Protocolo cliente ↔ servidor. Mensajes de Colyseus con tipos de texto y cargas planas (JSON / msgpack).
 * El cliente solo envía comandos y peticiones de lobby; el servidor responde con `ack` y envía `frame` (deltas)
 * filtrados por lo que ese jugador puede ver.
 */
import type { Command, ErrorCode, MatchResult, PlayerId } from '../sim/types';
import type { PlayerStats } from '../sim/stats';
import type { Delta } from './view';

export const MSG = {
  /** Cliente → servidor */
  ready: 'ready',
  color: 'color',
  nick: 'nick',
  start: 'start',
  cmd: 'cmd',
  /** Servidor → cliente */
  lobby: 'lobby',
  countdown: 'countdown',
  started: 'started',
  frame: 'frame',
  ack: 'ack',
  ended: 'ended',
  error: 'error',
} as const;

export interface ReadyMsg {
  ready: boolean;
}
export interface ColorMsg {
  color: number;
}
export interface NickMsg {
  nick: string;
}
export interface CmdMsg {
  /** Número local del cliente para casar la respuesta (`ack`). */
  seq: number;
  cmd: Command;
}

export type Phase = 'lobby' | 'countdown' | 'playing' | 'ended';

export interface LobbyPlayer {
  /** Id de sesión del cliente. */
  clientId: string;
  nick: string;
  /** Índice de color (0 a 3). */
  color: number;
  ready: boolean;
  host: boolean;
  connected: boolean;
}

export interface LobbyInfo {
  code: string;
  phase: Phase;
  players: LobbyPlayer[];
  /** Mínimo de jugadores listos para empezar y máximo de la sala. */
  minPlayers: number;
  maxPlayers: number;
}

export interface CountdownMsg {
  seconds: number;
}

/** Aviso de inicio: quién eres y quiénes juegan (ids de jugador de la partida, en el orden del lobby). */
export interface StartedMsg {
  you: PlayerId;
  players: Array<{ id: PlayerId; nick: string; color: number }>;
  /** Semilla de la partida (solo para repeticiones; el cliente no simula nada). */
  seed: number;
}

export type FrameMsg = Delta;

export type AckMsg =
  { seq: number; ok: true; accepted: number } | { seq: number; ok: false; error: ErrorCode };

export interface EndedMsg {
  result: MatchResult;
  /** Estadísticas simples para la pantalla de resultados. */
  stats: Array<{ id: PlayerId; nick: string } & PlayerStats>;
}

export interface ErrorMsg {
  message: string;
}
