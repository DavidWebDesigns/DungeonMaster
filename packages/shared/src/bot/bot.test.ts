import { describe, expect, it } from 'vitest';
import { hashState } from '../sim/hashState';
import { replay } from '../sim/replay';
import { createMatch } from '../sim/createMatch';
import { loadData } from '../sim/testUtils';
import { createBot } from './bot';
import { planDig } from './knowledge';
import { playBotMatch } from './match';

const data = loadData();
const SLOW = 300_000;

describe('planDig', () => {
  it('encuentra el camino más corto hasta una veta y lista solo los muros que hay que excavar, en orden', () => {
    const state = createMatch({ playerCount: 2 }, data, 3);
    const vein = (t: number) => data.terrain[state.terrain[t] as number]?.goldPerTile !== undefined;
    const path = planDig(state, data, 1, vein);
    expect(path).not.toBeNull();
    expect(path!.tiles.length).toBeGreaterThan(0);
    // Todo lo que hay que excavar es muro o veta; el último tile es una veta.
    for (const t of path!.tiles)
      expect(data.terrain[state.terrain[t] as number]!.walkable).toBe(false);
    expect(vein(path!.tiles.at(-1)!)).toBe(true);
    // Cada tile toca al anterior (o a suelo propio, el primero).
    const w = state.width;
    path!.tiles.slice(1).forEach((t, i) => {
      const p = path!.tiles[i]!;
      expect(Math.abs((t % w) - (p % w)) + Math.abs(Math.floor(t / w) - Math.floor(p / w))).toBe(1);
    });
  });

  it('devuelve null si el objetivo no existe', () => {
    const state = createMatch({ playerCount: 2 }, data, 3);
    expect(planDig(state, data, 1, () => false)).toBeNull();
  });

  it('no atraviesa roca sólida: un objetivo que solo es roca no se alcanza', () => {
    const state = createMatch({ playerCount: 2 }, data, 3);
    // Roca según el plano público del mapa ('#').
    const path = planDig(
      state,
      data,
      1,
      (t) => data.map.rows[Math.floor(t / state.width)]![t % state.width] === '#',
    );
    expect(path).toBeNull();
  });
});

describe('el bot', () => {
  it('decide una vez por segundo y no hace nada si la partida terminó o ya está eliminado', () => {
    const state = createMatch({ playerCount: 2 }, data, 3);
    const bot = createBot(1, 7);
    let decisions = 0;
    for (let t = 0; t < 20; t++) {
      state.tick = t;
      if (bot.act(state, data).length > 0) decisions++;
    }
    expect(decisions).toBeLessThanOrEqual(2);
    state.status = 'ended';
    for (let t = 0; t < 20; t++) {
      state.tick = t;
      expect(bot.act(state, data)).toEqual([]);
    }
  });

  it(
    'juega 12 minutos sin que la simulación rechace ni un solo comando',
    () => {
      const r = playBotMatch(data, { players: 2, seed: 11, maxTicks: 7200 });
      expect(r.rejected).toEqual({});
      expect(r.commands).toBeGreaterThan(100);
    },
    SLOW,
  );

  it(
    'monta la base: construye Guarida, Criadero, Sala de entrenamiento y Biblioteca y cría criaturas',
    () => {
      const r = playBotMatch(data, { players: 2, seed: 11, maxTicks: 7200 });
      for (const p of r.state.players) {
        const types = r.state.rooms.filter((x) => x.owner === p.id).map((x) => x.type);
        for (const t of ['lair', 'hatchery', 'trainingRoom', 'library'])
          expect(types, `P${p.id} sin ${t}`).toContain(t);
        expect(r.state.creatures.filter((c) => c.owner === p.id).length).toBeGreaterThanOrEqual(3);
        expect(r.state.imps.filter((i) => i.owner === p.id).length).toBeGreaterThanOrEqual(6);
      }
    },
    SLOW,
  );

  it(
    'es determinista y su partida se reproduce exactamente desde el registro de comandos',
    () => {
      const a = playBotMatch(data, { players: 2, seed: 21, maxTicks: 6000 });
      const b = playBotMatch(data, { players: 2, seed: 21, maxTicks: 6000 });
      expect(hashState(a.state)).toBe(hashState(b.state));
      const log = JSON.parse(JSON.stringify(a.state.log));
      const again = replay({ playerCount: 2 }, data, 21, log, 6000);
      expect(hashState(again)).toBe(hashState(a.state));
      const other = playBotMatch(data, { players: 2, seed: 22, maxTicks: 6000 });
      expect(hashState(other.state)).not.toBe(hashState(a.state));
    },
    SLOW,
  );

  it(
    'una partida completa de 2 bots termina sin errores',
    () => {
      const r = playBotMatch(data, { players: 2, seed: 5 });
      expect(r.rejected).toEqual({});
      expect(r.state.result).not.toBeNull();
      expect(r.state.status).toBe('ended');
    },
    SLOW,
  );
});
