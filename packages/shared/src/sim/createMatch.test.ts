import { describe, expect, it } from 'vitest';
import { createMatch } from './createMatch';
import { hashState } from './hashState';
import { tileIndex } from './grid';
import { loadData, matchAtCorner0, terrainId } from './testUtils';

describe('createMatch', () => {
  const data = loadData();

  it('carga el mapa con su tamaño y versión inicial', () => {
    const s = createMatch({ playerCount: 2 }, data, 1);
    expect(s.width).toBe(64);
    expect(s.height).toBe(64);
    expect(s.terrain).toHaveLength(64 * 64);
    expect(s.mapVersion).toBe(1);
    expect(s.tick).toBe(0);
  });

  it('da a cada jugador el oro, el maná, el Corazón y 4 Imps iniciales', () => {
    const s = createMatch({ playerCount: 4 }, data, 3);
    expect(s.players.map((p) => p.id)).toEqual([1, 2, 3, 4]);
    for (const p of s.players) {
      expect(p.gold).toBe(5000);
      expect(p.mana).toBe(2000);
      expect(p.heartHp).toBe(8000);
      expect(s.imps.filter((i) => i.owner === p.id)).toHaveLength(4);
      const types = s.rooms
        .filter((r) => r.owner === p.id)
        .map((r) => r.type)
        .sort();
      expect(types).toEqual(['heart', 'portal', 'treasury']);
    }
  });

  it('las entidades salen ordenadas por id', () => {
    const s = createMatch({ playerCount: 4 }, data, 3);
    expect(s.imps.map((i) => i.id)).toEqual(s.imps.map((_, n) => n + 1));
    const ids = s.rooms.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('la semilla decide las esquinas: misma semilla igual, semillas distintas pueden diferir', () => {
    const a = createMatch({ playerCount: 4 }, data, 11);
    expect(hashState(createMatch({ playerCount: 4 }, data, 11))).toBe(hashState(a));
    const slotSets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      slotSets.add(
        createMatch({ playerCount: 4 }, data, seed)
          .players.map((p) => p.slot)
          .join(','),
      );
    }
    expect(slotSets.size).toBeGreaterThan(5);
  });

  it('con 2 jugadores usa esquinas opuestas y rellena de roca las libres', () => {
    const s = createMatch({ playerCount: 2 }, data, 5);
    expect(s.players.map((p) => p.slot).sort()).toEqual([0, 2]);
    for (const base of data.map.bases.filter((b) => ![0, 2].includes(b.slot))) {
      expect(terrainId(s, data, base.claimed.x + 4, base.claimed.y + 4)).toBe('solidRock');
    }
    expect(s.imps).toHaveLength(8);
  });

  it('con 3 jugadores la esquina libre queda como roca sólida', () => {
    const s = createMatch({ playerCount: 3 }, data, 9);
    expect(s.players).toHaveLength(3);
    expect(s.players.map((p) => p.slot).sort()).toEqual([0, 1, 2]);
    const free = data.map.bases.find((b) => b.slot === 3)!;
    expect(terrainId(s, data, free.claimed.x + 4, free.claimed.y + 4)).toBe('solidRock');
  });

  it('admite un solo jugador (sandbox)', () => {
    const s = createMatch({ playerCount: 1 }, data, 2);
    expect(s.players).toHaveLength(1);
    expect(s.players[0]!.slot).toBe(0);
  });

  it('rechaza un número de jugadores sin esquinas definidas', () => {
    expect(() => createMatch({ playerCount: 7 }, data, 1)).toThrow();
  });

  it('el suelo de cada base es del jugador y las vetas traen su oro', () => {
    const { state } = matchAtCorner0();
    expect(state.owner[tileIndex(state, 3, 8)]).toBe(1);
    expect(state.owner[tileIndex(state, 14, 4)]).toBe(0);
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBe(600);
  });

  it('el estado es plano: sobrevive a JSON sin cambiar de huella', () => {
    const s = createMatch({ playerCount: 4 }, data, 8);
    expect(hashState(JSON.parse(JSON.stringify(s)))).toBe(hashState(s));
  });
});
