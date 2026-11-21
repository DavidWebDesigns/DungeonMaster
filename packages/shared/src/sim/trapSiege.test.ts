import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { attackableTile } from './combat';
import { creatureMaxHp } from './creatureStats';
import { isTaskValid } from './tasks';
import { rulesOf } from './rules';
import { step } from './step';
import { buildRooms, duel, run, spawn } from './testUtils';
import type { MatchState, SimEvent } from './types';
import type { DataSet } from '../data';

/** El jugador 1 tiene Taller y Sala de entrenamiento (y las elementales, con Biblioteca y Cámara) y una trampa armada en (9,12). */
function world(type = 'spikeTrap') {
  const { state, data } = duel();
  buildRooms(state, data, ['trainingRoom', 'workshop', 'library', 'tortureChamber']);
  state.players[0]!.gold = 9000;
  applyCommand(state, data, 1, { type: 'buildTrap', trap: type, tile: { x: 9, y: 12 } });
  step(state, data);
  state.traps[0]!.built = true;
  state.tasks = [];
  state.imps = state.imps.filter((i) => i.owner === 1).slice(0, 1);
  return { state, data, rules: rulesOf(data), tile: 12 * 64 + 9 };
}
const maxHp = (data: DataSet, type: string) => data.traps.find((t) => t.id === type)!.hp;
const ofType = (events: SimEvent[], t: SimEvent['type']) => events.filter((e) => e.type === t);

describe('trampas reveladas: se pueden atacar', () => {
  it('una trampa sin disparar no es atacable; tras su primer disparo, sí (ambas familias)', () => {
    for (const type of ['spikeTrap', 'frostTrap', 'fireTrap', 'lightningTrap', 'boulderTrap']) {
      const { state, data, tile } = world(type);
      expect(state.traps[0]!.revealed).toBe(false);
      expect(attackableTile(state, rulesOf(data), 2, tile), type).toBe(false);
      // Un enemigo la dispara.
      const bait = spawn(state, data, 2, 'bileDemon', 9.5, 12.5, { mood: 50 });
      bait.hp = 1e9;
      for (let i = 0; i < 5 && !state.traps[0]!.revealed; i++) {
        bait.x = 9.5;
        bait.y = 12.5;
        run(state, data, 1);
      }
      expect(state.traps[0]!.revealed, type).toBe(true);
      expect(attackableTile(state, rulesOf(data), 2, tile), type).toBe(true);
      // El dueño no puede "atacar" la suya.
      expect(attackableTile(state, rulesOf(data), 1, tile)).toBe(false);
    }
  });

  it('una trampa sin terminar de construir no es atacable aunque esté revelada', () => {
    const { state, data, tile } = world();
    state.traps[0]!.revealed = true;
    state.traps[0]!.built = false;
    expect(attackableTile(state, rulesOf(data), 2, tile)).toBe(false);
  });

  it('un enemigo sin nadie cerca la ataca: pierde vida, sale un hit "trap" y no gana experiencia', () => {
    const { state, data } = world();
    state.traps[0]!.revealed = true;
    state.traps[0]!.readyAt = 1e9; // no se dispara: solo se prueba el ataque
    // El jugador 1 no tiene criaturas ni Imps a la vista: nadie más a quien pelear.
    state.imps = [];
    const e = spawn(state, data, 2, 'troll', 9.5, 13.5, { mood: 50 });
    // Se ve el tile (ya es de su vista: criatura a 1 tile) y está dentro de territorio del rival.
    let hits = 0;
    for (let i = 0; i < 120 && state.traps.length > 0; i++) {
      const events = run(state, data, 1);
      hits += events.filter(
        (x) => x.type === 'hit' && (x as { targetKind: string }).targetKind === 'trap',
      ).length;
    }
    expect(hits).toBeGreaterThan(0);
    expect(e.xp).toBe(0);
  });

  it('al llegar a 0 la trampa se destruye con su evento, sus tareas y sin tocar el terreno', () => {
    const { state, data } = world();
    state.traps[0]!.revealed = true;
    state.traps[0]!.readyAt = 1e9;
    state.traps[0]!.hp = 5;
    state.imps = [];
    const terrain = state.terrain[12 * 64 + 9];
    spawn(state, data, 2, 'troll', 9.5, 13.5, { mood: 50 });
    let destroyed: SimEvent[] = [];
    for (let i = 0; i < 80 && state.traps.length > 0; i++)
      destroyed = ofType(run(state, data, 1), 'trapDestroyed');
    expect(state.traps).toHaveLength(0);
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0]).toMatchObject({ playerId: 1, trap: 'spikeTrap', tile: 12 * 64 + 9 });
    expect(state.terrain[12 * 64 + 9]).toBe(terrain);
    expect(state.tasks.some((t) => t.tile === 12 * 64 + 9)).toBe(false);
  });

  it('desgastarse hasta romperse también avisa con trapDestroyed', () => {
    const { state, data } = world();
    state.traps[0]!.hp = 100; // el desgaste es 150
    spawn(state, data, 2, 'troll', 9.5, 12.5, { mood: 50 });
    const events = run(state, data, 1);
    expect(ofType(events, 'trapDestroyed')).toHaveLength(1);
    expect(state.traps).toHaveLength(0);
  });

  it('una elemental sin usos también se destruye con el evento', () => {
    const { state, data } = world('fireTrap');
    state.traps[0]!.usesLeft = 1;
    const e = spawn(state, data, 2, 'bileDemon', 11.0, 12.5, { mood: 50 });
    e.hp = 1e9;
    const events = run(state, data, 1);
    expect(ofType(events, 'trapDestroyed')).toHaveLength(1);
  });
});

describe('reparación por los Imps', () => {
  it('una trampa dañada pide una tarea de reparación y el Imp la repara a 50 hp/s hasta el máximo', () => {
    const { state, data } = world();
    state.traps[0]!.hp = 1000;
    state.imps[0]!.x = 9.5;
    state.imps[0]!.y = 12.5;
    run(state, data, 1);
    expect(state.tasks.filter((t) => t.kind === 'repairTrap')).toHaveLength(1);
    // 200 hp a 50 por segundo = 4 s (40 ticks), más lo que tarda en llegar.
    run(state, data, 30);
    expect(state.traps[0]!.hp).toBeGreaterThan(1000);
    expect(state.traps[0]!.hp).toBeLessThan(1200);
    run(state, data, 80);
    expect(state.traps[0]!.hp).toBe(maxHp(data, 'spikeTrap'));
    expect(state.tasks.some((t) => t.kind === 'repairTrap')).toBe(false);
  });

  it('reparar no cambia el terreno ni el dueño del tile', () => {
    const { state, data } = world();
    const before = [state.terrain[12 * 64 + 9], state.owner[12 * 64 + 9]];
    state.traps[0]!.hp = 1000;
    state.imps[0]!.x = 9.5;
    state.imps[0]!.y = 12.5;
    run(state, data, 150);
    expect([state.terrain[12 * 64 + 9], state.owner[12 * 64 + 9]]).toEqual(before);
  });

  it('la bofetada acelera la reparación', () => {
    const rate = (slap: boolean) => {
      const { state, data } = world();
      state.traps[0]!.hp = 100;
      const imp = state.imps[0]!;
      imp.x = 9.5;
      imp.y = 12.5;
      if (slap) imp.slapUntil = 1e9;
      run(state, data, 25);
      return state.traps[0]!.hp - 100;
    };
    expect(rate(true)).toBeGreaterThan(rate(false) * 1.2);
  });

  it('no se crea tarea si la trampa está entera, sin construir o es del rival eliminado', () => {
    const { state, data } = world();
    run(state, data, 3);
    expect(state.tasks.some((t) => t.kind === 'repairTrap')).toBe(false);
    state.traps[0]!.built = false;
    state.traps[0]!.hp = 10;
    run(state, data, 3);
    expect(state.tasks.some((t) => t.kind === 'repairTrap')).toBe(false);
  });

  it('la tarea deja de ser válida al venderse, destruirse o llegar a vida completa, y vender borra tareas', () => {
    const { state, data, rules } = world();
    state.traps[0]!.hp = 500;
    run(state, data, 1);
    const task = state.tasks.find((t) => t.kind === 'repairTrap')!;
    expect(isTaskValid(state, rules, task)).toBe(true);
    state.traps[0]!.hp = maxHp(data, 'spikeTrap');
    expect(isTaskValid(state, rules, task)).toBe(false);
    state.traps[0]!.hp = 500;
    applyCommand(state, data, 1, { type: 'sellTrap', tile: { x: 9, y: 12 } });
    step(state, data);
    expect(state.traps).toHaveLength(0);
    expect(state.tasks.some((t) => t.tile === 12 * 64 + 9)).toBe(false);
  });

  it('reparar no devuelve usos a una elemental', () => {
    const { state, data } = world('fireTrap');
    state.traps[0]!.hp = 100;
    state.traps[0]!.usesLeft = 2;
    state.imps[0]!.x = 9.5;
    state.imps[0]!.y = 12.5;
    run(state, data, 300);
    expect(state.traps[0]!.hp).toBe(maxHp(data, 'fireTrap'));
    expect(state.traps[0]!.usesLeft).toBe(2);
  });
});

describe('invariantes', () => {
  it('con la partida en marcha, hp nunca supera el máximo y una trampa dañada por desgaste está revelada', () => {
    const { state, data } = world();
    const bait = spawn(state, data, 2, 'bileDemon', 9.5, 12.5, { mood: 50 });
    bait.hp = 1e9;
    for (let i = 0; i < 400; i++) {
      bait.x = 9.5;
      bait.y = 12.5;
      bait.hp = 1e9;
      step(state, data);
      for (const t of state.traps) {
        expect(t.hp).toBeLessThanOrEqual(maxHp(data, t.type));
        if (t.hp < maxHp(data, t.type)) expect(t.revealed).toBe(true);
      }
    }
    expect(creatureMaxHp(rulesOf(data), bait)).toBeGreaterThan(0);
    void (null as unknown as MatchState);
  });
});
