import { describe, expect, it } from 'vitest';
import { loadGameData, rawGameData } from './loadGameData';

describe('loadGameData', () => {
  it('carga y valida los datos reales', () => {
    const data = loadGameData();
    expect(data.map.width).toBe(64);
    expect(data.global.tickRate).toBe(10);
    expect(data.rooms.filter((r) => r.buildable)).toHaveLength(10);
  });

  it('falla con un mensaje que dice qué archivo está roto', () => {
    const raw = rawGameData();
    const broken = structuredClone(raw) as { global: { startingGold: number } };
    broken.global.startingGold = -1;
    expect(() => loadGameData(broken as unknown as typeof raw)).toThrow(/global\.json/);
  });
});
