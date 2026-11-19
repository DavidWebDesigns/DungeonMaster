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
  private readonly bot: Bot | null;
  private accumulatorMs = 0;
  private readonly tickMs: number;

  constructor(data: DataSet, seed: number, options: SandboxOptions = {}) {
    this.data = data;
    this.versus = options.opponent === true;
    this.state = createMatch({ playerCount: this.versus ? 2 : 1 }, data, seed);
    // El bot usa exactamente el mismo protocolo de comandos que el jugador.
    this.bot = this.versus ? createBot(2, seed * 7919 + 2 * 104729) : null;
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
    this.accumulatorMs += elapsedMs;
    const events: SimEvent[] = [];
    let ran = 0;
    while (this.accumulatorMs >= this.tickMs) {
      if (ran === MAX_CATCH_UP_TICKS) {
        this.accumulatorMs = 0;
        break;
      }
      this.snapshot();
      if (this.bot)
        for (const cmd of this.bot.act(this.state, this.data))
          applyCommand(this.state, this.data, this.bot.playerId, cmd);
      events.push(...step(this.state, this.data));
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
