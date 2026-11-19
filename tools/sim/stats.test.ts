import { describe, expect, it } from 'vitest';
import { checkGate4, summarize, type GameRecord } from './stats';

const game = (over: Partial<GameRecord>): GameRecord => ({
  seed: 1,
  players: 4,
  ticks: 12000,
  winners: [1],
  reason: 'lastStanding',
  slots: { 1: 0, 2: 1, 3: 2, 4: 3 },
  rejected: {},
  commands: 100,
  ms: 5,
  goldMined: 1200,
  ...over,
});

describe('summarize', () => {
  it('calcula duración media, mediana, mínimo y máximo en minutos', () => {
    const s = summarize([game({ ticks: 6000 }), game({ ticks: 12000 }), game({ ticks: 24000 })]);
    expect(s.minutes.mean).toBeCloseTo(23.33, 1);
    expect(s.minutes.median).toBe(20);
    expect(s.minutes.min).toBe(10);
    expect(s.minutes.max).toBe(40);
  });

  it('cuenta victorias y partidas por esquina y la tasa de victoria', () => {
    const s = summarize([
      game({ winners: [1] }),
      game({ winners: [1] }),
      game({ winners: [3] }),
      game({ winners: [2] }),
    ]);
    expect(s.winsBySlot).toEqual({ 0: 2, 2: 1, 1: 1 });
    expect(s.gamesBySlot).toEqual({ 0: 4, 1: 4, 2: 4, 3: 4 });
    expect(s.winRateBySlot[0]).toBe(0.5);
    expect(s.winRateBySlot[3]).toBe(0);
  });

  it('los empates y las partidas sin terminar no suman victorias', () => {
    const s = summarize([
      game({ winners: [1, 2], reason: 'draw' }),
      game({ winners: [], reason: 'unfinished' }),
    ]);
    expect(s.draws).toBe(1);
    expect(s.finished).toBe(1);
    expect(s.winsBySlot).toEqual({});
    expect(s.reasons).toEqual({ draw: 1, unfinished: 1 });
  });

  it('las partidas con error no cuentan para la duración y se anotan', () => {
    const s = summarize([
      game({ ticks: 6000 }),
      game({ error: 'boom', ticks: 0, reason: 'error' }),
    ]);
    expect(s.errors).toBe(1);
    expect(s.minutes.mean).toBe(10);
  });

  it('suma los comandos rechazados y calcula el oro por minuto y las criaturas medias', () => {
    const s = summarize([
      game({
        ticks: 6000,
        rejected: { NO_GOLD: 2 },
        goldMined: 1000,
        creaturesAt10: [4, 6],
        creaturesAt20: [8, 8],
      }),
      game({
        ticks: 6000,
        rejected: { NO_GOLD: 1, COOLDOWN: 3 },
        goldMined: 1000,
        creaturesAt10: [5, 5],
        creaturesAt20: [6, 6],
      }),
    ]);
    expect(s.rejected).toEqual({ NO_GOLD: 3, COOLDOWN: 3 });
    expect(s.goldPerMinute).toBe(100);
    expect(s.creaturesAt10).toBe(5);
    expect(s.creaturesAt20).toBe(7);
  });
});

describe('checkGate4', () => {
  const ok = summarize(
    Array.from({ length: 8 }, (_, i) => game({ ticks: 12000, winners: [(i % 4) + 1] })),
  );

  it('cumple con partidas de 20 minutos y victorias repartidas', () => {
    expect(checkGate4(ok, 4)).toEqual({ ok: true, problems: [] });
  });

  it('falla si hay errores, si la duración sale del rango o si una esquina pasa del 30 %', () => {
    expect(checkGate4(summarize([game({ error: 'x', reason: 'error' })]), 4).ok).toBe(false);
    expect(checkGate4(summarize([game({ ticks: 3000 })]), 4).problems.join()).toContain(
      'duración media',
    );
    expect(checkGate4(summarize([game({ ticks: 40000 })]), 4).problems.join()).toContain(
      'duración media',
    );
    const biased = summarize(Array.from({ length: 10 }, () => game({ winners: [1] })));
    expect(checkGate4(biased, 4).problems.join()).toContain('la esquina 0 gana el 100 %');
  });

  it('el límite del 30 % por esquina solo se exige con 4 jugadores', () => {
    const two = summarize(
      Array.from({ length: 4 }, () => game({ players: 2, winners: [1], slots: { 1: 0, 2: 2 } })),
    );
    expect(checkGate4(two, 2).ok).toBe(true);
  });
});
