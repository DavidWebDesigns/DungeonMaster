import { describe, expect, it } from 'vitest';
import { createMatch, rulesOf } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { chunk, dragRect, highlightSelection, rectTiles, selectionCommands } from './selection';

const map = { width: 64, height: 64 };

describe('dragRect', () => {
  it('es inclusivo y no depende del sentido del arrastre', () => {
    expect(dragRect({ x: 5, y: 5 }, { x: 8, y: 7 }, map)).toEqual({ x: 5, y: 5, w: 4, h: 3 });
    expect(dragRect({ x: 8, y: 7 }, { x: 5, y: 5 }, map)).toEqual({ x: 5, y: 5, w: 4, h: 3 });
  });

  it('un clic es un solo tile', () => {
    expect(dragRect({ x: 3, y: 4 }, { x: 3, y: 4 }, map)).toEqual({ x: 3, y: 4, w: 1, h: 1 });
  });

  it('se recorta al mapa', () => {
    expect(dragRect({ x: -5, y: 60 }, { x: 70, y: 90 }, map)).toEqual({ x: 0, y: 60, w: 64, h: 4 });
  });
});

describe('rectTiles', () => {
  it('lista todos los tiles empezando por el ancla', () => {
    const tiles = rectTiles({ x: 10, y: 4, w: 4, h: 1 }, { x: 10, y: 4 });
    expect(tiles).toEqual([
      { x: 10, y: 4 },
      { x: 11, y: 4 },
      { x: 12, y: 4 },
      { x: 13, y: 4 },
    ]);
  });

  it('si se arrastra hacia la izquierda, empieza por el lado del ancla', () => {
    const tiles = rectTiles({ x: 10, y: 4, w: 4, h: 1 }, { x: 13, y: 4 });
    expect(tiles.map((t) => t.x)).toEqual([13, 12, 11, 10]);
  });

  it('cubre el rectángulo entero sin repetir', () => {
    const tiles = rectTiles({ x: 2, y: 2, w: 5, h: 4 }, { x: 4, y: 3 });
    expect(tiles).toHaveLength(20);
    expect(new Set(tiles.map((t) => `${t.x},${t.y}`)).size).toBe(20);
  });
});

describe('chunk y selectionCommands', () => {
  it('parte en trozos de como mucho el máximo', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });

  it('una selección de 100 tiles se manda en dos comandos de 64 y 36', () => {
    const tiles = rectTiles({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0 });
    const cmds = selectionCommands('dig', tiles, 64);
    expect(cmds).toHaveLength(2);
    expect(cmds.map((c) => (c.type === 'dig' ? c.tiles.length : -1))).toEqual([64, 36]);
    expect(cmds.every((c) => c.type === 'dig')).toBe(true);
  });
});

describe('highlightSelection', () => {
  const data = loadGameData();
  const state = createMatch({ playerCount: 1 }, data, 1);
  const rules = rulesOf(data);

  it('separa tierra excavable de suelo propio', () => {
    const tiles = [
      { x: 11, y: 4 }, // tierra
      { x: 3, y: 3 }, // suelo propio
      { x: 0, y: 0 }, // roca sólida
    ];
    const { valid, invalid } = highlightSelection('dig', state, rules, tiles, 1);
    expect(valid).toEqual([{ x: 11, y: 4 }]);
    expect(invalid).toHaveLength(2);
  });

  it('reforzar solo vale junto a suelo propio', () => {
    const { valid } = highlightSelection(
      'reinforce',
      state,
      rules,
      [
        { x: 11, y: 4 },
        { x: 30, y: 30 },
      ],
      1,
    );
    expect(valid).toEqual([{ x: 11, y: 4 }]);
  });

  it('un tile fuera del mapa no es válido', () => {
    expect(
      highlightSelection(
        'dig',
        state,
        rules,
        [
          { x: -1, y: 0 },
          { x: 64, y: 0 },
        ],
        1,
      ).valid,
    ).toEqual([]);
  });
});
