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
  /** Criaturas que lleva en la mano (ids, en orden de recogida). */
  hand: number[];
  /** Tick a partir del cual se puede volver a abofetear. */
  slapReadyTick: number;
  /** Punto de Llamada a las armas (tile) y hasta qué tick vale; -1 si no hay. */
  rallyTile: number;
  rallyUntil: number;
  /** Tiles que ha llegado a ver alguna vez (1) o no (0): el terreno visto queda recordado. */
  seen: number[];
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
  hp: number;
  /** Criatura que lo atacó la última vez (0 = nadie) y cuándo. */
  attackedBy: number;
  attackedTick: number;
}

export interface Room {
  id: number;
  type: string;
  owner: PlayerId;
  tiles: number[];
  /** Ticks desde el último intento de atraer (Portal) o de producir pollos (Criadero). */
  timer: number;
  /** Pollos listos para comer (Criadero). */
  stock: number;
}

/** Qué está haciendo o a dónde va una criatura. */
export type CreatureGoal =
  | 'none'
  | 'portal'
  | 'hatchery'
  | 'bed'
  | 'treasury'
  | 'training'
  | 'wander'
  /** Persigue y ataca a un enemigo. */
  | 'combat'
  /** Va a golpear una sala o el Corazón enemigo. */
  | 'siege'
  /** Huye herida a su cama. */
  | 'flee'
  /** Acude al punto de Llamada a las armas. */
  | 'rally';
export type CreatureMode = 'idle' | 'needPath' | 'moving' | 'acting';

/** Una criatura que llegó por el Portal (no incluye a los Imps). */
export interface Creature {
  id: number;
  type: string;
  owner: PlayerId;
  x: number;
  y: number;
  level: number;
  /** Experiencia dentro del nivel actual. */
  xp: number;
  hp: number;
  /** Ánimo de 0 a 100. */
  mood: number;
  /** Hambre y sueño de 0 a 100. */
  hunger: number;
  sleep: number;
  /** Satisfacción por el sueldo, de -1 a +1. */
  wageSat: number;
  /** Tiles de su cama en una Guarida (vacío = sin cama). */
  beds: number[];
  /** Hay día de pago y aún no ha cobrado. */
  payPending: boolean;
  goal: CreatureGoal;
  mode: CreatureMode;
  /** Sala a la que va a entrenar. */
  targetRoom: number;
  /** Tile al que va a pasear. */
  wanderTile: number;
  path: number[];
  pathVersion: number;
  /** Segundos de descanso en la cama acumulados. */
  actTimer: number;
  /** Ticks de pausa antes de volver a pasear. */
  pauseTicks: number;
  /** Segundos seguidos en la banda Furioso. */
  furiousSeconds: number;
  /** Banda de ánimo actual (id de mood.json). */
  band: string;
  /** Está en la mano del jugador. */
  held: boolean;
  /** Hasta qué tick dura el empujón de la bofetada. */
  slapUntil: number;
  /** Este segundo ignora sus necesidades y va hacia el Portal (Enfadado). */
  ignoring: boolean;
  /** Por tipo de objetivo: versión de mapa en la que no se encontró ruta. */
  blocked: Record<string, number>;
  /** A quién ataca: una criatura, un Imp o un tile de sala (índice) / el Corazón (tile del Corazón). */
  targetKind: 'none' | 'creature' | 'imp' | 'structure';
  targetId: number;
  /** Tick a partir del cual puede volver a golpear. */
  attackReadyTick: number;
  /** Acelerada hasta este tick. */
  hasteUntil: number;
  /** Curación en marcha: ticks que quedan y cuánta vida por tick. */
  healTicksLeft: number;
  healPerTick: number;
  /** Quién la atacó por última vez: tipo, id y tick. */
  attackedByKind: 'none' | 'creature' | 'imp';
  attackedBy: number;
  attackedTick: number;
}

export interface MatchResult {
  /** Jugadores que ganan (varios si hay empate). */
  winners: PlayerId[];
  reason: 'lastStanding' | 'draw' | 'timeout';
  tick: number;
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
  creatures: Creature[];
  tasks: Task[];
  rooms: Room[];
  nextImpId: number;
  nextCreatureId: number;
  /** Tick del próximo día de pago. */
  nextPayTick: number;
  nextTaskId: number;
  nextRoomId: number;
  /** Daño recibido por cada tile de sala (la sala pierde el tile al llegar a roomTileHp). */
  tileDamage: number[];
  /** La partida sigue en juego o ya terminó. */
  status: 'playing' | 'ended';
  result: MatchResult | null;
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
  | { type: 'castSpell'; spell: string; target?: Point; creature?: number }
  | { type: 'surrender' }
  | { type: 'pickUp'; id: number }
  | { type: 'drop'; tile: Point }
  | { type: 'slap'; id: number };

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
  | { type: 'commandRejected'; playerId: PlayerId; error: ErrorCode }
  | { type: 'creatureArrived'; playerId: PlayerId; creatureId: number; creature: string }
  /** El Portal no atrajo a nadie: `reason` dice qué falta. */
  | { type: 'portalIdle'; playerId: PlayerId; reason: 'noLair' | 'noRoom' | 'full' }
  | { type: 'payday'; tick: number }
  | { type: 'paid'; playerId: PlayerId; creatureId: number; amount: number; ok: boolean }
  | { type: 'moodBand'; playerId: PlayerId; creatureId: number; band: string }
  | { type: 'levelUp'; playerId: PlayerId; creatureId: number; level: number }
  | { type: 'creatureLeft'; playerId: PlayerId; creatureId: number }
  | {
      type: 'creatureDied';
      playerId: PlayerId;
      creatureId: number;
      cause: 'starvation' | 'combat' | 'spell' | 'eliminated';
    }
  | { type: 'impDied'; playerId: PlayerId; impId: number }
  | {
      type: 'hit';
      attackerOwner: PlayerId;
      targetOwner: PlayerId;
      targetKind: 'creature' | 'imp' | 'room' | 'heart';
      damage: number;
      x: number;
      y: number;
    }
  | { type: 'tileDestroyed'; tile: number; owner: PlayerId }
  | { type: 'spellCast'; playerId: PlayerId; spell: string; x: number; y: number }
  | { type: 'eliminated'; playerId: PlayerId }
  | { type: 'gameOver'; result: MatchResult }
  | { type: 'slapped'; playerId: PlayerId; creatureId: number }
  | { type: 'ate'; playerId: PlayerId; creatureId: number };
