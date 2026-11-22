import { describe, expect, it } from 'vitest';
import { applyCommand, planRoomBuild, rulesOf, step } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { Sandbox } from '../sandbox/sandbox';
import { overlayTiles } from '../render/overlayView';
import { previewRoom } from './buildPreview';
import { roomCostTag, roomHoverText, roomPreviewText } from './roomInfo';

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
  sb.state.players[0]!.gold = 30000;
  return sb;
}

describe('previsión por salas', () => {
  it('un rectángulo de 12 tiles se ve como dos salas: nivel 10 y nivel 2, con el coste total', () => {
    const { state } = world();
    const p = previewRoom(state, data, 1, 'library', { x: 2, y: 11, w: 6, h: 2 });
    expect(p.valid).toBe(true);
    expect(p.pieces.map((x) => x.level).sort((a, b) => b - a)).toEqual([10, 2]);
    expect(p.pieces.every((x) => !x.extends)).toBe(true);
    // Sala de 10 tiles (6.489) + sala de 2 tiles (550): el precio sube dentro de cada sala y la 2.ª vuelve a empezar.
    expect(p.cost).toBe(7039);
    // (el idioma "es" no agrupa los miles de 4 cifras: 3000 y no 3.000)
    expect(roomPreviewText(p, 'Biblioteca')).toMatch(
      /^Biblioteca: sala nueva de nivel 10 \+ sala nueva de nivel 2 · 7\.?039 de oro$/,
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

describe('etiqueta de coste en vivo', () => {
  const tag = (
    sb: ReturnType<typeof world>,
    room: string,
    rect: { x: number; y: number; w: number; h: number },
  ) => {
    const preview = previewRoom(sb.state, data, 1, room, rect);
    return roomCostTag(
      data,
      preview,
      room,
      sb.state.players[0]!.gold,
      'No se puede hacer eso ahí.',
    );
  };

  it('un tile suelto en sitio libre: precio base y sala nueva', () => {
    const sb = world();
    const t = tag(sb, 'lair', { x: 2, y: 11, w: 1, h: 1 });
    expect(t.tone).toBe('ok');
    expect(t.text).toContain('tile n.º 1');
    expect(t.text).toContain('precio base');
    expect(t.text).toContain('sala nueva de nivel 1');
  });

  it('pegado a una sala del mismo tipo sube el precio un 20 % por tile y lo dice', () => {
    const sb = world();
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 2, y: 11, w: 3, h: 1 },
    });
    step(sb.state, data);
    // El 4.º tile de la Biblioteca (250 × 1,2³ = 432): +73 % sobre el precio base.
    const t = tag(sb, 'library', { x: 5, y: 11, w: 1, h: 1 });
    expect(t.text).toContain('tile n.º 4');
    expect(t.text).toContain('432');
    expect(t.text).toContain('+73 %');
    expect(t.text).toContain('amplía la sala a nivel 4');
    // Lejos de ella, vuelve al precio base.
    const far = tag(sb, 'library', { x: 9, y: 17, w: 1, h: 1 });
    expect(far.text).toContain('precio base');
  });

  it('el tile que conecta dos salas separadas cuesta sobre el total de tiles conectados y lo dice', () => {
    const sb = world();
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 2, y: 11, w: 4, h: 1 },
    });
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 7, y: 11, w: 3, h: 1 },
    });
    step(sb.state, data);
    // 4 + 3 + el tile del hueco = 8: se paga como el tile n.º 8 (250 × 1,2⁷ ≈ 896).
    const t = tag(sb, 'library', { x: 6, y: 11, w: 1, h: 1 });
    expect(t.text).toContain('tile n.º 8');
    expect(t.text).toContain('une 2 salas: nivel 8');
    expect(t.text).toContain('896');
    const preview = previewRoom(sb.state, data, 1, 'library', { x: 6, y: 11, w: 1, h: 1 });
    expect(preview.pieces).toHaveLength(1);
    expect(preview.pieces[0]).toMatchObject({ level: 8, merged: 2, newTiles: 1, cost: 896 });
    expect(roomPreviewText(preview, 'Biblioteca')).toContain('une 2 salas en una de nivel 8');
  });

  it('si pasaría de 10 tiles conectados, el tile abre una sala nueva de nivel 1 y cuesta el precio base', () => {
    const sb = world();
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 2, y: 11, w: 6, h: 1 },
    });
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 9, y: 11, w: 2, h: 2 },
    });
    applyCommand(sb.state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 9, y: 13, w: 1, h: 1 },
    });
    step(sb.state, data);
    const t = tag(sb, 'library', { x: 8, y: 11, w: 1, h: 1 });
    expect(t.text).toContain('tile n.º 1');
    expect(t.text).toContain('precio base');
    expect(t.text).toContain('sala nueva de nivel 1');
  });

  it('con poco oro avisa de cuánto falta; en un sitio inválido, por qué', () => {
    const sb = world();
    sb.state.players[0]!.gold = 100;
    const poor = tag(sb, 'lair', { x: 2, y: 11, w: 1, h: 1 });
    expect(poor.tone).toBe('poor');
    expect(poor.text).toContain('te faltan 200');
    const bad = tag(sb, 'lair', { x: 40, y: 40, w: 1, h: 1 });
    expect(bad.tone).toBe('invalid');
    expect(bad.text).toBe('Guarida: No se puede hacer eso ahí.');
  });

  it('un arrastre largo enseña los niveles resultantes y el total', () => {
    const sb = world();
    const t = tag(sb, 'library', { x: 2, y: 11, w: 6, h: 2 });
    expect(t.text).toContain('nivel 10 + nivel 2');
    expect(t.text).toContain('7');
  });
});
