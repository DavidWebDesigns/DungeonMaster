import { PLAYER_COLORS } from '../render/palette';
import type { OnlineState } from './connection';

const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;

export interface MenuProps {
  nick: string;
  code: string;
  error: string | null;
  busy: boolean;
  onNick(v: string): void;
  onCode(v: string): void;
  onCreate(): void;
  onJoin(): void;
}

export function Menu(p: MenuProps) {
  return (
    <div class="screen">
      <div class="card">
        <h1>Dungeon Master</h1>
        <p class="sub">Partida en línea · 2 a 4 jugadores</p>
        <label>
          Tu apodo
          <input
            class="nick"
            maxLength={16}
            value={p.nick}
            onInput={(e) => p.onNick((e.target as HTMLInputElement).value)}
          />
        </label>
        <button class="primary create" disabled={p.busy} onClick={p.onCreate}>
          Crear sala
        </button>
        <div class="or">o únete con un código</div>
        <div class="joinrow">
          <input
            class="code"
            maxLength={6}
            placeholder="ABCDEF"
            value={p.code}
            onInput={(e) => p.onCode((e.target as HTMLInputElement).value.toUpperCase())}
          />
          <button class="join" disabled={p.busy || p.code.length !== 6} onClick={p.onJoin}>
            Unirse
          </button>
        </div>
        {p.error && <div class="error">{p.error}</div>}
        <a class="solo" href="/">
          Jugar solo
        </a>
      </div>
    </div>
  );
}

export interface LobbyProps {
  state: OnlineState;
  onReady(ready: boolean): void;
  onColor(c: number): void;
  onStart(): void;
  onLeave(): void;
}

export function Lobby({ state, onReady, onColor, onStart, onLeave }: LobbyProps) {
  const lobby = state.lobby;
  if (!lobby)
    return (
      <div class="screen">
        <div class="card">Conectando…</div>
      </div>
    );
  const me = lobby.players.find((p) => p.clientId === state.me);
  const isHost = !!me?.host;
  const taken = new Set(lobby.players.map((p) => p.color));
  const everyoneReady =
    lobby.players.length >= lobby.minPlayers && lobby.players.every((p) => p.ready || p.host);
  const link = `${location.origin}${location.pathname}?mode=online&code=${lobby.code}`;
  return (
    <div class="screen">
      <div class="card lobby">
        <div class="codebox" title="Comparte este código con tus amigos">
          <span>Código de sala</span>
          <strong class="roomcode">{lobby.code}</strong>
          <small class="link">{link}</small>
        </div>
        <ul class="players">
          {lobby.players.map((p) => (
            <li key={p.clientId} class={p.clientId === state.me ? 'me' : ''}>
              <span
                class="swatch"
                style={{ background: css(PLAYER_COLORS[p.color] ?? [1, 1, 1]) }}
              />
              <span class="pname">
                {p.nick}
                {p.host ? ' ★' : ''}
              </span>
              <span class={`pstate ${p.ready || p.host ? 'ok' : ''}`}>
                {p.host ? 'Anfitrión' : p.ready ? 'Listo' : 'Esperando'}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.max(0, lobby.maxPlayers - lobby.players.length) }, (_, i) => (
            <li key={`e${i}`} class="empty">
              Esperando jugador…
            </li>
          ))}
        </ul>
        <div class="colors">
          Tu color:
          {PLAYER_COLORS.map((c, i) => (
            <button
              key={i}
              class={`swatch pick${me?.color === i ? ' sel' : ''}`}
              disabled={taken.has(i) && me?.color !== i}
              style={{ background: css(c) }}
              onClick={() => onColor(i)}
              aria-label={`Color ${i + 1}`}
            />
          ))}
        </div>
        {state.countdown !== null && state.screen === 'countdown' ? (
          <div class="countdown">La partida empieza en {state.countdown}…</div>
        ) : (
          <div class="actions">
            {!isHost && (
              <button class="primary ready" onClick={() => onReady(!me?.ready)}>
                {me?.ready ? 'No estoy listo' : '¡Listo!'}
              </button>
            )}
            {isHost && (
              <button class="primary start" disabled={!everyoneReady} onClick={onStart}>
                Empezar partida
              </button>
            )}
            <button class="leave" onClick={onLeave}>
              Salir
            </button>
          </div>
        )}
        {state.error && <div class="error">{state.error}</div>}
        {isHost && !everyoneReady && (
          <div class="hint">
            Hacen falta al menos {lobby.minPlayers} jugadores y que todos estén listos.
          </div>
        )}
      </div>
    </div>
  );
}
