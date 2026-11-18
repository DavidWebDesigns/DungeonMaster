/**
 * Sandbox: la simulación de @dm/shared corriendo dentro del navegador para un jugador, sin servidor.
 *
 * El cliente nunca cambia el estado por su cuenta: todo pasa por `send` (que usa `applyCommand`),
 * igual que pasará con la red en la fase 5. El tiempo lo pone quien llama (`advance`), así que no
 * hay relojes ocultos y las pruebas son deterministas.
 */
import {
  applyCommand,
  createMatch,
  hashState,
  step,
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

export class Sandbox {
  readonly state: MatchState;
  readonly data: DataSet;
  /** Posición de cada Imp al inicio del último tick, para interpolar el dibujo a 60 fps. */
  readonly previous = new Map<number, ImpPose>();
  /** Lo mismo para las criaturas. */
  readonly previousCreatures = new Map<number, ImpPose>();
  paused = false;
  private accumulatorMs = 0;
  private readonly tickMs: number;

  constructor(data: DataSet, seed: number) {
    this.data = data;
    this.state = createMatch({ playerCount: 1 }, data, seed);
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
