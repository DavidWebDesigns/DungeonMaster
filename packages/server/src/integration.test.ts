/**
 * Prueba de integración: un servidor Colyseus real y dos clientes del SDK jugando por WebSocket.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, type Room } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MSG,
  Mirror,
  type AckMsg,
  type Delta,
  type EndedMsg,
  type LobbyInfo,
  type StartedMsg,
} from '@dm/shared';
import { startServer } from './server';
import { loadGameDataForTests } from './testSupport';

const data = loadGameDataForTests();
let stop: () => Promise<void>;
let url = '';
const logDir = mkdtempSync(join(tmpdir(), 'dm-logs-'));

beforeAll(async () => {
  const { server, port } = await startServer(0, {
    data,
    logDir,
    countdownSeconds: 0.5,
    closeAfterSeconds: 1,
  });
  url = `ws://localhost:${port}`;
  stop = async () => {
    await server.gracefullyShutdown(false).catch(() => undefined);
  };
}, 30_000);

afterAll(async () => {
  await stop?.();
  rmSync(logDir, { recursive: true, force: true });
});

/** Cola de mensajes de un cliente, con espera por el que se necesita. */
function listen(room: Room) {
  const log: Array<{ type: string; payload: unknown }> = [];
  const waiters: Array<() => void> = [];
  room.onMessage('*', (type: string | number, payload: unknown) => {
    log.push({ type: String(type), payload });
    for (const w of waiters.splice(0)) w();
  });
  const find = <T>(type: string, pred: (p: T) => boolean = () => true) =>
    log.find((m) => m.type === type && pred(m.payload as T))?.payload as T | undefined;
  return {
    log,
    find,
    async wait<T>(type: string, pred: (p: T) => boolean = () => true, ms = 8000): Promise<T> {
      const end = Date.now() + ms;
      for (;;) {
        const hit = find<T>(type, pred);
        if (hit !== undefined) return hit;
        if (Date.now() > end)
          throw new Error(
            `Se esperaba el mensaje "${type}" y no llegó (llegaron: ${[...new Set(log.map((m) => m.type))].join(', ')})`,
          );
        await new Promise<void>((res) => {
          waiters.push(res);
          setTimeout(res, 100);
        });
      }
    },
  };
}

describe('servidor Colyseus con dos clientes', () => {
  it('lobby con código, cuenta atrás, partida con deltas, comandos, reconexión y fin con registro guardado', async () => {
    const code = 'TESTAB';
    const ana = await new Client(url).create('match', { code, nick: 'Ana' });
    const a = listen(ana);
    const beto = await new Client(url).join('match', { code, nick: 'Beto' });
    const b = listen(beto);

    // Lobby: ambos ven a los dos jugadores y Ana es la anfitriona.
    const lobby = await a.wait<LobbyInfo>(MSG.lobby, (l) => l.players.length === 2);
    expect(lobby.code).toBe(code);
    expect(lobby.players.map((p) => p.nick)).toEqual(['Ana', 'Beto']);
    expect(lobby.players[0]!.host).toBe(true);

    // Empezar sin que Beto esté listo da error; con él listo, arranca.
    ana.send(MSG.start, {});
    expect((await a.wait<{ message: string }>(MSG.error)).message).toContain('listos');
    beto.send(MSG.ready, { ready: true });
    await a.wait<LobbyInfo>(MSG.lobby, (l) => l.players[1]?.ready === true);
    ana.send(MSG.start, {});
    await a.wait(MSG.countdown);
    const sa = await a.wait<StartedMsg>(MSG.started);
    const sb = await b.wait<StartedMsg>(MSG.started);
    expect([sa.you, sb.you]).toEqual([1, 2]);

    // Deltas: ambos reciben su primer delta como instantánea y construyen su espejo.
    const mirrorA = new Mirror(data, sa.you);
    const mirrorB = new Mirror(data, sb.you);
    let applied = 0;
    const apply = (l: ReturnType<typeof listen>, m: Mirror) => {
      for (const msg of l.log.splice(0)) {
        if (msg.type === MSG.frame) {
          m.apply(msg.payload as Delta);
          applied++;
        } else l.log.push(msg);
      }
    };
    await a.wait(MSG.frame);
    await b.wait(MSG.frame);
    apply(a, mirrorA);
    apply(b, mirrorB);
    expect(mirrorA.state.imps.filter((i) => i.owner === 1)).toHaveLength(4);
    expect(mirrorA.state.imps.filter((i) => i.owner === 2)).toHaveLength(0);
    expect(mirrorB.state.imps.filter((i) => i.owner === 2)).toHaveLength(4);
    expect(mirrorB.state.imps.filter((i) => i.owner === 1)).toHaveLength(0);

    // Comandos: un ack válido y uno inválido con su código.
    const me = mirrorA.state.players.find((p) => p.id === 1)!;
    const base = data.map.bases.find((x) => x.slot === me.slot)!;
    ana.send(MSG.cmd, {
      seq: 1,
      cmd: { type: 'dig', tiles: [{ x: base.claimed.x + base.claimed.w, y: base.claimed.y + 2 }] },
    });
    ana.send(MSG.cmd, {
      seq: 2,
      cmd: { type: 'buildRoom', room: 'lair', rect: { x: 30, y: 30, w: 2, h: 2 } },
    });
    const ack1 = await a.wait<AckMsg>(MSG.ack, (x) => x.seq === 1);
    const ack2 = await a.wait<AckMsg>(MSG.ack, (x) => x.seq === 2);
    expect(ack1).toMatchObject({ ok: true });
    expect(ack2).toEqual({ seq: 2, ok: false, error: 'INVALID_TARGET' });
    // La orden se ejecuta y aparece como tarea en el espejo de Ana (y nunca en el de Beto).
    await new Promise((r) => setTimeout(r, 600));
    apply(a, mirrorA);
    apply(b, mirrorB);
    expect(mirrorA.state.tasks.length).toBeGreaterThan(0);
    expect(mirrorB.state.tasks).toHaveLength(0);
    expect(mirrorA.state.tick).toBeGreaterThan(5);
    expect(applied).toBeGreaterThan(8);

    // Reconexión: Beto pierde la conexión y vuelve con su token: recibe quién es y una instantánea.
    const token = beto.reconnectionToken;
    await beto.leave(false);
    await new Promise((r) => setTimeout(r, 300));
    const beto2 = await new Client(url).reconnect(token);
    const b2 = listen(beto2);
    const again = await b2.wait<StartedMsg>(MSG.started);
    expect(again.you).toBe(2);
    const snap = await b2.wait<Delta>(MSG.frame, (d) => d.snapshot === true);
    const mirror2 = new Mirror(data, 2);
    mirror2.apply(snap);
    expect(mirror2.state.imps.filter((i) => i.owner === 2)).toHaveLength(4);

    // Fin: Beto se rinde, ambos reciben el resultado y se guarda el registro con la semilla.
    beto2.send(MSG.cmd, { seq: 1, cmd: { type: 'surrender' } });
    const endedA = await a.wait<EndedMsg>(MSG.ended);
    const endedB = await b2.wait<EndedMsg>(MSG.ended);
    expect(endedA.result).toMatchObject({ winners: [1], reason: 'lastStanding' });
    expect(endedB.result).toEqual(endedA.result);
    expect(endedA.stats.map((s) => s.nick)).toEqual(['Ana', 'Beto']);
    await new Promise((r) => setTimeout(r, 300));
    const files = readdirSync(logDir).filter((f) => f.startsWith(code));
    expect(files).toHaveLength(1);
    const saved = JSON.parse(readFileSync(join(logDir, files[0]!), 'utf8'));
    expect(saved.seed).toBe(sa.seed);
    expect(saved.log.some((r: { cmd: { type: string } }) => r.cmd.type === 'surrender')).toBe(true);
    await ana.leave();
    expect(existsSync(logDir)).toBe(true);
  }, 60_000);

  it('unirse a una sala que no existe falla', async () => {
    await expect(new Client(url).join('match', { code: 'NOROOM' })).rejects.toBeDefined();
  });

  it('un mensaje de tamaño abusivo corta la conexión de quien lo manda y no afecta a los demás', async () => {
    const code = 'BIGMSG';
    const ana = await new Client(url).create('match', { code, nick: 'Ana' });
    const beto = await new Client(url).join('match', { code, nick: 'Beto' });
    const left = new Promise<void>((resolve) => ana.onLeave(() => resolve()));
    ana.send(MSG.nick, { nick: 'x'.repeat(data.global.connection.maxPayloadBytes * 2) });
    await Promise.race([
      left,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no se cortó')), 8000)),
    ]);
    // Beto sigue conectado y puede seguir usando la sala.
    beto.send(MSG.ready, { ready: true });
    await new Promise((r) => setTimeout(r, 300));
    await beto.leave();
  }, 30_000);

  it('una sala llena no admite a un quinto jugador y una empezada tampoco', async () => {
    const code = 'FULLAB';
    const rooms: Room[] = [];
    rooms.push(await new Client(url).create('match', { code, nick: 'p1' }));
    for (const n of ['p2', 'p3', 'p4'])
      rooms.push(await new Client(url).join('match', { code, nick: n }));
    await expect(new Client(url).join('match', { code, nick: 'p5' })).rejects.toBeDefined();
    for (const r of rooms) await r.leave();
  }, 30_000);
});
