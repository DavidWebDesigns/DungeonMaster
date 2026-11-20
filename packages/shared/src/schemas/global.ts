import { z } from 'zod';
import {
  Fraction,
  NonNegativeInt,
  NonNegativeNumber,
  PositiveInt,
  PositiveNumber,
  Seconds,
} from './common';

/** global.json: parámetros de partida (sección 6.1 del plan). */
export const GlobalConfig = z.strictObject({
  tickRate: PositiveInt,
  map: z.strictObject({ id: z.string().min(1), width: PositiveInt, height: PositiveInt }),
  players: z.strictObject({
    min: PositiveInt,
    max: PositiveInt,
    /** Qué esquinas (slots del mapa) se usan según el número de jugadores. */
    cornersByPlayerCount: z.record(z.string().regex(/^\d+$/), z.array(NonNegativeInt).min(1)),
  }),
  match: z.strictObject({
    maxMinutes: PositiveNumber,
    countdownSeconds: Seconds,
    endedCloseSeconds: Seconds,
    roomCodeLength: PositiveInt,
  }),
  startingGold: NonNegativeInt,
  mana: z.strictObject({
    max: PositiveInt,
    start: NonNegativeInt,
    regenBasePerSecond: NonNegativeNumber,
    regenPerClaimedTilePerSecond: NonNegativeNumber,
    regenCapPerSecond: PositiveNumber,
  }),
  imps: z.strictObject({ start: NonNegativeInt, max: PositiveInt }),
  maxCreaturesPerPlayer: PositiveInt,
  heart: z.strictObject({ hp: PositiveInt, size: PositiveInt }),
  roomTileHp: PositiveInt,
  portal: z.strictObject({
    attractIntervalSeconds: PositiveNumber,
    reservePerPortal: PositiveInt,
  }),
  work: z.strictObject({
    claimSeconds: PositiveNumber,
    enemyClaimSeconds: PositiveNumber,
    enemyClaimBlockRadius: NonNegativeInt,
    reinforceSeconds: PositiveNumber,
    /** Radio (en tiles) en que un Imp ocioso busca suelo sin dueño que reclamar por su cuenta. */
    autoClaimRadius: PositiveInt,
  }),
  connection: z.strictObject({
    reconnectSeconds: Seconds,
    inactivitySurrenderSeconds: Seconds,
    /** Mensajes de red por segundo y por jugador (de cualquier tipo); el exceso se descarta. */
    maxMessagesPerSecond: PositiveInt,
    /** Tamaño máximo de un mensaje del cliente al servidor, en bytes. */
    maxPayloadBytes: PositiveInt,
    /** Salas abiertas a la vez en un servidor (más allá, crear una sala falla). */
    maxRooms: PositiveInt,
  }),
  commands: z.strictObject({
    maxPerSecond: PositiveInt,
    maxTilesPerCommand: PositiveInt,
  }),
  hand: z.strictObject({ capacity: PositiveInt }),
  slap: z.strictObject({
    cooldownSeconds: Seconds,
    workSpeedBonus: NonNegativeNumber,
    durationSeconds: Seconds,
  }),
  vision: z.strictObject({
    creatureRadius: PositiveNumber,
    heartRadius: PositiveNumber,
    ownTileRadius: NonNegativeNumber,
  }),
  pathfinding: z.strictObject({
    maxPerTickPerPlayer: PositiveInt,
    straightCost: PositiveNumber,
    diagonalCost: PositiveNumber,
  }),
  combat: z.strictObject({
    aggroRadius: PositiveNumber,
    meleeReach: PositiveNumber,
    damageRandomMin: PositiveNumber,
    damageRandomMax: PositiveNumber,
    fleeHpFraction: Fraction,
    /** Una criatura que huyó a su cama vuelve a la acción al recuperar esta fracción de su vida. */
    recoverHpFraction: Fraction,
    /** Distancia (en tiles, al borde del tile) a la que una criatura puede golpear una sala o el Corazón enemigo. */
    structureReach: PositiveNumber,
    /** Segundos que una criatura recuerda a quien la atacó y le da prioridad como objetivo. */
    retaliationSeconds: PositiveNumber,
    /** Fracción del alcance a la que se coloca para atacar (menos de 1: se queda un poco dentro del alcance). */
    standoffFactor: Fraction,
    /** Ventana tras un golpe en la que una criatura dormida se considera atacada y se despierta. */
    wakeOnAttackSeconds: PositiveNumber,
  }),
  tiebreak: z.array(z.enum(['heartHpFraction', 'creaturePower', 'gold'])).min(1),
});
export type GlobalConfig = z.infer<typeof GlobalConfig>;
