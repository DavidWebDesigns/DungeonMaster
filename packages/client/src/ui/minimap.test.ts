import { describe, expect, it } from 'vitest';
import { groundFootprint, defaultCamera } from '../render/cameraMath';
import { playerColor } from '../render/palette';
import { loadGameData } from '../data/loadGameData';
import { Sandbox } from '../sandbox/sandbox';
import { minimapPixels, minimapTileAt } from './minimap';

const data = loadGameData();
const W = data.map.width;
const tiles = Array.from({ length: W * data.map.height }, () => ({
  color: [0.2, 0.2, 0.2] as const,
}));
const at = (px: Uint8ClampedArray, x: number, y: number) => [
  ...px.slice((y * W + x) * 4, (y * W + x) * 4 + 4),
];

describe('minimapa', () => {
  it('tiene un píxel opaco por tile con el color del terreno', () => {
    const sb = new Sandbox(data, 1);
    const px = minimapPixels({ state: sb.state, tiles, me: 1, visible: null });
    expect(px.length).toBe(W * data.map.height * 4);
    expect(at(px, 0, 0)).toEqual([51, 51, 51, 255]);
  });

  it('tus Imps se ven blancos y el Corazón del color del dueño', () => {
    const sb = new Sandbox(data, 1);
    const imp = sb.state.imps[0]!;
    const px = minimapPixels({ state: sb.state, tiles, me: 1, visible: null });
    expect(at(px, Math.floor(imp.x), Math.floor(imp.y))).toEqual([255, 255, 255, 255]);
    const heart = sb.state.rooms.find((r) => r.type === 'heart' && r.owner === 1)!;
    const t = heart.tiles[0]!;
    const c = playerColor(1);
    expect(at(px, t % W, Math.floor(t / W))).toEqual([...c.map((v) => Math.round(v * 255)), 255]);
  });

  it('con niebla, no revela unidades ni Corazones rivales que no se ven', () => {
    const sb = new Sandbox(data, 1, { rivals: 1 });
    const none = new Uint8Array(W * data.map.height);
    const px = minimapPixels({ state: sb.state, tiles, me: 1, visible: none });
    const enemyImp = sb.state.imps.find((i) => i.owner === 2)!;
    expect(at(px, Math.floor(enemyImp.x), Math.floor(enemyImp.y))).toEqual([51, 51, 51, 255]);
    const heart = sb.state.rooms.find((r) => r.type === 'heart' && r.owner === 2)!;
    expect(at(px, heart.tiles[0]! % W, Math.floor(heart.tiles[0]! / W))).toEqual([51, 51, 51, 255]);
    // Pero con todo visible, sí.
    const all = new Uint8Array(W * data.map.height).fill(1);
    const px2 = minimapPixels({ state: sb.state, tiles, me: 1, visible: all });
    expect(at(px2, Math.floor(enemyImp.x), Math.floor(enemyImp.y))).toEqual([
      ...playerColor(2).map((v) => Math.round(v * 255)),
      255,
    ]);
  });

  it('un clic en el minimapa se traduce al tile correspondiente y fuera no da nada', () => {
    const size = { w: 128, h: 128 };
    expect(minimapTileAt(0, 0, size, data.map)).toEqual({ x: 0, y: 0 });
    expect(minimapTileAt(64, 64, size, data.map)).toEqual({ x: W / 2, y: data.map.height / 2 });
    expect(minimapTileAt(127, 127, size, data.map)).toEqual({ x: W - 1, y: data.map.height - 1 });
    expect(minimapTileAt(-1, 5, size, data.map)).toBeNull();
    expect(minimapTileAt(128, 5, size, data.map)).toBeNull();
  });

  it('el área visible es un cuadrilátero de 4 puntos centrado en el punto de mira', () => {
    const cam = defaultCamera({ x: 20, y: 20 });
    const f = groundFootprint(cam);
    expect(f).toHaveLength(4);
    const cx = f.reduce((s, p) => s + p.x, 0) / 4;
    const cz = f.reduce((s, p) => s + p.z, 0) / 4;
    expect(cx).toBeCloseTo(cam.targetX, 3);
    expect(cz).toBeCloseTo(cam.targetZ, 3);
    // Más zoom (menos tiles visibles) = área más pequeña.
    const near = groundFootprint({ ...cam, zoom: cam.zoom / 2 });
    const span = (pts: typeof f) =>
      Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    expect(span(near)).toBeLessThan(span(f));
  });
});
