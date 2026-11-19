import { describe, expect, it } from 'vitest';
import { countStats, newMatchStats } from '@dm/shared';
import { localStatsRows } from './endStats';

describe('estadísticas de fin de partida', () => {
  it('cuentan oro, criaturas atraídas y perdidas y daño al Corazón rival', () => {
    const stats = newMatchStats([1, 2]);
    countStats(stats, [
      { type: 'goldDeposited', playerId: 1, impId: 1, amount: 120 },
      { type: 'creatureArrived', playerId: 1, creatureId: 5, creature: 'goblin' },
      { type: 'creatureDied', playerId: 2, creatureId: 9, cause: 'combat' },
      { type: 'creatureLeft', playerId: 2, creatureId: 10 },
      { type: 'creatureDied', playerId: 2, creatureId: 11, cause: 'eliminated' },
      {
        type: 'hit',
        attackerOwner: 1,
        targetOwner: 2,
        targetKind: 'heart',
        damage: 300,
        x: 1,
        y: 1,
      },
      {
        type: 'hit',
        attackerOwner: 1,
        targetOwner: 2,
        targetKind: 'creature',
        damage: 50,
        x: 1,
        y: 1,
      },
    ]);
    expect(stats.get(1)).toEqual({
      goldMined: 120,
      creaturesLost: 0,
      creaturesAttracted: 1,
      heartDamage: 300,
    });
    expect(stats.get(2)).toEqual({
      goldMined: 0,
      creaturesLost: 2,
      creaturesAttracted: 0,
      heartDamage: 0,
    });
  });

  it('ignora a jugadores desconocidos y los golpes al propio Corazón', () => {
    const stats = newMatchStats([1]);
    countStats(stats, [
      { type: 'goldDeposited', playerId: 7, impId: 1, amount: 5 },
      {
        type: 'hit',
        attackerOwner: 1,
        targetOwner: 1,
        targetKind: 'heart',
        damage: 99,
        x: 0,
        y: 0,
      },
    ]);
    expect(stats.get(1)!.heartDamage).toBe(0);
  });

  it('en local el jugador es "Tú" y los demás son Bot 1, Bot 2...', () => {
    const rows = localStatsRows(newMatchStats([1, 2, 3]), 1);
    expect(rows.map((r) => r.nick)).toEqual(['Tú', 'Bot 1', 'Bot 2']);
  });
});
