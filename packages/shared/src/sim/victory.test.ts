import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { creatureMaxHp } from './creatureStats';
import { tileIndex } from './grid';
import { rulesOf } from './rules';
import { step } from './step';
import { tiebreakValues } from './victory';
import { duel, run, spawn } from './testUtils';
import { createMatch } from './createMatch';
import { loadData } from './testUtils';

const MAX_TICKS = 45 * 60 * 10;

describe('eliminación', () => {
  it('con el Corazón a 0 el jugador cae: sus criaturas mueren, sus salas y suelo pasan a neutral y su oro desaparece', () => {
    const { state, data } = duel();
    spawn(state, data, 1, 'goblin', 4.5, 8.5);
    state.players[0]!.gold = 4000;
    state.players[0]!.heartHp = 0;
    const events = run(state, data, 1);
    expect(events.some((e) => e.type === 'eliminated' && e.playerId === 1)).toBe(true);
    expect(state.creatures.filter((c) => c.owner === 1)).toHaveLength(0);
    expect(state.imps.filter((i) => i.owner === 1)).toHaveLength(0);
    expect(state.rooms.filter((r) => r.owner === 1)).toHaveLength(0);
    expect(state.owner[tileIndex(state, 3, 8)]).toBe(0);
    expect(data.terrain[state.terrain[tileIndex(state, 3, 8)] as number]!.id).toBe('neutralFloor');
    expect(state.players[0]!.gold).toBe(0);
    expect(state.players[0]!.eliminated).toBe(true);
  });

  it('el último en pie gana', () => {
    const { state, data } = duel();
    state.players[1]!.heartHp = -5;
    run(state, data, 1);
    expect(state.status).toBe('ended');
    expect(state.result).toMatchObject({ winners: [1], reason: 'lastStanding' });
  });

  it('si los dos últimos Corazones caen en el mismo tick es empate entre ellos', () => {
    const { state, data } = duel();
    state.players[0]!.heartHp = 0;
    state.players[1]!.heartHp = 0;
    run(state, data, 1);
    expect(state.result).toMatchObject({ winners: [1, 2], reason: 'draw' });
  });

  it('con tres jugadores, la partida sigue hasta que queda uno', () => {
    const data = loadData();
    data.global.portal.attractIntervalSeconds = 100000;
    const state = createMatch({ playerCount: 3 }, data, 5);
    state.players[0]!.heartHp = 0;
    run(state, data, 1);
    expect(state.status).toBe('playing');
    state.players[1]!.heartHp = 0;
    run(state, data, 1);
    expect(state.status).toBe('ended');
    expect(state.result!.winners).toEqual([3]);
  });

  it('una partida de un solo jugador no termina nunca', () => {
    const data = loadData();
    const state = createMatch({ playerCount: 1 }, data, 5);
    run(state, data, 50);
    expect(state.status).toBe('playing');
  });
});

describe('rendición', () => {
  it('surrender elimina al jugador y da la victoria al rival', () => {
    const { state, data } = duel();
    expect(applyCommand(state, data, 2, { type: 'surrender' }).ok).toBe(true);
    run(state, data, 2);
    expect(state.result).toMatchObject({ winners: [1], reason: 'lastStanding' });
  });

  it('una partida terminada ya no avanza ni acepta comandos', () => {
    const { state, data } = duel();
    applyCommand(state, data, 2, { type: 'surrender' });
    run(state, data, 2);
    const tick = state.tick;
    run(state, data, 20);
    expect(state.tick).toBe(tick);
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [{ x: 11, y: 4 }] })).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
  });

  it('un jugador eliminado ya no puede mandar', () => {
    const data = loadData();
    const state = createMatch({ playerCount: 3 }, data, 5);
    applyCommand(state, data, 1, { type: 'surrender' });
    step(state, data);
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [{ x: 11, y: 4 }] })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
  });
});

describe('fin por tiempo y desempate', () => {
  const timeout = () => {
    const m = duel();
    m.state.tick = MAX_TICKS;
    return m;
  };

  it('gana quien tiene más vida de Corazón', () => {
    const { state, data } = timeout();
    state.players[0]!.heartHp = 6000;
    state.players[1]!.heartHp = 4000;
    run(state, data, 1);
    expect(state.result).toMatchObject({ winners: [1], reason: 'timeout' });
  });

  it('si el Corazón empata, gana quien tiene más poder de criaturas (suma de vida máxima)', () => {
    const { state, data } = timeout();
    const rules = rulesOf(data);
    spawn(state, data, 2, 'troll', 40.5, 40.5);
    spawn(state, data, 1, 'goblin', 20.5, 20.5);
    expect(tiebreakValues(state, rules, state.players[1]!).creaturePower).toBe(
      creatureMaxHp(rules, { type: 'troll', level: 1 }),
    );
    run(state, data, 1);
    expect(state.result).toMatchObject({ winners: [2], reason: 'timeout' });
  });

  it('si también empatan en criaturas, gana quien tiene más oro', () => {
    const { state, data } = timeout();
    state.players[0]!.gold = 3000;
    state.players[1]!.gold = 6000;
    run(state, data, 1);
    expect(state.result).toMatchObject({ winners: [2], reason: 'timeout' });
  });

  it('si empatan en todo, es empate', () => {
    const { state, data } = timeout();
    run(state, data, 1);
    expect(state.result).toMatchObject({ winners: [1, 2], reason: 'draw' });
  });

  it('antes de los 45 minutos no se decide por tiempo', () => {
    const { state, data } = duel();
    state.tick = MAX_TICKS - 20;
    run(state, data, 5);
    expect(state.status).toBe('playing');
  });
});
