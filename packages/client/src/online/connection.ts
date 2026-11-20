/**
 * Conexión del cliente con el servidor de partidas (Colyseus): crear o unirse a una sala, lobby, empezar y reconectar.
 * No sabe nada de dibujo: avisa de los cambios con `subscribe` y entrega la conexión lista cuando empieza la partida.
 */
import { Client, type Room } from '@colyseus/sdk';
import { MSG, generateCode, normalizeCode, type LobbyInfo, type StartedMsg } from '@dm/shared';
import type { Transport } from '../net/netSource';

export type Screen = 'menu' | 'connecting' | 'lobby' | 'countdown' | 'playing';

export interface OnlineState {
  screen: Screen;
  lobby: LobbyInfo | null;
  /** Segundos que faltan para empezar (durante la cuenta atrás). */
  countdown: number | null;
  /** Mi id de cliente en la sala. */
  me: string | null;
  error: string | null;
  /** Conexión caída que se intenta recuperar. */
  reconnecting: boolean;
}

const TOKEN_KEY = 'dm.reconnect';

/** Dirección del servidor: la de VITE_SERVER_URL o el mismo equipo en el puerto 2567. */
export function serverUrl(): string {
  // Vite solo sustituye esta forma literal al compilar (no sirve acceder a `import.meta.env` con un cast).
  const env = import.meta.env.VITE_SERVER_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:2567`;
}

export class OnlineConnection {
  state: OnlineState = {
    screen: 'menu',
    lobby: null,
    countdown: null,
    me: null,
    error: null,
    reconnecting: false,
  };
  room: Room | null = null;
  started: StartedMsg | null = null;
  /** Se llama cuando la partida empieza: aquí se crea el juego con la conexión. */
  onStart: (info: StartedMsg, transport: Transport) => void = () => {};
  private readonly listeners = new Set<() => void>();
  private readonly client: Client;
  private readonly handlers = new Map<string, Array<(p: never) => void>>();

  constructor(url: string = serverUrl()) {
    this.client = new Client(url);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<OnlineState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  async create(nick: string): Promise<void> {
    await this.connect(() =>
      this.client.create('match', { code: generateCode(Math.random), nick }),
    );
  }

  async join(code: string, nick: string): Promise<void> {
    const c = normalizeCode(code);
    if (c.length !== 6) return this.set({ error: 'El código tiene 6 letras.' });
    await this.connect(() => this.client.join('match', { code: c, nick }));
  }

  /** Intenta volver a una partida en curso con el token guardado (tras recargar la página). */
  async tryReconnect(): Promise<boolean> {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) return false;
    try {
      this.set({ screen: 'connecting', error: null });
      this.attach(await this.client.reconnect(token));
      return true;
    } catch {
      sessionStorage.removeItem(TOKEN_KEY);
      this.set({ screen: 'menu' });
      return false;
    }
  }

  private async connect(make: () => Promise<Room>): Promise<void> {
    this.set({ screen: 'connecting', error: null });
    try {
      this.attach(await make());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.set({
        screen: 'menu',
        error: /not found|no.*room|locked/i.test(msg)
          ? 'No existe esa sala (o ya empezó).'
          : /llen|Ya existe/.test(msg)
            ? msg
            : `No se pudo conectar: ${msg}`,
      });
    }
  }

  private attach(room: Room): void {
    this.room = room;
    sessionStorage.setItem(TOKEN_KEY, room.reconnectionToken);
    this.set({ me: room.sessionId, screen: 'lobby', reconnecting: false });
    room.onMessage('*', (type: string | number, payload: unknown) => {
      const t = String(type);
      if (t === MSG.lobby) {
        const lobby = payload as LobbyInfo;
        this.set({
          lobby,
          screen:
            lobby.phase === 'playing'
              ? 'playing'
              : lobby.phase === 'countdown'
                ? 'countdown'
                : this.state.screen === 'playing'
                  ? 'playing'
                  : 'lobby',
        });
      } else if (t === MSG.countdown) {
        this.set({ screen: 'countdown', countdown: (payload as { seconds: number }).seconds });
      } else if (t === MSG.error) {
        this.set({ error: (payload as { message: string }).message });
      } else if (t === MSG.started) {
        const first = this.started === null;
        this.started = payload as StartedMsg;
        this.set({ screen: 'playing', countdown: null });
        if (first) this.onStart(this.started, this.transport());
      }
      for (const h of this.handlers.get(t) ?? []) h(payload as never);
    });
    room.onDrop(() => this.set({ reconnecting: true }));
    room.onReconnect(() => this.set({ reconnecting: false }));
    room.onLeave(() => {
      if (this.state.screen !== 'playing') this.set({ screen: 'menu' });
      else this.set({ reconnecting: true });
    });
  }

  /** Transporte para NetSource: reparte los mensajes recibidos y envía por la sala. */
  transport(): Transport {
    return {
      send: (type, payload) => this.room?.send(type, payload),
      onMessage: (type, handler) => {
        const list = this.handlers.get(type) ?? [];
        list.push(handler);
        this.handlers.set(type, list);
      },
    };
  }

  setReady(ready: boolean): void {
    this.room?.send(MSG.ready, { ready });
  }
  setColor(color: number): void {
    this.room?.send(MSG.color, { color });
  }
  start(): void {
    this.set({ error: null });
    this.room?.send(MSG.start, {});
  }
  leave(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    void this.room?.leave();
    this.room = null;
    this.set({ screen: 'menu', lobby: null, countdown: null, error: null });
  }
}
