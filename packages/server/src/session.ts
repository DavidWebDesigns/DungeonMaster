/**
 * Sesión de una partida en red, sin nada de Colyseus: lobby, cuenta atrás, partida, desconexiones y fin.
 * La sala de Colyseus (`MatchRoom`) solo reenvía mensajes aquí y llama a `tick()` diez veces por segundo.
 * El tiempo se cuenta en ticks (no hay relojes ocultos), así que todo se puede probar sin esperar.
 */
import {
  applyCommand,
  ClientKnowledge,
  computeDelta,
  countStats,
  createMatch,
  emptyPlayerStats,
  newMatchStats,
  MSG,
  step,
  type AckMsg,
  type ColorMsg,
  type CmdMsg,
  type CommandRecord,
  type CountdownMsg,
  type DataSet,
  type EndedMsg,
  type LobbyInfo,
  type LobbyPlayer,
  type MatchStats,
  type MatchState,
  type NickMsg,
  type Phase,
  type PlayerId,
  type PlayerStats,
  type ReadyMsg,
  type StartedMsg,
} from '@dm/shared';

export interface OutMessage {
  /** Id de cliente destinatario, o 'all' para todos los conectados. */
  to: string | 'all';
  type: string;
  payload: unknown;
}

export interface SessionOptions {
  code: string;
  data: DataSet;
  /** Semilla de la partida (por defecto, aleatoria). */
  seed?: () => number;
  /** Segundos de cuenta atrás (por defecto, el de global.json). */
  countdownSeconds?: number;
  maxPlayers?: number;
}

export interface EndedInfo {
  code: string;
  seed: number;
  players: Array<{ id: PlayerId; clientId: string; nick: string; color: number }>;
  log: CommandRecord[];
  result: NonNullable<MatchState['result']>;
  ticks: number;
}

const NICK_MAX = 16;
const COLORS = 4;

/** Nombre de jugador limpio: sin espacios sobrantes ni caracteres de control, con tope de longitud. */
export function cleanNick(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    // Fuera caracteres de control y los símbolos de etiquetas.
    if (code < 32 || code === 127 || ch === '<' || ch === '>') continue;
    out += ch;
  }
  return out.trim().slice(0, NICK_MAX);
}

interface Slot {
  clientId: string;
  nick: string;
  color: number;
  ready: boolean;
  connected: boolean;
  /** En una partida en curso: id de jugador y estado de red. */
  pid: PlayerId;
  known: ClientKnowledge | null;
  disconnectedTick: number;
  lastCommandTick: number;
  /** Mensajes que aún puede mandar (se rellena en cada tick): frena a quien inunde la sala. */
  budget: number;
  needsSnapshot: boolean;
}

export class MatchSession {
  readonly code: string;
  phase: Phase = 'lobby';
  state: MatchState | null = null;
  /** Estadísticas de la partida en curso, para la pantalla de resultados. */
  private stats: MatchStats = new Map();
  private readonly data: DataSet;
  private readonly maxPlayers: number;
  private readonly countdownTicks: number;
  private readonly seedFn: () => number;
  private slots: Slot[] = [];
  private outbox: OutMessage[] = [];
  private countdownLeft = 0;
  private seed = 0;
  private ended: EndedInfo | null = null;

  constructor(opts: SessionOptions) {
    this.code = opts.code;
    this.data = opts.data;
    this.maxPlayers = Math.min(
      opts.maxPlayers ?? opts.data.global.players.max,
      opts.data.global.players.max,
    );
    this.countdownTicks = Math.round(
      (opts.countdownSeconds ?? opts.data.global.match.countdownSeconds) *
        opts.data.global.tickRate,
    );
    this.seedFn = opts.seed ?? (() => Math.floor(Math.random() * 0x7fffffff));
  }

  /* ---------------- consultas ---------------- */

  /** Mensajes pendientes de enviar (y vacía la cola). */
  drain(): OutMessage[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  get lobbyInfo(): LobbyInfo {
    const connected = this.slots.filter((s) => s.connected);
    const host = connected[0]?.clientId;
    const players: LobbyPlayer[] = this.slots.map((s) => ({
      clientId: s.clientId,
      nick: s.nick,
      color: s.color,
      ready: s.ready,
      host: s.clientId === host,
      connected: s.connected,
    }));
    return {
      code: this.code,
      phase: this.phase,
      players,
      minPlayers: this.data.global.players.min,
      maxPlayers: this.maxPlayers,
    };
  }

  /** Datos de la partida terminada (semilla, registro de comandos y resultado), o null si no ha terminado. */
  get endedInfo(): EndedInfo | null {
    return this.ended;
  }

  playerIdOf(clientId: string): PlayerId | null {
    const s = this.slot(clientId);
    return s && this.phase !== 'lobby' && this.phase !== 'countdown' ? s.pid : null;
  }

  private slot(clientId: string): Slot | undefined {
    return this.slots.find((s) => s.clientId === clientId);
  }

  private say(to: string | 'all', type: string, payload: unknown): void {
    this.outbox.push({ to, type, payload });
  }

  private pushLobby(): void {
    this.say('all', MSG.lobby, this.lobbyInfo);
  }

  /* ---------------- lobby ---------------- */

  /** Entra un jugador. Devuelve un texto de error si no puede (partida empezada, sala llena). */
  join(clientId: string, nick: string): { ok: true } | { ok: false; error: string } {
    const existing = this.slot(clientId);
    if (existing) return { ok: true };
    if (this.phase !== 'lobby') return { ok: false, error: 'La partida ya empezó.' };
    if (this.slots.length >= this.maxPlayers) return { ok: false, error: 'La sala está llena.' };
    const used = new Set(this.slots.map((s) => s.color));
    const color = [...Array(COLORS).keys()].find((c) => !used.has(c)) ?? 0;
    this.slots.push({
      clientId,
      nick: cleanNick(nick) || `Jugador ${this.slots.length + 1}`,
      color,
      ready: false,
      connected: true,
      pid: 0,
      known: null,
      disconnectedTick: 0,
      lastCommandTick: 0,
      budget: this.data.global.connection.maxMessagesPerSecond,
      needsSnapshot: false,
    });
    this.pushLobby();
    return { ok: true };
  }

  /** Un jugador se va para siempre (o cierra la pestaña en el lobby). */
  leave(clientId: string): void {
    const s = this.slot(clientId);
    if (!s) return;
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      this.slots = this.slots.filter((k) => k.clientId !== clientId);
      if (this.phase === 'countdown' && this.slots.length < this.data.global.players.min)
        this.backToLobby();
      this.pushLobby();
    } else {
      // En partida, irse es rendirse.
      this.surrenderSlot(s);
      s.connected = false;
    }
  }

  private backToLobby(): void {
    this.phase = 'lobby';
    for (const s of this.slots) s.ready = false;
  }

  /** Se perdió la conexión: en el lobby deja su sitio libre; en partida empieza el plazo de reconexión. */
  disconnect(clientId: string): void {
    const s = this.slot(clientId);
    if (!s) return;
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      this.leave(clientId);
      return;
    }
    s.connected = false;
    s.disconnectedTick = this.state?.tick ?? 0;
  }

  /** El jugador vuelve: recibe de nuevo su identidad y una instantánea de lo que ve. */
  reconnect(clientId: string): boolean {
    const s = this.slot(clientId);
    if (!s || this.phase === 'lobby' || this.phase === 'countdown') return false;
    if (this.state?.players.find((p) => p.id === s.pid)?.eliminated) return false;
    s.connected = true;
    s.known = new ClientKnowledge(this.state!.width * this.state!.height);
    s.needsSnapshot = true;
    this.say(clientId, MSG.started, this.startedFor(s));
    return true;
  }

  private startedFor(s: Slot): StartedMsg {
    return {
      you: s.pid,
      seed: this.seed,
      players: this.slots.map((k) => ({ id: k.pid, nick: k.nick, color: k.color })),
    };
  }

  /* ---------------- mensajes de los clientes ---------------- */

  handle(clientId: string, type: string, payload: unknown): void {
    const s = this.slot(clientId);
    if (!s) return;
    // Presupuesto de mensajes: pasado el límite se descartan sin responder (responder también sería inundar).
    if (s.budget < 1) return;
    s.budget--;
    switch (type) {
      case MSG.ready: {
        if (this.phase !== 'lobby') return;
        s.ready = (payload as ReadyMsg | undefined)?.ready === true;
        this.pushLobby();
        return;
      }
      case MSG.color: {
        if (this.phase !== 'lobby') return;
        const c = (payload as ColorMsg | undefined)?.color;
        if (!Number.isInteger(c) || (c as number) < 0 || (c as number) >= COLORS)
          return this.say(clientId, MSG.error, { message: 'Color no válido.' });
        if (this.slots.some((k) => k !== s && k.color === c))
          return this.say(clientId, MSG.error, { message: 'Ese color ya está cogido.' });
        s.color = c as number;
        this.pushLobby();
        return;
      }
      case MSG.nick: {
        if (this.phase !== 'lobby') return;
        const n = cleanNick((payload as NickMsg | undefined)?.nick);
        if (n) s.nick = n;
        this.pushLobby();
        return;
      }
      case MSG.start:
        return this.tryStart(s);
      case MSG.cmd:
        return this.command(s, payload as CmdMsg);
      default:
        return;
    }
  }

  private tryStart(s: Slot): void {
    if (this.phase !== 'lobby') return;
    const host = this.slots.find((k) => k.connected);
    if (host !== s)
      return this.say(s.clientId, MSG.error, { message: 'Solo el anfitrión puede empezar.' });
    if (this.slots.length < this.data.global.players.min) {
      return this.say(s.clientId, MSG.error, {
        message: `Hacen falta al menos ${this.data.global.players.min} jugadores.`,
      });
    }
    // El anfitrión cuenta como listo al pulsar empezar; los demás deben haberlo marcado.
    s.ready = true;
    if (!this.slots.every((k) => k.ready)) {
      s.ready = false;
      return this.say(s.clientId, MSG.error, {
        message: 'Todos los jugadores deben estar listos.',
      });
    }
    this.phase = 'countdown';
    this.countdownLeft = this.countdownTicks;
    this.pushLobby();
    this.say('all', MSG.countdown, {
      seconds: Math.ceil(this.countdownTicks / this.data.global.tickRate),
    } satisfies CountdownMsg);
  }

  private command(s: Slot, msg: CmdMsg): void {
    if (this.phase !== 'playing' || !this.state) return;
    if (!msg || typeof msg !== 'object' || !Number.isInteger(msg.seq)) return;
    s.lastCommandTick = this.state.tick;
    const res = applyCommand(this.state, this.data, s.pid, msg.cmd);
    const ack: AckMsg = res.ok
      ? { seq: msg.seq, ok: true, accepted: res.accepted }
      : { seq: msg.seq, ok: false, error: res.error };
    this.say(s.clientId, MSG.ack, ack);
  }

  /* ---------------- el reloj ---------------- */

  /** Cada tick devuelve a cada jugador su parte del presupuesto de mensajes por segundo (con tope de un segundo). */
  private refillBudgets(): void {
    const c = this.data.global.connection;
    const perTick = c.maxMessagesPerSecond / this.data.global.tickRate;
    for (const s of this.slots) s.budget = Math.min(c.maxMessagesPerSecond, s.budget + perTick);
  }

  /** Avanza un tick (100 ms). */
  tick(): void {
    this.refillBudgets();
    if (this.phase === 'countdown') return this.tickCountdown();
    if (this.phase !== 'playing' || !this.state) return;
    const state = this.state;
    const events = step(state, this.data);
    countStats(this.stats, events);
    this.checkNetwork(state);

    for (const s of this.slots) {
      if (!s.connected || !s.known) continue;
      const delta = computeDelta(state, this.data, s.pid, s.known, events);
      s.needsSnapshot = false;
      this.say(s.clientId, MSG.frame, delta);
    }
    if (state.status === 'ended' && state.result) this.finish(state);
  }

  private tickCountdown(): void {
    const rate = this.data.global.tickRate;
    this.countdownLeft--;
    if (this.countdownLeft > 0) {
      if (this.countdownLeft % rate === 0)
        this.say('all', MSG.countdown, {
          seconds: this.countdownLeft / rate,
        } satisfies CountdownMsg);
      return;
    }
    this.begin();
  }

  private begin(): void {
    this.seed = this.seedFn();
    // Los ids de jugador salen del orden del lobby (1, 2, ...); la semilla reparte las esquinas.
    this.slots.forEach((s, n) => {
      s.pid = n + 1;
    });
    this.state = createMatch({ playerCount: this.slots.length }, this.data, this.seed);
    this.phase = 'playing';
    this.stats = newMatchStats(this.slots.map((s) => s.pid));
    for (const s of this.slots) {
      s.known = new ClientKnowledge(this.state.width * this.state.height);
      s.needsSnapshot = true;
      s.lastCommandTick = 0;
      this.say(s.clientId, MSG.started, this.startedFor(s));
    }
  }

  /** 120 s sin conexión o 5 min sin dar órdenes cuentan como rendición. */
  private checkNetwork(state: MatchState): void {
    const g = this.data.global;
    const reconnectTicks = Math.round(g.connection.reconnectSeconds * g.tickRate);
    const idleTicks = Math.round(g.connection.inactivitySurrenderSeconds * g.tickRate);
    for (const s of this.slots) {
      const p = state.players.find((k) => k.id === s.pid);
      if (!p || p.eliminated) continue;
      if (!s.connected && state.tick - s.disconnectedTick >= reconnectTicks) this.surrenderSlot(s);
      else if (s.connected && state.tick - s.lastCommandTick >= idleTicks) this.surrenderSlot(s);
    }
  }

  private surrenderSlot(s: Slot): void {
    if (!this.state || this.state.status === 'ended') return;
    const p = this.state.players.find((k) => k.id === s.pid);
    if (!p || p.eliminated) return;
    applyCommand(this.state, this.data, s.pid, { type: 'surrender' });
  }

  private finish(state: MatchState): void {
    this.phase = 'ended';
    const result = state.result!;
    this.ended = {
      code: this.code,
      seed: this.seed,
      players: this.slots.map((s) => ({
        id: s.pid,
        clientId: s.clientId,
        nick: s.nick,
        color: s.color,
      })),
      log: state.log,
      result,
      ticks: state.tick,
    };
    const msg: EndedMsg = {
      result,
      stats: this.slots.map((s) => ({
        id: s.pid,
        nick: s.nick,
        ...roundedStats(this.stats.get(s.pid) ?? emptyPlayerStats()),
      })),
    };
    this.say('all', MSG.ended, msg);
    this.pushLobby();
  }
}

function roundedStats(s: PlayerStats) {
  return { ...s, goldMined: Math.round(s.goldMined), heartDamage: Math.round(s.heartDamage) };
}
