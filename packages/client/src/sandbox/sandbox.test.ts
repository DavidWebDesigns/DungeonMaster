import { describe, expect, it } from 'vitest';
import { createMatch, hashState, step, applyCommand, type Command } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { LOCAL_PLAYER, Sandbox } from './sandbox';

const data = loadGameData();
/** Avanza en tramos de un segundo, como lo haría el bucle de dibujo. */
function play(sb: Sandbox, ms: number) {
  const events = [];
  for (let left = ms; left > 0; left -= 1000) events.push(...sb.advance(Math.min(1000, left)));
  return events;
}

const dig: Command = {
  type: 'dig',
  tiles: [
    { x: 11, y: 4 },
    { x: 12, y: 4 },
  ],
};

describe('Sandbox', () => {
  it('crea una partida de un jugador en la esquina 0 con 4 Imps', () => {
    const sb = new Sandbox(data, 1);
    expect(sb.state.players).toHaveLength(1);
    expect(sb.state.players[0]!.id).toBe(LOCAL_PLAYER);
    expect(sb.state.imps).toHaveLength(4);
  });

  it('un segundo de reloj son 10 ticks, y los restos se acumulan', () => {
    const sb = new Sandbox(data, 1);
    sb.advance(1000);
    expect(sb.state.tick).toBe(10);
    sb.advance(50);
    expect(sb.state.tick).toBe(10);
    expect(sb.alpha).toBeCloseTo(0.5);
    sb.advance(50);
    expect(sb.state.tick).toBe(11);
  });

  it('da igual cómo se parta el tiempo: 16 ms x 63 ≈ 1 s da los mismos ticks', () => {
    const a = new Sandbox(data, 1);
    for (let i = 0; i < 63; i++) a.advance(16);
    const b = new Sandbox(data, 1);
    b.advance(1008);
    expect(a.state.tick).toBe(b.state.tick);
    expect(a.hash()).toBe(b.hash());
  });

  it('no recupera una pausa larga de golpe (máximo 10 ticks por llamada)', () => {
    const sb = new Sandbox(data, 1);
    sb.advance(60_000);
    expect(sb.state.tick).toBe(10);
    sb.advance(100);
    expect(sb.state.tick).toBe(11);
  });

  it('en pausa no avanza, y tiempo negativo o NaN se ignora', () => {
    const sb = new Sandbox(data, 1);
    sb.paused = true;
    sb.advance(1000);
    expect(sb.state.tick).toBe(0);
    sb.paused = false;
    sb.advance(-5);
    sb.advance(Number.NaN);
    expect(sb.state.tick).toBe(0);
  });

  it('da el mismo resultado que la simulación pura con los mismos comandos', () => {
    const sb = new Sandbox(data, 7);
    expect(sb.send(dig).ok).toBe(true);
    play(sb, 10_000);
    expect(sb.state.tick).toBe(100);
    const pure = createMatch({ playerCount: 1 }, data, 7);
    applyCommand(pure, data, LOCAL_PLAYER, dig);
    for (let i = 0; i < sb.state.tick; i++) step(pure, data);
    expect(hashState(pure)).toBe(sb.hash());
  });

  it('los comandos inválidos se rechazan con su código y no cambian el estado', () => {
    const sb = new Sandbox(data, 1);
    sb.state.players[0]!.gold = 0;
    const res = sb.send({ type: 'buildRoom', room: 'lair', rect: { x: 6, y: 2, w: 2, h: 2 } });
    expect(res).toEqual({ ok: false, error: 'NO_GOLD' });
  });

  it('guarda la pose previa de cada Imp para interpolar', () => {
    const sb = new Sandbox(data, 1);
    sb.send(dig);
    sb.advance(300);
    const imp = sb.state.imps.find((i) => i.mode === 'moving' || i.mode === 'working');
    expect(imp).toBeDefined();
    const prev = sb.previous.get(imp!.id)!;
    expect(Math.hypot(imp!.x - prev.x, imp!.y - prev.y)).toBeLessThanOrEqual(0.26);
  });

  it('devuelve los eventos de los ticks ejecutados', () => {
    const sb = new Sandbox(data, 1);
    sb.send(dig);
    const events = play(sb, 25_000);
    expect(events.some((e) => e.type === 'tileChanged')).toBe(true);
  });
});
