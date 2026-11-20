/**
 * Mensajes de red basura: un cliente puede mandar cualquier cosa en cualquier momento. La sesión no debe lanzar
 * excepciones (tumbaría la sala de todos los jugadores) ni dejar de poder terminar la partida.
 */
import { describe, expect, it } from 'vitest';
import { loadGameDataForTests, MSG, nextFloat, type RngHolder } from './testSupport';
import { MatchSession } from './session';

const data = loadGameDataForTests();

function junk(rng: RngHolder, depth = 0): unknown {
  const r = nextFloat(rng);
  if (r < 0.15) return Math.floor(nextFloat(rng) * 70) - 3;
  if (r < 0.25) return [-1, 1e9, 0.5, 2 ** 31, Infinity, NaN][Math.floor(nextFloat(rng) * 6)];
  if (r < 0.35)
    return ['', 'lair', 'goblin', 'x'.repeat(2000), '__proto__', '<b>x</b>'][
      Math.floor(nextFloat(rng) * 6)
    ];
  if (r < 0.4) return null;
  if (r < 0.45) return undefined;
  if (r < 0.5) return nextFloat(rng) < 0.5;
  if (depth < 3 && r < 0.75)
    return Array.from({ length: Math.floor(nextFloat(rng) * 5) }, () => junk(rng, depth + 1));
  if (depth < 3) {
    const o: Record<string, unknown> = {};
    for (const k of ['ready', 'color', 'nick', 'seq', 'cmd', 'type', 'tiles', 'x', 'y', 'id'])
      if (nextFloat(rng) < 0.4) o[k] = junk(rng, depth + 1);
    return o;
  }
  return 3;
}

const TYPES = [...Object.values(MSG), 'otro', '', '__proto__', 'constructor'];

describe('mensajes de basura a la sesión', () => {
  it.each([1, 2, 3, 4])(
    '(semilla %i) ni el lobby ni la partida lanzan y la sesión sigue funcionando',
    (seed) => {
      const rng: RngHolder = { rng: 4242 * seed };
      const s = new MatchSession({
        code: 'ABCDEF',
        data,
        seed: () => 7 + seed,
        countdownSeconds: 1,
      });
      expect(s.join('a', 'Ana').ok).toBe(true);
      expect(s.join('b', 'Beto').ok).toBe(true);
      const clients = ['a', 'b', 'intruso'];
      const flood = (n: number) => {
        for (let i = 0; i < n; i++) {
          const who = clients[Math.floor(nextFloat(rng) * clients.length)]!;
          const type = TYPES[Math.floor(nextFloat(rng) * TYPES.length)]!;
          // A veces un comando bien formado en la envoltura pero con la orden corrupta.
          const payload =
            type === MSG.cmd && nextFloat(rng) < 0.7 ? { seq: i, cmd: junk(rng) } : junk(rng);
          expect(() => s.handle(who, type, payload)).not.toThrow();
          if (i % 7 === 0) expect(() => s.tick()).not.toThrow();
          s.drain();
        }
      };
      // Lobby.
      flood(300);
      // Empieza de verdad (si el azar no lo dejó en un estado raro) y se sigue inundando ya jugando.
      s.handle('b', MSG.ready, { ready: true });
      s.handle('a', MSG.start, {});
      for (let i = 0; i < 15; i++) s.tick();
      flood(600);
      for (let i = 0; i < 50; i++) expect(() => s.tick()).not.toThrow();
      // Una desconexión y reconexión en medio tampoco rompe nada.
      expect(() => s.disconnect('b')).not.toThrow();
      flood(100);
      expect(() => s.reconnect('b')).not.toThrow();
      flood(100);
      expect(() => s.handle('a', MSG.cmd, { seq: 1, cmd: { type: 'surrender' } })).not.toThrow();
      for (let i = 0; i < 10; i++) s.tick();
      s.drain();
    },
  );

  it('mensajes sin carga útil (undefined) se ignoran', () => {
    const s = new MatchSession({ code: 'ABCDEF', data, seed: () => 1, countdownSeconds: 1 });
    s.join('a', 'Ana');
    for (const t of TYPES) expect(() => s.handle('a', t, undefined)).not.toThrow();
  });
});
