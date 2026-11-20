/**
 * Límites de salas con un servidor real: tope de salas abiertas y códigos repetidos.
 */
import { Client } from '@colyseus/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from './server';
import { loadGameDataForTests } from './testSupport';

const data = loadGameDataForTests();
data.global.connection.maxRooms = 2;
let stop: () => Promise<void>;
let url = '';

beforeAll(async () => {
  const { server, port } = await startServer(0, {
    data,
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
});

describe('límites de salas', () => {
  it('no se puede crear una sala con un código que ya existe', async () => {
    const a = await new Client(url).create('match', { code: 'AAAAAA', nick: 'Ana' });
    await expect(
      new Client(url).create('match', { code: 'AAAAAA', nick: 'Intruso' }),
    ).rejects.toBeDefined();
    await a.leave();
  }, 30_000);

  it('con el tope de salas alcanzado crear otra falla, y al cerrarse una vuelve a poderse', async () => {
    const a = await new Client(url).create('match', { code: 'BBBBBB', nick: 'Ana' });
    const b = await new Client(url).create('match', { code: 'CCCCCC', nick: 'Beto' });
    await expect(
      new Client(url).create('match', { code: 'DDDDDD', nick: 'Carla' }),
    ).rejects.toBeDefined();
    await a.leave();
    // La sala vacía se cierra sola; se reintenta hasta que quede el hueco.
    let c = null;
    for (let i = 0; i < 40 && !c; i++) {
      c = await new Client(url)
        .create('match', { code: 'DDDDDD', nick: 'Carla' })
        .catch(() => null);
      if (!c) await new Promise((r) => setTimeout(r, 100));
    }
    expect(c).not.toBeNull();
    await c?.leave();
    await b.leave();
  }, 30_000);
});
