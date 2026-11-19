/**
 * Guarda de contenido: si se añade una criatura, sala, trampa o hechizo a /data sin darle su aspecto o sus textos
 * en el cliente, esta prueba falla y dice qué falta (en vez de que el juego muestre un cubo magenta).
 * Cómo añadir contenido: docs/CONTENIDO.md.
 */
import { describe, expect, it } from 'vitest';
import { loadGameData } from './data/loadGameData';
import { CREATURE_LOOKS, TRAP_LOOKS } from './render/creatureStyle';
import { ROOM_COLORS } from './render/palette';
import { keyAction } from './input/keymap';
import { advisorKnowsCreatures } from './ui/advisor';

const data = loadGameData();

describe('todo el contenido de /data tiene su parte en el cliente', () => {
  it('cada criatura tiene aspecto (placeholder por rol)', () => {
    const missing = data.creatures
      .filter((c) => c.id !== 'imp' && !CREATURE_LOOKS[c.id])
      .map((c) => c.id);
    expect(
      missing,
      `faltan en CREATURE_LOOKS (render/creatureStyle.ts): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('cada sala tiene color', () => {
    const missing = data.rooms.filter((r) => !ROOM_COLORS[r.id]).map((r) => r.id);
    expect(missing, `faltan en ROOM_COLORS (render/palette.ts): ${missing.join(', ')}`).toEqual([]);
  });

  it('cada trampa tiene aspecto', () => {
    const missing = data.traps.filter((t) => !TRAP_LOOKS[t.id]).map((t) => t.id);
    expect(
      missing,
      `faltan en TRAP_LOOKS (render/creatureStyle.ts): ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('cada sala construible y cada trampa tiene atajo de teclado (hasta 9 entre las dos)', () => {
    const buildable = data.rooms.filter((r) => r.buildable);
    expect(
      buildable.length + data.traps.length,
      'hay más de 9 salas y trampas: hace falta otro sistema de atajos',
    ).toBeLessThanOrEqual(9);
    for (let n = 1; n <= buildable.length + data.traps.length; n++)
      expect(keyAction(String(n), data)).not.toBeNull();
  });

  it('las criaturas que llegan por el Portal piden salas que existen y se pueden construir', () => {
    for (const c of data.creatures.filter((k) => k.attraction)) {
      for (const req of c.attraction!.requires) {
        const room = data.rooms.find((r) => r.id === req.room);
        expect(room?.buildable, `${c.id} pide la sala ${req.room}`).toBe(true);
      }
    }
  });

  it('las trampas exigen una sala que se puede construir', () => {
    for (const t of data.traps)
      expect(data.rooms.find((r) => r.id === t.requiresRoom)?.buildable).toBe(true);
  });

  it('el consejero sabe nombrar a todas las criaturas (a partir de los datos)', () => {
    expect(advisorKnowsCreatures(data)).toEqual([]);
  });

  it('cada hechizo tiene su texto de ayuda en el HUD', async () => {
    const { buildHudModel } = await import('./ui/hudModel');
    const { Sandbox } = await import('./sandbox/sandbox');
    const m = buildHudModel(new Sandbox(data, 1).state, data, 1, { kind: 'dig' }, []);
    for (const sp of m.spells) expect(sp.hint, sp.id).not.toBe(sp.name);
  });
});
