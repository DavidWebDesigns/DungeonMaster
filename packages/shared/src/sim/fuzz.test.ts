/**
 * Comandos mal formados o malintencionados: el servidor es autoritativo y recibe lo que mande el cliente, así que
 * `applyCommand` nunca debe lanzar una excepción (tumbaría la sala) ni dejar la partida inservible.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand, previewCommand } from './applyCommand';
import { createMatch } from './createMatch';
import { hashState } from './hashState';
import { nextFloat, type RngHolder } from './rng';
import { step } from './step';
import type { Command } from './types';
import { loadData } from './testUtils';

const data = loadData();

const TYPES = [
  'dig',
  'cancelDig',
  'claim',
  'reinforce',
  'cancelRally',
  'buildRoom',
  'sellRoom',
  'castSpell',
  'pickUp',
  'buildTrap',
  'sellTrap',
  'drop',
  'slap',
  'ñ',
  '',
  'constructor',
  '__proto__',
];

function junk(rng: RngHolder, depth = 0): unknown {
  const r = nextFloat(rng);
  if (r < 0.15) return Math.floor(nextFloat(rng) * 70) - 3; // coordenadas cerca del mapa
  if (r < 0.25)
    return [0, -1, 1e9, -1e9, 0.5, 63.9999, 64, 2 ** 31, Infinity, -Infinity, NaN][
      Math.floor(nextFloat(rng) * 11)
    ];
  if (r < 0.35)
    return ['', 'lair', 'spikeTrap', 'lightning', 'goblin', 'x'.repeat(5000), '__proto__'][
      Math.floor(nextFloat(rng) * 7)
    ];
  if (r < 0.4) return null;
  if (r < 0.45) return undefined;
  if (r < 0.5) return nextFloat(rng) < 0.5;
  if (depth < 3 && r < 0.75)
    return Array.from({ length: Math.floor(nextFloat(rng) * 6) }, () => junk(rng, depth + 1));
  if (depth < 3) {
    const o: Record<string, unknown> = {};
    for (const k of [
      'x',
      'y',
      'w',
      'h',
      'tile',
      'tiles',
      'rect',
      'room',
      'trap',
      'spell',
      'id',
      'kind',
      'target',
      'creature',
    ])
      if (nextFloat(rng) < 0.4) o[k] = junk(rng, depth + 1);
    return o;
  }
  return 7;
}

function randomCommand(rng: RngHolder): Command {
  const cmd: Record<string, unknown> = { type: TYPES[Math.floor(nextFloat(rng) * TYPES.length)] };
  for (const k of [
    'tiles',
    'tile',
    'rect',
    'room',
    'trap',
    'spell',
    'target',
    'creature',
    'id',
    'kind',
  ])
    if (nextFloat(rng) < 0.7) cmd[k] = junk(rng);
  return cmd as unknown as Command;
}

describe('comandos de basura', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    '3000 comandos aleatorios mal formados (semilla %i) nunca lanzan y la partida sigue',
    (seed) => {
      const state = createMatch({ playerCount: 2 }, data, 11 + seed);
      const rng: RngHolder = { rng: 12345 * seed };
      let validated = 0;
      for (let i = 0; i < 3000; i++) {
        const cmd = randomCommand(rng);
        const who = i % 3 === 0 ? 2 : 1;
        // Sin el límite de ritmo de por medio: lo que se prueba es la validación, no el contador.
        for (const p of state.players) p.rateCount = 0;
        expect(() => previewCommand(state, data, who, cmd)).not.toThrow();
        let res;
        expect(() => (res = applyCommand(state, data, who, cmd))).not.toThrow();
        expect(typeof (res as unknown as { ok: boolean }).ok).toBe('boolean');
        const r = res as unknown as { ok: boolean; error?: string };
        if (r.error !== 'RATE_LIMIT') validated++;
        if (i % 20 === 0) expect(() => step(state, data)).not.toThrow();
      }
      // Sigue siendo una partida válida y se puede resumir.
      for (let i = 0; i < 100; i++) step(state, data);
      expect(typeof hashState(state)).toBe('string');
      // La prueba no es vacía: casi todo llegó a validarse y algunos comandos al azar eran válidos.
      expect(validated).toBeGreaterThan(2900);
    },
  );

  it.each([1, 2, 3, 4, 5, 6])(
    'comandos casi válidos con un campo corrupto (semilla %i) tampoco lanzan, y algunos se aceptan',
    (seed) => {
      const state = createMatch({ playerCount: 2 }, data, 11 + seed);
      const base = data.map.bases.find((b) => b.slot === state.players[0]!.slot)!.claimed;
      const templates: Array<Record<string, unknown>> = [
        { type: 'dig', tiles: [{ x: base.x - 1, y: base.y }] },
        { type: 'claim', tiles: [{ x: base.x, y: base.y }] },
        { type: 'reinforce', tiles: [{ x: base.x - 1, y: base.y + 1 }] },
        { type: 'reinforce', tiles: [{ x: base.x - 1, y: base.y + 1 }], level: 2 },
        { type: 'reinforce', tiles: [{ x: base.x - 1, y: base.y + 1 }], level: 'x' as never },
        { type: 'reinforce', tiles: [{ x: base.x - 1, y: base.y + 1 }], level: -3 },
        { type: 'buildRoom', room: 'lair', rect: { x: base.x, y: base.y, w: 3, h: 3 } },
        { type: 'sellRoom', tile: { x: base.x, y: base.y } },
        { type: 'castSpell', spell: 'createImp', target: { x: base.x, y: base.y } },
        { type: 'castSpell', spell: 'lightning', target: { x: base.x, y: base.y } },
        { type: 'buildTrap', trap: 'spikeTrap', tile: { x: base.x, y: base.y } },
        { type: 'buildTrap', trap: 'basicDoor', tile: { x: base.x - 1, y: base.y + 2 } },
        { type: 'pickUp', id: 1, kind: 'imp' },
        { type: 'drop', tile: { x: base.x, y: base.y } },
        { type: 'slap', id: 1 },
      ];
      const rng: RngHolder = { rng: 777 * seed };
      let ok = 0;
      for (let i = 0; i < 3000; i++) {
        for (const p of state.players) p.rateCount = 0;
        const cmd = structuredClone(templates[i % templates.length]!);
        // Corrompe un campo (o el subcampo de un objeto) con basura.
        const keys = Object.keys(cmd).filter((k) => k !== 'type');
        const k = keys[Math.floor(nextFloat(rng) * keys.length)]!;
        if (nextFloat(rng) < 0.6) {
          const v = cmd[k];
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            const sub = Object.keys(v);
            (v as Record<string, unknown>)[sub[Math.floor(nextFloat(rng) * sub.length)]!] =
              junk(rng);
          } else cmd[k] = junk(rng);
        }
        let res;
        try {
          res = applyCommand(state, data, 1, cmd as unknown as Command);
        } catch (e) {
          throw new Error(`Lanzó con ${JSON.stringify(cmd)}`, { cause: e });
        }
        if ((res as unknown as { ok: boolean }).ok) ok++;
        if (i % 10 === 0) expect(() => step(state, data)).not.toThrow();
      }
      expect(ok).toBeGreaterThan(100);
      expect(typeof hashState(state)).toBe('string');
    },
  );

  it('valores que no son comandos (null, números, texto) se rechazan sin lanzar', () => {
    const state = createMatch({ playerCount: 2 }, data, 11);
    for (const bad of [
      null,
      undefined,
      0,
      7,
      'dig',
      [],
      [1, 2],
      true,
      {},
      { type: 5 },
      { type: null },
    ]) {
      let res;
      expect(() => (res = applyCommand(state, data, 1, bad as unknown as Command))).not.toThrow();
      expect((res as unknown as { ok: boolean }).ok).toBe(false);
    }
  });
});
