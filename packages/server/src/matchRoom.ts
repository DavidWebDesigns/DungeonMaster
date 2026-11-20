/**
 * Sala de Colyseus de una partida. Es solo el pegamento con la red: toda la lógica vive en `MatchSession`.
 * Usamos Colyseus para salas, códigos y reconexión; los datos de la partida viajan como mensajes propios
 * (deltas filtrados por jugador, ver packages/shared/src/net), no como estado sincronizado.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Room, type Client } from '@colyseus/core';
import { MSG, generateCode, normalizeCode, type DataSet } from '@dm/shared';
import { MatchSession, cleanNick } from './session';

/** Opciones del servidor compartidas por todas las salas. */
export interface ServerConfig {
  data: DataSet;
  /** Carpeta donde se guardan los registros de las partidas terminadas (si se indica). */
  logDir?: string;
  /** Segundos que la sala sigue abierta tras terminar la partida. */
  closeAfterSeconds?: number;
  /** Cuenta atrás en segundos (por defecto, la de global.json). */
  countdownSeconds?: number;
}

let config: ServerConfig | null = null;
export function configureServer(c: ServerConfig): void {
  config = c;
}

export class MatchRoom extends Room {
  override maxClients = 4;
  /** Códigos de las salas abiertas en este proceso: sirve para limitar cuántas hay y evitar códigos repetidos. */
  private static readonly liveCodes = new Set<string>();
  private liveCode: string | null = null;
  private session!: MatchSession;
  private cfg!: ServerConfig;
  private accumulatorMs = 0;
  private closing = false;

  override async onCreate(options: { code?: string }): Promise<void> {
    if (!config) throw new Error('El servidor no está configurado (configureServer).');
    this.cfg = config;
    const code = normalizeCode(options.code) || generateCode(Math.random);
    const live = MatchRoom.liveCodes;
    if (live.size >= this.cfg.data.global.connection.maxRooms)
      throw new Error('El servidor está lleno: hay demasiadas salas abiertas.');
    if (live.has(code)) throw new Error('Ya existe una sala con ese código.');
    live.add(code);
    this.liveCode = code;
    this.session = new MatchSession({
      code,
      data: this.cfg.data,
      countdownSeconds: this.cfg.countdownSeconds,
    });
    await this.setMetadata({ code });
    this.onMessage('*', (client, type, payload) => {
      this.session.handle(client.sessionId, String(type), payload);
      this.flush();
    });
    // Diez ticks por segundo de reloj: si el servidor se retrasa, recupera los que debe (con tope).
    const tickMs = 1000 / this.cfg.data.global.tickRate;
    this.setSimulationInterval((dt) => {
      this.accumulatorMs += dt;
      let ran = 0;
      while (this.accumulatorMs >= tickMs && ran < 5) {
        this.accumulatorMs -= tickMs;
        ran++;
        this.session.tick();
      }
      if (ran === 5) this.accumulatorMs = 0;
      this.flush();
    }, tickMs);
  }

  override onJoin(client: Client, options: { nick?: string }): void {
    const res = this.session.join(client.sessionId, cleanNick(options?.nick));
    if (!res.ok) throw new Error(res.error);
    this.flush();
  }

  /** Se cayó la conexión: en partida se le da el plazo de reconexión; en el lobby se libera su sitio. */
  override async onDrop(client: Client): Promise<void> {
    const playing = this.session.phase === 'playing';
    this.session.disconnect(client.sessionId);
    this.flush();
    if (!playing) return;
    await this.allowReconnection(client, this.cfg.data.global.connection.reconnectSeconds);
  }

  override onReconnect(client: Client): void {
    this.session.reconnect(client.sessionId);
    this.flush();
  }

  /** Se fue del todo (por su cuenta o agotado el plazo): en partida es rendirse. */
  override onLeave(client: Client): void {
    this.session.leave(client.sessionId);
    this.flush();
  }

  /** La sala se cierra: su código queda libre y deja de contar para el límite. */
  override onDispose(): void {
    if (this.liveCode) MatchRoom.liveCodes.delete(this.liveCode);
    this.liveCode = null;
  }

  /** Envía lo que la sesión tiene pendiente y reacciona a los cambios de fase. */
  private flush(): void {
    for (const m of this.session.drain()) {
      if (m.to === 'all') this.broadcast(m.type, m.payload);
      else this.clients.getById(m.to)?.send(m.type, m.payload);
    }
    if (this.session.phase !== 'lobby') void this.lock();
    else void this.unlock();
    const ended = this.session.endedInfo;
    if (ended && !this.closing) {
      this.closing = true;
      if (this.cfg.logDir) {
        try {
          mkdirSync(this.cfg.logDir, { recursive: true });
          writeFileSync(
            join(this.cfg.logDir, `${ended.code}-${Date.now()}.json`),
            JSON.stringify(ended),
          );
        } catch (e) {
          console.error('No se pudo guardar el registro de la partida:', e);
        }
      }
      // La sala se cierra al cabo de un rato para que todos vean los resultados.
      this.clock.setTimeout(
        () => void this.disconnect(),
        (this.cfg.closeAfterSeconds ?? 60) * 1000,
      );
    }
  }
}

void MSG;
