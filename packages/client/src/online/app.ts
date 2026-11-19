/**
 * Pantallas de la partida en línea (menú y lobby) y paso al juego cuando el servidor empieza la partida.
 */
import { render } from 'preact';
import { createElement } from 'preact';
import { normalizeCode, type DataSet, type EndedMsg } from '@dm/shared';
import { Game } from '../game';
import { errorMessage } from '../input/messages';
import { NetSource } from '../net/netSource';
import { OnlineConnection } from './connection';
import { Lobby, Menu } from './Lobby';

const NICK_KEY = 'dm.nick';

export function startOnline(
  host: HTMLElement,
  data: DataSet,
  params: URLSearchParams,
): OnlineConnection {
  const conn = new OnlineConnection();
  const screen = document.createElement('div');
  screen.className = 'online';
  host.appendChild(screen);
  const status = document.createElement('div');
  status.className = 'netstatus';
  document.body.appendChild(status);

  let nick = localStorage.getItem(NICK_KEY) ?? '';
  let code = normalizeCode(params.get('code'));
  let busy = false;
  let game: Game | null = null;

  const draw = () => {
    const s = conn.state;
    status.textContent = s.reconnecting ? 'Reconectando con el servidor…' : '';
    status.style.display = s.reconnecting ? 'block' : 'none';
    if (s.screen === 'playing') {
      // El juego se dibuja solo; la pantalla de lobby ya no hace falta.
      render(null, screen);
      screen.style.display = 'none';
      return;
    }
    screen.style.display = 'block';
    if (s.screen === 'menu' || s.screen === 'connecting') {
      render(
        createElement(Menu, {
          nick,
          code,
          error: s.error,
          busy: busy || s.screen === 'connecting',
          onNick: (v: string) => {
            nick = v;
            localStorage.setItem(NICK_KEY, v);
            draw();
          },
          onCode: (v: string) => {
            code = normalizeCode(v);
            draw();
          },
          onCreate: () => void conn.create(nick),
          onJoin: () => void conn.join(code, nick),
        }),
        screen,
      );
    } else {
      render(
        createElement(Lobby, {
          state: s,
          onReady: (r: boolean) => conn.setReady(r),
          onColor: (c: number) => conn.setColor(c),
          onStart: () => conn.start(),
          onLeave: () => conn.leave(),
        }),
        screen,
      );
    }
  };
  conn.subscribe(draw);
  draw();

  conn.onStart = (info, transport) => {
    const net = new NetSource(data, info.you, transport);
    net.onEnded = (msg: EndedMsg) => game?.setEndStats(msg);
    // El primer delta (la instantánea) trae el mapa y tu base: se espera a tenerlo para colocar la cámara.
    const wait = () => {
      if (net.framesApplied === 0) return void requestAnimationFrame(wait);
      game = new Game(host, data, net);
      net.onReject = (e) => game?.notify(errorMessage(e));
      game.start();
      (window as unknown as { __dm: Game }).__dm = game;
    };
    wait();
  };

  // Enlace compartido (?code=ABCDEF) o recarga en plena partida: se intenta volver o unirse solo.
  void (async () => {
    if (await conn.tryReconnect()) return;
    if (code.length === 6 && nick.trim()) {
      busy = true;
      await conn.join(code, nick);
      busy = false;
    }
  })();
  return conn;
}
