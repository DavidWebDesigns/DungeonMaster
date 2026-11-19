import { describe, expect, it } from 'vitest';
import {
  ClientKnowledge,
  MSG,
  applyCommand,
  computeDelta,
  createMatch,
  step,
  type AckMsg,
  type Delta,
  type MatchState,
} from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { NetSource, type Transport } from './netSource';

const data = loadGameData();

/** Transporte falso: guarda lo enviado y deja entregar mensajes a mano. */
function fakeNet() {
  const sent: Array<{ type: string; payload: unknown }> = [];
  const handlers = new Map<string, (p: never) => void>();
  const net: Transport = {
    send: (type, payload) => sent.push({ type, payload }),
    onMessage: (type, h) => handlers.set(type, h),
  };
  return {
    net,
    sent,
    deliver: (type: string, payload: unknown) => handlers.get(type)!(payload as never),
  };
}

/** Servidor de mentira: una partida real de 2 jugadores de la que se sacan los deltas del jugador 1. */
function server() {
  const state: MatchState = createMatch({ playerCount: 2 }, data, 4);
  data.global.portal.attractIntervalSeconds = 100000;
  const known = new ClientKnowledge(64 * 64);
  const frame = (events: Parameters<typeof computeDelta>[4] = []): Delta =>
    computeDelta(state, data, 1, known, events);
  return { state, frame };
}

describe('NetSource', () => {
  it('reconstruye el estado de lo que ve el jugador a partir de los deltas', () => {
    const f = fakeNet();
    const srv = server();
    const src = new NetSource(data, 1, f.net);
    f.deliver(MSG.frame, JSON.parse(JSON.stringify(srv.frame())));
    expect(src.state.imps.filter((i) => i.owner === 1)).toHaveLength(4);
    expect(src.state.imps.filter((i) => i.owner === 2)).toHaveLength(0);
    expect(src.state.players.find((p) => p.id === 1)!.gold).toBe(5000);
    expect(src.versus).toBe(true);
    expect(src.localPlayer).toBe(1);
  });

  it('una orden válida se envía con su número y se anuncia como aceptada; una inválida se rechaza sin salir al servidor', () => {
    const f = fakeNet();
    const srv = server();
    const src = new NetSource(data, 1, f.net);
    f.deliver(MSG.frame, srv.frame());
    const mine = srv.state.players[0]!;
    const base = data.map.bases.find((b) => b.slot === mine.slot)!;
    const ok = src.send({
      type: 'dig',
      tiles: [{ x: base.claimed.x + base.claimed.w, y: base.claimed.y + 2 }],
    });
    expect(ok).toEqual({ ok: true, accepted: 1 });
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]).toMatchObject({ type: MSG.cmd, payload: { seq: 1 } });
    // Sin oro suficiente: el cliente lo sabe sin preguntar.
    srv.state.players[0]!.gold = 0;
    f.deliver(MSG.frame, srv.frame());
    expect(
      src.send({
        type: 'buildRoom',
        room: 'lair',
        rect: { x: base.claimed.x + 4, y: base.claimed.y, w: 2, h: 2 },
      }),
    ).toEqual({ ok: false, error: 'NO_GOLD' });
    expect(f.sent).toHaveLength(1);
  });

  it('mientras no llega la confirmación hay un fantasma de la orden, y desaparece al confirmarse y llegar el siguiente delta', () => {
    const f = fakeNet();
    const srv = server();
    const src = new NetSource(data, 1, f.net);
    f.deliver(MSG.frame, srv.frame());
    const mine = srv.state.players[0]!;
    const base = data.map.bases.find((b) => b.slot === mine.slot)!;
    src.send({
      type: 'dig',
      tiles: [{ x: base.claimed.x + base.claimed.w, y: base.claimed.y + 2 }],
    });
    expect(src.ghosts).toHaveLength(1);
    f.deliver(MSG.ack, { seq: 1, ok: true, accepted: 1 } satisfies AckMsg);
    expect(src.ghosts).toHaveLength(1); // confirmada, pero el estado aún no lo refleja
    step(srv.state, data);
    f.deliver(MSG.frame, srv.frame());
    expect(src.ghosts).toHaveLength(0);
  });

  it('si el servidor rechaza una orden, avisa del motivo y quita el fantasma', () => {
    const f = fakeNet();
    const srv = server();
    const src = new NetSource(data, 1, f.net);
    f.deliver(MSG.frame, srv.frame());
    const rejected: string[] = [];
    src.onReject = (e) => rejected.push(e);
    const mine = srv.state.players[0]!;
    const base = data.map.bases.find((b) => b.slot === mine.slot)!;
    src.send({
      type: 'dig',
      tiles: [{ x: base.claimed.x + base.claimed.w, y: base.claimed.y + 2 }],
    });
    f.deliver(MSG.ack, { seq: 1, ok: false, error: 'RATE_LIMIT' } satisfies AckMsg);
    expect(rejected).toEqual(['RATE_LIMIT']);
    expect(src.ghosts).toHaveLength(0);
  });

  it('interpola: guarda las posiciones anteriores y alpha va de 0 a 1 entre deltas', () => {
    const f = fakeNet();
    const srv = server();
    const src = new NetSource(data, 1, f.net);
    f.deliver(MSG.frame, srv.frame());
    const imp = srv.state.imps.find((i) => i.owner === 1)!;
    const x0 = imp.x;
    imp.x += 0.25;
    f.deliver(MSG.frame, srv.frame());
    expect(src.previous.get(imp.id)!.x).toBeCloseTo(x0, 5);
    expect(src.state.imps.find((i) => i.id === imp.id)!.x).toBeCloseTo(x0 + 0.25, 5);
    expect(src.alpha).toBe(0);
    src.advance(50);
    expect(src.alpha).toBeCloseTo(0.5);
    src.advance(500);
    expect(src.alpha).toBe(1);
    f.deliver(MSG.frame, srv.frame());
    expect(src.alpha).toBe(0);
  });

  it('entrega los eventos de los deltas y deduce los cambios de terreno de los tiles', () => {
    const f = fakeNet();
    const srv = server();
    const src = new NetSource(data, 1, f.net);
    f.deliver(MSG.frame, srv.frame());
    src.advance(0);
    const tile = 6 * 64 + 6;
    srv.state.terrain[tile] = data.terrain.findIndex((t) => t.id === 'earth');
    f.deliver(MSG.frame, srv.frame([{ type: 'levelUp', playerId: 1, creatureId: 1, level: 2 }]));
    const ev = src.advance(0);
    expect(ev.some((e) => e.type === 'levelUp')).toBe(true);
    expect(ev.some((e) => e.type === 'tileChanged' && e.tile === tile)).toBe(true);
    expect(src.advance(0)).toEqual([]);
  });

  it('una instantánea tras reconectar sustituye el estado entero sin llenar de eventos de terreno', () => {
    const f = fakeNet();
    const srv = server();
    const src = new NetSource(data, 1, f.net);
    f.deliver(MSG.frame, srv.frame());
    src.advance(0);
    const again = computeDelta(srv.state, data, 1, new ClientKnowledge(64 * 64));
    f.deliver(MSG.frame, again);
    expect(again.snapshot).toBe(true);
    expect(src.advance(0).filter((e) => e.type === 'tileChanged')).toHaveLength(0);
    expect(src.state.imps.filter((i) => i.owner === 1)).toHaveLength(4);
  });

  it('el resultado y las estadísticas llegan con el mensaje de fin', () => {
    const f = fakeNet();
    const src = new NetSource(data, 1, f.net);
    let got = false;
    src.onEnded = () => (got = true);
    f.deliver(MSG.ended, { result: { winners: [1], reason: 'lastStanding', tick: 9 }, stats: [] });
    expect(got).toBe(true);
    expect(src.endedMsg!.result.winners).toEqual([1]);
  });
});

void applyCommand;
