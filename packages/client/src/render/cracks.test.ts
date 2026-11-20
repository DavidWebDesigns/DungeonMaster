import { describe, expect, it } from 'vitest';
import { step } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { LOCAL_PLAYER, Sandbox } from '../sandbox/sandbox';
import { crackTiles } from './cracks';

const data = loadGameData();

describe('grietas al excavar', () => {
  it('el muro se agrieta por etapas mientras un Imp lo excava y deja de dibujarse al abrirse', () => {
    const sb = new Sandbox(data, 1);
    sb.send({ type: 'dig', tiles: [{ x: 11, y: 4 }] });
    const alphas: number[] = [];
    for (let i = 0; i < 400; i++) {
      step(sb.state, data);
      const c = crackTiles(sb.state, data, LOCAL_PLAYER);
      if (c.length > 0) {
        expect(c).toHaveLength(1);
        expect(c[0]!.tile).toEqual({ x: 11, y: 4 });
        alphas.push(c[0]!.alpha!);
      }
    }
    // Pasó por la primera y por la segunda grieta, en ese orden, y ya no se ve (el muro se abrió).
    expect([...new Set(alphas)]).toEqual([0.35, 0.7]);
    expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
    expect(crackTiles(sb.state, data, LOCAL_PLAYER)).toEqual([]);
  });

  it('no dibuja las excavaciones de otro jugador', () => {
    const sb = new Sandbox(data, 1);
    sb.send({ type: 'dig', tiles: [{ x: 11, y: 4 }] });
    for (let i = 0; i < 60; i++) step(sb.state, data);
    expect(crackTiles(sb.state, data, 2)).toEqual([]);
  });
});
