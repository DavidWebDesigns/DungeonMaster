import { describe, expect, it } from 'vitest';
import { createMatch } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { previewRoom, roomRectFromDrag } from './buildPreview';

const map = { width: 64, height: 64 };

describe('roomRectFromDrag', () => {
  it('un clic da el tamaño mínimo hacia abajo y a la derecha', () => {
    expect(roomRectFromDrag({ w: 3, h: 3 }, { x: 5, y: 5 }, { x: 5, y: 5 }, map)).toEqual({
      x: 5,
      y: 5,
      w: 3,
      h: 3,
    });
  });

  it('arrastrar hacia arriba y a la izquierda amplía en esa dirección', () => {
    expect(roomRectFromDrag({ w: 3, h: 3 }, { x: 5, y: 5 }, { x: 4, y: 4 }, map)).toEqual({
      x: 3,
      y: 3,
      w: 3,
      h: 3,
    });
  });

  it('un arrastre mayor que el mínimo se respeta tal cual', () => {
    expect(roomRectFromDrag({ w: 2, h: 2 }, { x: 2, y: 2 }, { x: 6, y: 4 }, map)).toEqual({
      x: 2,
      y: 2,
      w: 5,
      h: 3,
    });
  });

  it('cerca del borde se desplaza para caber entero', () => {
    expect(roomRectFromDrag({ w: 3, h: 3 }, { x: 63, y: 63 }, { x: 63, y: 63 }, map)).toEqual({
      x: 61,
      y: 61,
      w: 3,
      h: 3,
    });
  });
});

describe('previewRoom', () => {
  const data = loadGameData();

  it('una Guarida en suelo libre propio es válida y cuesta 300 por tile', () => {
    const state = createMatch({ playerCount: 1 }, data, 1);
    const p = previewRoom(state, data, 1, 'lair', { x: 6, y: 2, w: 2, h: 2 });
    expect(p).toMatchObject({ valid: true, cost: 1200 });
  });

  it('encima del Corazón es inválida', () => {
    const state = createMatch({ playerCount: 1 }, data, 1);
    expect(previewRoom(state, data, 1, 'lair', { x: 5, y: 5, w: 2, h: 2 })).toMatchObject({
      valid: false,
      error: 'INVALID_TARGET',
    });
  });

  it('sin oro avisa con NO_GOLD y conserva el coste para mostrarlo', () => {
    const state = createMatch({ playerCount: 1 }, data, 1);
    state.players[0]!.gold = 100;
    expect(previewRoom(state, data, 1, 'lair', { x: 6, y: 2, w: 2, h: 2 })).toMatchObject({
      valid: false,
      error: 'NO_GOLD',
      cost: 1200,
    });
  });

  it('cada sala construible sin requisitos tiene su tamaño mínimo válido y las demás avisan de lo que falta', () => {
    const state = createMatch({ playerCount: 1 }, data, 1);
    state.players[0]!.gold = 99999;
    // Se amplía el territorio propio para tener hueco libre y poder probar todas.
    for (let y = 11; y < 16; y++)
      for (let x = 2; x < 11; x++) {
        state.terrain[y * 64 + x] = data.terrain.findIndex((t) => t.id === 'claimedFloor');
        state.owner[y * 64 + x] = 1;
      }
    for (const room of data.rooms.filter((r) => r.buildable)) {
      const rect = roomRectFromDrag(room.minSize, { x: 2, y: 11 }, { x: 2, y: 11 }, map);
      const res = previewRoom(state, data, 1, room.id, rect);
      // Las salas con requisitos no se pueden construir en una partida nueva: lo dice la previsión.
      if (room.requiresRooms?.length) {
        expect(res, room.id).toMatchObject({ valid: false, error: 'REQUIRES_ROOM' });
      } else {
        expect(res.valid, room.id).toBe(true);
      }
    }
  });
});
