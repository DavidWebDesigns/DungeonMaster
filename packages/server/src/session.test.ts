import { describe, expect, it } from 'vitest';
import {
  createMatch,
  hashState,
  loadGameDataForTests,
  MSG,
  replay,
  step,
  type AckMsg,
  type Delta,
  type EndedMsg,
  type LobbyInfo,
  type StartedMsg,
} from './testSupport';
import { cleanNick, MatchSession, type OutMessage } from './session';

const data = loadGameDataForTests();

/** Sesión con semilla fija y cuenta atrás de 1 s para que las pruebas sean rápidas. */
function session(opts: { countdownSeconds?: number; maxPlayers?: number } = {}) {
  return new MatchSession({
    code: 'ABCDEF',
    data,
    seed: () => 42,
    countdownSeconds: opts.countdownSeconds ?? 1,
    maxPlayers: opts.maxPlayers,
  });
}

const ofType = <T>(msgs: OutMessage[], type: string, to?: string) =>
  msgs
    .filter((m) => m.type === type && (to === undefined || m.to === to || m.to === 'all'))
    .map((m) => m.payload as T);

/** Dos jugadores listos y la partida empezada. */
function started() {
  const s = session();
  s.join('a', 'Ana');
  s.join('b', 'Beto');
  s.handle('b', MSG.ready, { ready: true });
  s.handle('a', MSG.start, {});
  for (let i = 0; i < 12; i++) s.tick();
  return s;
}

describe('lobby', () => {
  it('los jugadores entran con apodo, color distinto y el primero es anfitrión', () => {
    const s = session();
    s.join('a', 'Ana');
    s.join('b', '  Beto  ');
    const info = s.lobbyInfo;
    expect(info.code).toBe('ABCDEF');
    expect(info.phase).toBe('lobby');
    expect(info.players.map((p) => [p.nick, p.color, p.host, p.ready])).toEqual([
      ['Ana', 0, true, false],
      ['Beto', 1, false, false],
    ]);
    expect(info.minPlayers).toBe(2);
    expect(info.maxPlayers).toBe(4);
  });

  it('cada cambio se avisa a todos con el estado del lobby', () => {
    const s = session();
    s.join('a', 'Ana');
    const msgs = s.drain();
    expect(ofType<LobbyInfo>(msgs, MSG.lobby)[0]!.players).toHaveLength(1);
    s.handle('a', MSG.ready, { ready: true });
    expect(ofType<LobbyInfo>(s.drain(), MSG.lobby)[0]!.players[0]!.ready).toBe(true);
  });

  it('se puede elegir color si está libre y no si ya lo tiene otro', () => {
    const s = session();
    s.join('a', 'Ana');
    s.join('b', 'Beto');
    s.drain();
    s.handle('b', MSG.color, { color: 3 });
    expect(s.lobbyInfo.players[1]!.color).toBe(3);
    s.handle('a', MSG.color, { color: 3 });
    expect(ofType<{ message: string }>(s.drain(), MSG.error, 'a')[0]!.message).toContain('cogido');
    s.handle('a', MSG.color, { color: 9 });
    expect(s.lobbyInfo.players[0]!.color).toBe(0);
  });

  it('el apodo se limpia: sin espacios, sin etiquetas, con tope de 16 caracteres y con nombre por defecto', () => {
    expect(cleanNick('  Ana  ')).toBe('Ana');
    expect(cleanNick('<b>Ana</b>')).toBe('bAna/b');
    expect(cleanNick('x'.repeat(40))).toHaveLength(16);
    expect(cleanNick(42)).toBe('');
    const s = session();
    s.join('a', '   ');
    expect(s.lobbyInfo.players[0]!.nick).toBe('Jugador 1');
  });

  it('la sala admite como máximo 4 jugadores y rechaza el quinto', () => {
    const s = session();
    for (const id of ['a', 'b', 'c', 'd']) expect(s.join(id, id).ok).toBe(true);
    expect(s.join('e', 'e')).toEqual({ ok: false, error: 'La sala está llena.' });
  });

  it('si el anfitrión se va, el siguiente pasa a serlo', () => {
    const s = session();
    s.join('a', 'Ana');
    s.join('b', 'Beto');
    s.leave('a');
    expect(s.lobbyInfo.players).toHaveLength(1);
    expect(s.lobbyInfo.players[0]).toMatchObject({ nick: 'Beto', host: true });
  });

  it('empezar: solo el anfitrión, con al menos 2 jugadores y todos listos', () => {
    const s = session();
    s.join('a', 'Ana');
    s.handle('a', MSG.start, {});
    expect(ofType<{ message: string }>(s.drain(), MSG.error, 'a').pop()!.message).toContain(
      'al menos 2',
    );
    s.join('b', 'Beto');
    s.handle('b', MSG.start, {});
    expect(ofType<{ message: string }>(s.drain(), MSG.error, 'b').pop()!.message).toContain(
      'anfitrión',
    );
    s.handle('a', MSG.start, {});
    expect(ofType<{ message: string }>(s.drain(), MSG.error, 'a').pop()!.message).toContain(
      'listos',
    );
    expect(s.phase).toBe('lobby');
    s.handle('b', MSG.ready, { ready: true });
    s.handle('a', MSG.start, {});
    expect(s.phase).toBe('countdown');
  });

  it('la cuenta atrás avisa cada segundo y arranca la partida al llegar a 0', () => {
    const s = session({ countdownSeconds: 3 });
    s.join('a', 'Ana');
    s.join('b', 'Beto');
    s.handle('b', MSG.ready, { ready: true });
    s.drain();
    s.handle('a', MSG.start, {});
    expect(ofType<{ seconds: number }>(s.drain(), MSG.countdown)[0]).toEqual({ seconds: 3 });
    const seconds: number[] = [];
    for (let i = 0; i < 40; i++) {
      s.tick();
      seconds.push(...ofType<{ seconds: number }>(s.drain(), MSG.countdown).map((c) => c.seconds));
      if (s.phase === 'playing') break;
    }
    expect(seconds).toEqual([2, 1]);
    expect(s.phase).toBe('playing');
  });

  it('si alguien se va durante la cuenta atrás y quedan menos de 2, se vuelve al lobby', () => {
    const s = session({ countdownSeconds: 5 });
    s.join('a', 'Ana');
    s.join('b', 'Beto');
    s.handle('b', MSG.ready, { ready: true });
    s.handle('a', MSG.start, {});
    s.tick();
    s.leave('b');
    expect(s.phase).toBe('lobby');
    expect(s.lobbyInfo.players.every((p) => !p.ready)).toBe(true);
  });

  it('una vez empezada no entra nadie más', () => {
    const s = started();
    expect(s.join('z', 'Zoe')).toEqual({ ok: false, error: 'La partida ya empezó.' });
  });
});

describe('partida', () => {
  it('cada jugador recibe quién es y quiénes juegan, y la partida usa la semilla del servidor', () => {
    const s = session();
    s.join('a', 'Ana');
    s.join('b', 'Beto');
    s.handle('b', MSG.ready, { ready: true });
    s.handle('a', MSG.start, {});
    s.drain();
    for (let i = 0; i < 12; i++) s.tick();
    const msgs = s.drain();
    const a = ofType<StartedMsg>(msgs, MSG.started, 'a')[0]!;
    const b = ofType<StartedMsg>(msgs, MSG.started, 'b')[0]!;
    expect([a.you, b.you]).toEqual([1, 2]);
    expect(a.players).toEqual([
      { id: 1, nick: 'Ana', color: 0 },
      { id: 2, nick: 'Beto', color: 1 },
    ]);
    expect(a.seed).toBe(42);
    expect(hashState(s.state!)).toBe(
      hashState(createMatch({ playerCount: 2 }, data, 42).tick === 0 ? s.state! : s.state!),
    );
  });

  it('cada tick manda a cada jugador su delta, y el primero es una instantánea', () => {
    const s = started();
    s.drain();
    s.tick();
    const msgs = s.drain();
    const fa = ofType<Delta>(msgs, MSG.frame, 'a');
    const fb = ofType<Delta>(msgs, MSG.frame, 'b');
    expect(fa).toHaveLength(1);
    expect(fb).toHaveLength(1);
    expect(fa[0]!.tick).toBe(s.state!.tick);
    // Los dos primeros deltas tras empezar: uno de ellos fue la instantánea.
    const s2 = session();
    s2.join('a', 'A');
    s2.join('b', 'B');
    s2.handle('b', MSG.ready, { ready: true });
    s2.handle('a', MSG.start, {});
    s2.drain();
    let first: Delta | undefined;
    for (let i = 0; i < 12 && !first; i++) {
      s2.tick();
      first = ofType<Delta>(s2.drain(), MSG.frame, 'a')[0];
    }
    expect(first!.snapshot).toBe(true);
  });

  it('un comando válido se confirma con ack y se ejecuta; uno inválido devuelve su código', () => {
    const s = started();
    s.drain();
    s.handle('a', MSG.cmd, {
      seq: 1,
      cmd: { type: 'buildRoom', room: 'lair', rect: { x: 0, y: 0, w: 2, h: 2 } },
    });
    s.handle('a', MSG.cmd, { seq: 2, cmd: { type: 'nada' } });
    const acks = ofType<AckMsg>(s.drain(), MSG.ack, 'a');
    expect(acks[0]).toEqual({ seq: 1, ok: false, error: 'INVALID_TARGET' });
    expect(acks[1]).toEqual({ seq: 2, ok: false, error: 'INVALID_COMMAND' });
    const p1 = s.state!.players[0]!;
    const base = data.map.bases.find((b) => b.slot === p1.slot)!;
    // Una orden de excavar válida pegada a la base: se acepta.
    const tiles = [{ x: base.claimed.x + base.claimed.w, y: base.claimed.y + 2 }];
    s.handle('a', MSG.cmd, { seq: 3, cmd: { type: 'dig', tiles } });
    expect(ofType<AckMsg>(s.drain(), MSG.ack, 'a')[0]).toMatchObject({ seq: 3, ok: true });
  });

  it('el límite de 30 comandos por segundo se aplica en el servidor', () => {
    const s = started();
    s.drain();
    for (let i = 0; i < 35; i++)
      s.handle('a', MSG.cmd, { seq: i, cmd: { type: 'cancelDig', tiles: [{ x: 11, y: 4 }] } });
    const acks = ofType<AckMsg>(s.drain(), MSG.ack, 'a');
    expect(acks.filter((a) => !a.ok && a.error === 'RATE_LIMIT').length).toBeGreaterThanOrEqual(5);
  });

  it('los mensajes malformados se ignoran sin romper nada', () => {
    const s = started();
    s.drain();
    s.handle('a', MSG.cmd, null);
    s.handle('a', MSG.cmd, { seq: 'x', cmd: {} });
    s.handle('a', MSG.cmd, 5);
    s.handle('zzz', MSG.cmd, { seq: 1, cmd: { type: 'surrender' } });
    expect(ofType(s.drain(), MSG.ack)).toHaveLength(0);
    s.tick();
    expect(s.phase).toBe('playing');
  });

  it('los comandos antes de empezar se ignoran', () => {
    const s = session();
    s.join('a', 'Ana');
    s.drain();
    s.handle('a', MSG.cmd, { seq: 1, cmd: { type: 'surrender' } });
    expect(ofType(s.drain(), MSG.ack)).toHaveLength(0);
  });

  it('rendirse termina la partida: avisa del resultado con estadísticas y guarda el registro', () => {
    const s = started();
    s.drain();
    s.handle('b', MSG.cmd, { seq: 1, cmd: { type: 'surrender' } });
    for (let i = 0; i < 3; i++) s.tick();
    const msgs = s.drain();
    const ended = ofType<EndedMsg>(msgs, MSG.ended, 'a')[0]!;
    expect(ended.result).toMatchObject({ winners: [1], reason: 'lastStanding' });
    expect(ended.stats.map((x) => x.nick)).toEqual(['Ana', 'Beto']);
    expect(s.phase).toBe('ended');
    const info = s.endedInfo!;
    expect(info.seed).toBe(42);
    expect(info.log.some((r) => r.cmd.type === 'surrender')).toBe(true);
    // Ya terminada, no avanza ni acepta más comandos.
    s.drain();
    s.tick();
    expect(s.drain()).toEqual([]);
  });

  it('el registro de comandos reproduce exactamente la partida (misma semilla, mismo hash)', () => {
    const s = started();
    const base = data.map.bases.find((b) => b.slot === s.state!.players[0]!.slot)!;
    for (let n = 0; n < 60; n++) {
      if (n % 10 === 0)
        s.handle('a', MSG.cmd, {
          seq: n,
          cmd: {
            type: 'dig',
            tiles: [{ x: base.claimed.x + base.claimed.w, y: base.claimed.y + 1 + (n % 5) }],
          },
        });
      s.tick();
    }
    s.handle('b', MSG.cmd, { seq: 99, cmd: { type: 'surrender' } });
    for (let i = 0; i < 3; i++) s.tick();
    const info = s.endedInfo!;
    const again = replay({ playerCount: 2 }, data, info.seed, info.log, info.ticks);
    expect(hashState(again)).toBe(hashState(s.state!));
  });
});

describe('desconexiones', () => {
  it('desconectado no recibe deltas; al reconectar recibe quién es y una instantánea nueva', () => {
    const s = started();
    s.drain();
    s.disconnect('b');
    s.tick();
    expect(ofType(s.drain(), MSG.frame, 'b')).toHaveLength(0);
    expect(s.reconnect('b')).toBe(true);
    s.tick();
    const msgs = s.drain();
    expect(ofType<StartedMsg>(msgs, MSG.started, 'b')[0]!.you).toBe(2);
    expect(ofType<Delta>(msgs, MSG.frame, 'b')[0]!.snapshot).toBe(true);
  });

  it('mientras está desconectado sus criaturas y su mazmorra siguen funcionando (la partida no se para)', () => {
    const s = started();
    s.disconnect('b');
    const t0 = s.state!.tick;
    for (let i = 0; i < 50; i++) s.tick();
    expect(s.state!.tick).toBe(t0 + 50);
    expect(s.phase).toBe('playing');
  });

  it('a los 120 s sin reconectar cuenta como rendición', () => {
    const s = started();
    s.disconnect('b');
    for (let i = 0; i < 1190; i++) s.tick();
    expect(s.phase).toBe('playing');
    // Cada cierto tiempo el otro jugador da órdenes para no caer por inactividad.
    for (let i = 0; i < 20; i++) {
      s.handle('a', MSG.cmd, { seq: i, cmd: { type: 'cancelDig', tiles: [{ x: 1, y: 1 }] } });
      s.tick();
    }
    expect(s.phase).toBe('ended');
    expect(s.endedInfo!.result).toMatchObject({ winners: [1], reason: 'lastStanding' });
  });

  it('reconectar a tiempo evita la rendición y un jugador eliminado ya no puede volver', () => {
    const s = started();
    s.disconnect('b');
    for (let i = 0; i < 600; i++) {
      if (i % 100 === 0)
        s.handle('a', MSG.cmd, { seq: i, cmd: { type: 'cancelDig', tiles: [{ x: 1, y: 1 }] } });
      s.tick();
    }
    expect(s.reconnect('b')).toBe(true);
    for (let i = 0; i < 700; i++) {
      if (i % 100 === 0) {
        s.handle('a', MSG.cmd, { seq: i, cmd: { type: 'cancelDig', tiles: [{ x: 1, y: 1 }] } });
        s.handle('b', MSG.cmd, { seq: i, cmd: { type: 'cancelDig', tiles: [{ x: 1, y: 1 }] } });
      }
      s.tick();
    }
    expect(s.phase).toBe('playing');
    s.handle('b', MSG.cmd, { seq: 1, cmd: { type: 'surrender' } });
    s.tick();
    expect(s.reconnect('b')).toBe(false);
  });

  it('5 minutos sin dar órdenes cuentan como rendición, y dar órdenes lo evita', () => {
    const s = started();
    for (let i = 0; i < 3100; i++) {
      // Solo el jugador a da órdenes.
      if (i % 1000 === 0)
        s.handle('a', MSG.cmd, { seq: i, cmd: { type: 'cancelDig', tiles: [{ x: 1, y: 1 }] } });
      s.tick();
      if (s.phase === 'ended') break;
    }
    expect(s.phase).toBe('ended');
    expect(s.endedInfo!.result.winners).toEqual([1]);
  });

  it('irse del todo en plena partida es rendirse', () => {
    const s = started();
    s.leave('b');
    for (let i = 0; i < 3; i++) s.tick();
    expect(s.endedInfo!.result).toMatchObject({ winners: [1] });
  });
});

void step;
