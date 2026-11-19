/**
 * De dónde sale el estado de la partida: el sandbox (simulación local) o la red (servidor autoritativo).
 * El juego, el dibujo y el HUD solo conocen esta interfaz: leen `state`, mandan comandos con `send` y avanzan con `advance`.
 */
import type { Command, CommandResult, DataSet, MatchState, SimEvent } from '@dm/shared';

export interface UnitPose {
  x: number;
  y: number;
}

export interface GameSource {
  readonly state: MatchState;
  readonly data: DataSet;
  /** Jugador que controla este cliente. */
  readonly localPlayer: number;
  /** Hay rival (contra un bot o en red): se dibuja la niebla de guerra y se puede uno rendir. */
  readonly versus: boolean;
  /** Posición de cada Imp y criatura al inicio del último tick, para interpolar el dibujo. */
  readonly previous: Map<number, UnitPose>;
  readonly previousCreatures: Map<number, UnitPose>;
  /** Cuánto del tick siguiente ha transcurrido (0 a 1). */
  readonly alpha: number;
  paused: boolean;
  /** Valida y manda un comando. Devuelve enseguida si se acepta o por qué no (en red, el servidor lo confirma después). */
  send(cmd: Command): CommandResult;
  /** Avanza el reloj; devuelve los eventos que han ocurrido desde la última llamada. */
  advance(elapsedMs: number): SimEvent[];
}
