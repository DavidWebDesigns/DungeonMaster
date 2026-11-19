/**
 * Sandbox: la simulación de @dm/shared corriendo dentro del navegador para un jugador, sin servidor.
 *
 * El cliente nunca cambia el estado por su cuenta: todo pasa por `send` (que usa `applyCommand`),
 * igual que pasará con la red en la fase 5. El tiempo lo pone quien llama (`advance`), así que no
 * hay relojes ocultos y las pruebas son deterministas.
 */
import type { GameSource } from './source';
import {
  applyCommand,
  countStats,
  newMatchStats,
  type MatchStats,
  botOptionsFor,
  createBot,
  createMatch,
  hashState,
  step,
  type Bot,
  type Command,
  type CommandResult,
  type DataSet,
  type MatchState,
  type SimEvent,
} from '@dm/shared';

/** Id del jugador local en el sandbox. */
export const LOCAL_PLAYER = 1;

/** Máximo de ticks que se recuperan en una sola llamada (si la pestaña estuvo dormida no se dispara). */
const MAX_CATCH_UP_TICKS = 10;

export interface ImpPose {
  x: number;
  y: number;
}

export interface SandboxOptions {
  /** Un bot rival (jugador 2) para jugar 1 contra 1 en local. Activa también la niebla de guerra. */
  opponent?: boolean;
  /** Modo PvE: cuántos bots rivales (0 a 3). Si se da, manda sobre `opponent`. */
  rivals?: number;
  /** Dificultad de los bots (id de pve.json). Por defecto, la de pve.defaultDifficulty. */
  difficulty?: string;
}

export class Sandbox implements GameSource {
  readonly localPlayer = LOCAL_PLAYER;
  readonly state: MatchState;
  readonly data: DataSet;
  /** Posición de cada Imp al inicio del último tick, para interpolar el dibujo a 60 fps. */
  readonly previous = new Map<number, ImpPose>();
  /** Lo mismo para las criaturas. */
  readonly previousCreatures = new Map<number, ImpPose>();
  paused = false;
  /** Hay rival: se juega 1 contra 1 y el cliente dibuja la niebla de guerra. */
  readonly versus: boolean;
  /** Rivales controlados por bots (ids 2, 3...). */
  readonly bots: Bot[];
  /** Estadísticas de la partida para la pantalla de fin. */
  readonly stats: MatchStats;
  /** Multiplicador del paso del tiempo (1, 2, 4...). Solo existe en local. */
  speed = 1;
  private accumulatorMs = 0;
  private readonly tickMs: number;

  constructor(data: DataSet, seed: number, options: SandboxOptions = {}) {
    this.data = data;
    const maxRivals = data.global.players.max - 1;
    const rivals = Math.max(0, Math.min(maxRivals, options.rivals ?? (options.opponent ? 1 : 0)));
    this.versus = rivals > 0;
    this.state = createMatch({ playerCount: 1 + rivals }, data, seed);
    // Los bots usan exactamente el mismo protocolo de comandos que el jugador.
    const botOptions =
      options.rivals !== undefined
        ? (botOptionsFor(data, options.difficulty ?? data.pve.defaultDifficulty) ?? {})
        : {};
    this.bots = [];
    for (let id = 2; id <= 1 + rivals; id++)
      this.bots.push(createBot(id, seed * 7919 + id * 104729, botOptions));
    this.stats = newMatchStats(this.state.players.map((p) => p.id));
    this.tickMs = 1000 / data.global.tickRate;
    this.snapshot();
  }

  /** Valida y encola un comando del jugador local; se ejecuta al empezar el próximo tick. */
  send(cmd: Command): CommandResult {
    return applyCommand(this.state, this.data, LOCAL_PLAYER, cmd);
  }

  /** Avanza el reloj `elapsedMs` milisegundos y ejecuta los ticks que toquen. Devuelve sus eventos. */
  advance(elapsedMs: number): SimEvent[] {
    if (this.paused || !(elapsedMs > 0)) return [];
    this.accumulatorMs += elapsedMs * this.speed;
    const events: SimEvent[] = [];
    let ran = 0;
    while (this.accumulatorMs >= this.tickMs) {
      if (ran === MAX_CATCH_UP_TICKS) {
        this.accumulatorMs = 0;
        break;
      }
      this.snapshot();
      for (const bot of this.bots)
        for (const cmd of bot.act(this.state, this.data))
          applyCommand(this.state, this.data, bot.playerId, cmd);
      const tickEvents = step(this.state, this.data);
      countStats(this.stats, tickEvents);
      events.push(...tickEvents);
      this.accumulatorMs -= this.tickMs;
      ran++;
    }
    return events;
  }

  /** Cuánto del tick siguiente ha transcurrido, de 0 a 1. Sirve para interpolar posiciones. */
  get alpha(): number {
    return Math.min(1, this.accumulatorMs / this.tickMs);
  }

  hash(): string {
    return hashState(this.state);
  }

  private snapshot(): void {
    this.previous.clear();
    for (const imp of this.state.imps) this.previous.set(imp.id, { x: imp.x, y: imp.y });
    this.previousCreatures.clear();
    for (const c of this.state.creatures) this.previousCreatures.set(c.id, { x: c.x, y: c.y });
  }
}
