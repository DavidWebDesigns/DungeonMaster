import { describe, expect, it } from 'vitest';
import { applyCommand, planRoomBuild, rulesOf, step } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { Sandbox } from '../sandbox/sandbox';
import { overlayTiles } from '../render/overlayView';
import { previewRoom } from './buildPreview';
import { roomHoverText, roomPreviewText } from './roomInfo';

const data = loadGameData();
/** Territorio libre amplio para construir (x 2..10, y 11..19) y oro de sobra. */
function world() {
  const sb = new Sandbox(data, 1);
  const claimed = data.terrain.findIndex((t) => t.id === 'claimedFloor');
  for (let y = 11; y < 20; y++)
    for (let x = 2; x < 11; x++) {
      sb.state.terrain[y * 64 + x] = claimed;
      sb.state.owner[y * 64 + x] = 1;
    }
  sb.state.mapVersion++;
  sb.state.players[0]!.gold = 9000;
  return sb;
}

describe('previsión por salas', () => {
  it('un rectángulo de 12 tiles se ve como dos salas: nivel 10 y nivel 2, con el coste total', () => {
    const { state } = world();
    const p = previewRoom(state, data, 1, 'library', { x: 2, y: 11, w: 6, h: 2 });
    expect(p.valid).toBe(true);
    expect(p.pieces.map((x) => x.level).sort((a, b) => b - a)).toEqual([10, 2]);
    expect(p.pieces.every((x) => !x.extends)).toBe(true);
    expect(p.cost).toBe(12 * 250);
    // (el idioma "es" no agrupa los miles de 4 cifras: 3000 y no 3.000)
    expect(roomPreviewText(p, 'Biblioteca')).toMatch(
      /^Biblioteca: sala nueva de nivel 10 \+ sala nueva de nivel 2 · 3\.?000 de oro$/,
    );
  });

  it('coincide exactamente con lo que construye la simulación', () => {
    const sb = world();
    const rect = { x: 2, y: 11, w: 6, h: 2 };
    const plan = planRoomBuild(sb.state, rulesOf(data), 1, 'library', rect);
    applyCommand(sb.state, data, 1, { type: 'buildRoom', room: 'library', rect });
    step(sb.state, data);
    const built = sb.state.rooms.filter((r) => r.type === 'library').map((r) => r.tiles);
    expect(plan.map((p) => p.tiles).sort()).toEqual(built.sort());
  });

  it('indica que amplía una sala existente', () => {
    const sb = world();
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 2, y: 11, w: 3, h: 3 },
    });
    step(sb.state, data);
    const p = previewRoom(sb.state, data, 1, 'library', { x: 5, y: 11, w: 1, h: 3 });
    expect(p.pieces.map((x) => [x.level, x.extends]).sort()).toEqual([
      [10, true],
      [2, false],
    ]);
    expect(roomPreviewText(p, 'Biblioteca')).toContain('amplía una sala a nivel 10');
  });

  it('inválida no tiene piezas ni texto', () => {
    const { state } = world();
    const p = previewRoom(state, data, 1, 'library', { x: 40, y: 40, w: 2, h: 2 });
    expect(p.valid).toBe(false);
    expect(p.pieces).toEqual([]);
    expect(roomPreviewText(p, 'Biblioteca')).toBe('');
  });

  it('el fantasma pinta cada sala resultante con un tono distinto', () => {
    const { state } = world();
    const room = previewRoom(state, data, 1, 'library', { x: 2, y: 11, w: 6, h: 2 });
    const tiles = overlayTiles({ kind: 'room', room, width: state.width });
    expect(tiles).toHaveLength(12);
    expect(new Set(tiles.map((t) => t.color.join(','))).size).toBe(2);
    // Con una sola sala, un solo tono.
    const one = previewRoom(state, data, 1, 'library', { x: 2, y: 11, w: 3, h: 3 });
    expect(
      new Set(
        overlayTiles({ kind: 'room', room: one, width: state.width }).map((t) => t.color.join(',')),
      ).size,
    ).toBe(1);
  });
});

describe('tarjeta de sala', () => {
  it('muestra el nivel sobre el máximo y marca la sala completa', () => {
    const sb = world();
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 2, y: 11, w: 3, h: 2 },
    });
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 2, y: 14, w: 5, h: 2 },
    });
    step(sb.state, data);
    expect(roomHoverText(sb.state, data, 11 * 64 + 2)).toBe('Guarida · nivel 6/10');
    expect(roomHoverText(sb.state, data, 14 * 64 + 2)).toBe('Biblioteca · nivel 10/10 (completa)');
    expect(roomHoverText(sb.state, data, 18 * 64 + 9)).toBe('');
  });
});
