/**
 * Fuente de estado en red: reconstruye lo que este jugador sabe a partir de los deltas del servidor y le manda los
 * comandos. El cliente nunca cambia el estado por su cuenta: `send` solo comprueba de antemano si la orden tiene sentido
 * (con las mismas reglas que el servidor) y la envía; lo que de verdad pasa llega en el siguiente delta.
 */
import {
  MSG,
  Mirror,
  previewCommand,
  type AckMsg,
  type Command,
  type CommandResult,
  type DataSet,
  type Delta,
  type EndedMsg,
  type ErrorCode,
  type SimEvent,
} from '@dm/shared';
import type { GameSource, UnitPose } from '../sandbox/source';

/** Lo que NetSource necesita de la conexión (así se puede probar sin red). */
export interface Transport {
  send(type: string, payload: unknown): void;
  onMessage(type: string, handler: (payload: never) => void): void;
}

export class NetSource implements GameSource {
  readonly mirror: Mirror;
  readonly previous = new Map<number, UnitPose>();
  readonly previousCreatures = new Map<number, UnitPose>();
  readonly versus = true;
  paused = false;
  /** El servidor rechazó una orden que el cliente creía válida (o hubo un fallo): para mostrar el aviso. */
  onReject: (error: ErrorCode, cmd: Command) => void = () => {};
  /** Llegó el resultado de la partida con las estadísticas. */
  onEnded: (msg: EndedMsg) => void = () => {};
  /** Estadísticas de fin de partida (cuando llegan). */
  endedMsg: EndedMsg | null = null;
  /** Deltas aplicados hasta ahora. */
  framesApplied = 0;

  private seq = 0;
  private readonly pending = new Map<number, { cmd: Command; acked: boolean }>();
  private events: SimEvent[] = [];
  private sinceDeltaMs = 0;
  private readonly tickMs: number;

  constructor(
    readonly data: DataSet,
    readonly localPlayer: number,
    private readonly net: Transport,
  ) {
    this.mirror = new Mirror(data, localPlayer);
    this.tickMs = 1000 / data.global.tickRate;
    net.onMessage(MSG.frame, (d: Delta) => this.onFrame(d));
    net.onMessage(MSG.ack, (a: AckMsg) => this.onAck(a));
    net.onMessage(MSG.ended, (m: EndedMsg) => {
      this.endedMsg = m;
      this.onEnded(m);
    });
  }

  get state() {
    return this.mirror.state;
  }

  get alpha(): number {
    return Math.min(1, this.sinceDeltaMs / this.tickMs);
  }

  /** Órdenes enviadas que aún no han vuelto reflejadas en el estado (para dibujar "fantasmas"). */
  get ghosts(): Command[] {
    return [...this.pending.values()].map((p) => p.cmd);
  }

  /** Aplica un delta (también lo usan las pruebas). */
  onFrame(d: Delta): void {
    const s = this.mirror.state;
    // Posiciones anteriores, para interpolar hasta las nuevas.
    this.previous.clear();
    for (const i of s.imps) this.previous.set(i.id, { x: i.x, y: i.y });
    this.previousCreatures.clear();
    for (const c of s.creatures) this.previousCreatures.set(c.id, { x: c.x, y: c.y });
    this.mirror.apply(d);
    this.framesApplied++;
    this.sinceDeltaMs = 0;
    if (d.ev) this.events.push(...d.ev);
    // Los cambios de terreno no viajan como eventos: se deducen de los tiles que cambiaron (salvo en la instantánea).
    if (d.tiles && !d.snapshot)
      for (let k = 0; k < d.tiles.length; k += 4)
        this.events.push({ type: 'tileChanged', tile: d.tiles[k] as number });
    // Las órdenes confirmadas ya se ven reflejadas: se retiran sus fantasmas.
    for (const [seq, p] of this.pending) if (p.acked) this.pending.delete(seq);
  }

  private onAck(a: AckMsg): void {
    const p = this.pending.get(a.seq);
    if (!p) return;
    p.acked = true;
    if (!a.ok) {
      this.pending.delete(a.seq);
      this.onReject(a.error, p.cmd);
    }
  }

  send(cmd: Command): CommandResult {
    // Comprobación previa con las mismas reglas que el servidor: así el jugador ve el motivo al instante.
    const check = previewCommand(this.mirror.state, this.data, this.localPlayer, cmd);
    if (!check.ok) return { ok: false, error: check.error };
    const seq = ++this.seq;
    this.pending.set(seq, { cmd, acked: false });
    this.net.send(MSG.cmd, { seq, cmd });
    return { ok: true, accepted: check.tiles.length };
  }

  advance(elapsedMs: number): SimEvent[] {
    if (elapsedMs > 0) this.sinceDeltaMs += elapsedMs;
    const out = this.events;
    this.events = [];
    return out;
  }
}
