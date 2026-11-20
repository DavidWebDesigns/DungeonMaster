import { describe, expect, it } from 'vitest';
import { loadData } from '../sim/testUtils';
import { botOptionsFor } from './difficulty';

const data = loadData();

describe('botOptionsFor', () => {
  it('convierte los segundos de pve.json a ticks', () => {
    const o = botOptionsFor(data, 'normal')!;
    const d = data.pve.difficulties.find((x) => x.id === 'normal')!;
    expect(o.attackAfterTicks).toBe(d.bot.attackAfterSeconds * data.global.tickRate);
    expect(o.targetImps).toBe(d.bot.targetImps);
  });

  it('el bot normal conserva el comportamiento de siempre (decide cada segundo y falla un 5 %)', () => {
    const n = botOptionsFor(data, 'normal')!;
    expect(n.thinkEveryTicks).toBe(data.global.tickRate);
    expect(n.mistakeChance).toBe(0.05);
  });

  it('devuelve null si la dificultad no existe', () => {
    expect(botOptionsFor(data, 'inventada')).toBeNull();
  });

  it('las dificultades van de más pasiva a más agresiva', () => {
    const e = botOptionsFor(data, 'easy')!;
    const h = botOptionsFor(data, 'hard')!;
    expect(h.attackAfterTicks!).toBeLessThan(e.attackAfterTicks!);
    expect(h.attackArmy!).toBeLessThan(e.attackArmy!);
    expect(h.targetImps!).toBeGreaterThan(e.targetImps!);
    // Y de más lenta y torpe a más ágil y precisa.
    expect(h.thinkEveryTicks!).toBeLessThan(e.thinkEveryTicks!);
    expect(h.mistakeChance!).toBeLessThan(e.mistakeChance!);
  });
});
