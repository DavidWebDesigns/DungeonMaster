/** Tipos del estado de la simulación. Todo es plano y serializable: sin clases ni referencias a los datos. */
import type { Point } from '../schemas';

export type PlayerId = number;

export interface PlayerState {
  id: PlayerId;
  /** Esquina del mapa que ocupa (índice en map.bases). */
  slot: number;
  gold: number;
  mana: number;
  heartHp: number;
  eliminated: boolean;
  /** Tick a partir del cual se puede volver a lanzar cada hechizo. */
  cooldowns: Record<string, number>;
  /** Límite de comandos por segundo. */
  rateSecond: number;
  rateCount: number;
}

export type TaskKind = 'dig' | 'claim' | 'reinforce';

export interface Task {
  id: number;
  owner: PlayerId;
  kind: TaskKind;
  /** Índice del tile (y * width + x). */
  tile: number;
  /** Id del Imp que la tiene reservada, 0 si está libre. Una tarea por tile. */
  reservedBy: number;
  /** Versión de mapa en la que se comprobó que no hay ruta. */
  blockedVersion: number;
  /** Creada sola por un Imp ocioso (reclamar suelo cercano), no marcada por el jugador. */
  auto: boolean;
}

export type ImpMode = 'idle' | 'needPath' | 'moving' | 'working';
export type ImpGoal = 'none' | 'task' | 'haul';

export interface Imp {
  id: number;
  owner: PlayerId;
  /** Posición en tiles; el centro del tile (tx, ty) es (tx + 0,5, ty + 0,5). */
  x: number;
  y: number;
  carry: number;
  mode: ImpMode;
  goal: ImpGoal;
  taskId: number;
  /** Tiles que quedan por recorrer (sin incluir el tile actual). */
  path: number[];
  pathVersion: number;
  /** Segundos de trabajo acumulados en la tarea actual. */
  work: number;
  /** Versión de mapa en que no se encontró ruta a la Tesorería. */
  haulBlockedVersion: number;
  /** Versión de mapa en que no se encontró nada que reclamar por su cuenta. */
  autoBlockedVersion: number;
}

export interface Room {
  id: number;
  type: string;
  owner: PlayerId;
  tiles: number[];
}

export interface QueuedCommand {
  playerId: PlayerId;
  cmd: Command;
}

export interface CommandRecord {
  tick: number;
  playerId: PlayerId;
  cmd: Command;
}

export interface MatchState {
  tick: number;
  seed: number;
  /** Estado del generador mulberry32. */
  rng: number;
  /** Sube con cada cambio de terreno, dueño o sala. Las rutas se recalculan si cambia. */
  mapVersion: number;
  width: number;
  height: number;
  /** Índice en data.terrain por tile. */
  terrain: number[];
  /** Dueño por tile (0 = nadie). */
  owner: number[];
  /** Oro que queda en cada veta (0 donde no hay). */
  goldLeft: number[];
  /** Id de la sala que cubre cada tile (0 = ninguna). */
  roomAt: number[];
  players: PlayerState[];
  imps: Imp[];
  tasks: Task[];
  rooms: Room[];
  nextImpId: number;
  nextTaskId: number;
  nextRoomId: number;
  queue: QueuedCommand[];
  /** Todos los comandos que pasaron el límite de ritmo, para reproducir la partida. No entra en el hash. */
  log: CommandRecord[];
}

/* ---------- Comandos (sección 6.6, solo los de la fase 1) ---------- */

export type Command =
  | { type: 'dig'; tiles: Point[] }
  | { type: 'cancelDig'; tiles: Point[] }
  | { type: 'claim'; tiles: Point[] }
  | { type: 'reinforce'; tiles: Point[] }
  | { type: 'buildRoom'; room: string; rect: { x: number; y: number; w: number; h: number } }
  | { type: 'sellRoom'; tile: Point }
  | { type: 'castSpell'; spell: string; target: Point };

export type ErrorCode =
  | 'NO_GOLD'
  | 'NO_MANA'
  | 'INVALID_TARGET'
  | 'OUT_OF_RANGE'
  | 'COOLDOWN'
  | 'NOT_OWNER'
  | 'RATE_LIMIT'
  /** Se alcanzó un máximo (Imps). [PROPUESTO] */
  | 'LIMIT_REACHED'
  /** Comando mal formado o no disponible todavía. [PROPUESTO] */
  | 'INVALID_COMMAND';

export type CommandResult = { ok: true; accepted: number } | { ok: false; error: ErrorCode };

/* ---------- Eventos para el cliente (no forman parte del estado) ---------- */

export type SimEvent =
  | { type: 'tileChanged'; tile: number }
  | { type: 'goldDeposited'; playerId: PlayerId; impId: number; amount: number }
  | { type: 'impSpawned'; playerId: PlayerId; impId: number }
  | { type: 'roomBuilt'; playerId: PlayerId; roomId: number }
  | { type: 'roomSold'; playerId: PlayerId; roomId: number }
  | { type: 'commandRejected'; playerId: PlayerId; error: ErrorCode };
