import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { walkableFor } from './abilities';
import { doorBlocks, isDoorTrap, syncDoors } from './doors';
import { tileIndex } from './grid';
import { rulesOf } from './rules';
import { step } from './step';
import { canClaim } from './tasks';
import { duel, pt, run, spawn } from './testUtils';
import { walkDistances } from './rules';
import type { MatchState, Trap } from './types';
import type { DataSet } from '../data';

/**
 * Arena: un pasillo horizontal de suelo (y = 40, x 10..24). Del x 17 al 24 es territorio del jugador 1 (con una sala de
 * Guarida de 1 tile al final, en x 24); del 10 al 16, tierra de nadie. La puerta se pone en x 17.
 */
function arena() {
  const { state, data } = duel();
  const rules = rulesOf(data);
  const neutral = data.terrain.findIndex((t) => t.id === 'neutralFloor');
  const claimed = data.terrain.findIndex((t) => t.id === 'claimedFloor');
  const Y = 40;
  for (let x = 10; x <= 24; x++) {
    const i = tileIndex(state, x, Y);
    state.terrain[i] = x >= 17 ? claimed : neutral;
    state.owner[i] = x >= 17 ? 1 : 0;
  }
  const lair = tileIndex(state, 24, Y);
  state.rooms.push({
    id: state.nextRoomId++,
    type: 'lair',
    owner: 1,
    tiles: [lair],
    timer: 0,
    stock: 0,
  });
  state.roomAt[lair] = state.rooms[state.rooms.length - 1]!.id;
  state.mapVersion++;
  return { state, data, rules, Y, door: tileIndex(state, 17, Y), lair };
}

function addDoor(
  state: MatchState,
  data: DataSet,
  type: string,
  tile: number,
  patch: Partial<Trap> = {},
): Trap {
  const def = data.traps.find((t) => t.id === type)!;
  const trap: Trap = {
    id: state.nextTrapId++,
    type,
    owner: 1,
    tile,
    built: true,
    readyAt: 0,
    hp: def.hp,
    usesLeft: 0,
    revealed: true,
    ...patch,
  };
  state.traps.push(trap);
  syncDoors(state, rulesOf(data));
  return trap;
}

describe('datos de las puertas', () => {
  it('hay una puerta básica sin requisitos y una reforzada que pide Taller', () => {
    const { data } = duel();
    const basic = data.traps.find((t) => t.id === 'basicDoor')!;
    const reinforced = data.traps.find((t) => t.id === 'reinforcedDoor')!;
    expect(basic.family).toBe('door');
    expect(basic.requiresRooms).toEqual([]);
    expect(reinforced.family).toBe('door');
    expect(reinforced.requiresRooms).toEqual(['workshop']);
    expect(reinforced.hp).toBeGreaterThan(basic.hp);
  });
});

describe('construir una puerta', () => {
  it('la básica se coloca en suelo propio sin pedir salas, nace revelada y la termina un Imp', () => {
    const { state, data, door } = arena();
    state.players[0]!.gold = 1000;
    const res = applyCommand(state, data, 1, {
      type: 'buildTrap',
      trap: 'basicDoor',
      tile: pt(17, 40),
    });
    expect(res.ok).toBe(true);
    step(state, data);
    const trap = state.traps.find((t) => t.tile === door)!;
    expect(trap).toMatchObject({ type: 'basicDoor', owner: 1, built: false, revealed: true });
    expect(state.players[0]!.gold).toBe(1000 - 250);
    // Sin terminar no cierra el paso.
    expect(state.doorAt[door]).toBe(0);
    // Un Imp propio al lado la construye (15 s de trabajo).
    const imp = state.imps.find((i) => i.owner === 1)!;
    imp.x = 18.5;
    imp.y = 40.5;
    run(state, data, 400);
    expect(trap.built).toBe(true);
    expect(state.doorAt[door]).toBe(1);
  });

  it('la reforzada pide Taller (REQUIRES_ROOM) y fuera de suelo propio es INVALID_TARGET', () => {
    const { state, data } = arena();
    state.players[0]!.gold = 5000;
    expect(
      applyCommand(state, data, 1, { type: 'buildTrap', trap: 'reinforcedDoor', tile: pt(17, 40) }),
    ).toEqual({ ok: false, error: 'REQUIRES_ROOM' });
    expect(
      applyCommand(state, data, 1, { type: 'buildTrap', trap: 'basicDoor', tile: pt(12, 40) }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });
});

describe('quién pasa por la puerta', () => {
  it('su dueño la cruza y los demás no (criaturas y distancias de camino)', () => {
    const { state, data, rules, door, Y } = arena();
    addDoor(state, data, 'basicDoor', door);
    expect(doorBlocks(state, door, 2)).toBe(true);
    expect(doorBlocks(state, door, 1)).toBe(false);
    const mine = spawn(state, data, 1, 'goblin', 20.5, Y + 0.5);
    const theirs = spawn(state, data, 2, 'goblin', 15.5, Y + 0.5);
    expect(walkableFor(state, rules, mine)(door)).toBe(true);
    expect(walkableFor(state, rules, theirs)(door)).toBe(false);
    const from = tileIndex(state, 15, Y);
    const to = tileIndex(state, 20, Y);
    expect(Number.isFinite(walkDistances(state, rules, from, 1)[to] as number)).toBe(true);
    expect(walkDistances(state, rules, from, 2)[to]).toBe(Infinity);
    // Sin indicar quién anda (compatibilidad), se ignoran las puertas.
    expect(Number.isFinite(walkDistances(state, rules, from)[to] as number)).toBe(true);
  });

  it('una puerta sin terminar no cierra nada', () => {
    const { state, data, door } = arena();
    addDoor(state, data, 'basicDoor', door, { built: false });
    expect(state.doorAt[door]).toBe(0);
  });

  it('syncDoors sube mapVersion solo si cambia algo', () => {
    const { state, data, rules, door } = arena();
    const v = state.mapVersion;
    expect(syncDoors(state, rules)).toBe(false);
    expect(state.mapVersion).toBe(v);
    addDoor(state, data, 'basicDoor', door);
    expect(state.mapVersion).toBe(v + 1);
    expect(isDoorTrap(rules, state.traps[0]!)).toBe(true);
  });

  it('un rival no puede reclamar el suelo con una puerta tuya encima', () => {
    const { state, data, rules, door } = arena();
    expect(canClaim(state, rules, door, 2)).toBe(true); // sin puerta, sí (suelo enemigo sin sala)
    addDoor(state, data, 'basicDoor', door);
    expect(canClaim(state, rules, door, 2)).toBe(false);
  });

  it('no se dispara: una puerta nunca produce trampTriggered ni gasta vida por disparos', () => {
    const { state, data, door, Y } = arena();
    const trap = addDoor(state, data, 'basicDoor', door);
    spawn(state, data, 2, 'goblin', 16.5, Y + 0.5);
    const events = run(state, data, 50);
    expect(events.some((e) => e.type === 'trapTriggered')).toBe(false);
    expect(trap.hp).toBeGreaterThan(0);
  });
});

describe('romper y quitar puertas', () => {
  it('vender o destruir una puerta libera el paso y sube mapVersion', () => {
    const { state, data, door } = arena();
    state.players[0]!.gold = 0;
    addDoor(state, data, 'basicDoor', door);
    const v = state.mapVersion;
    expect(applyCommand(state, data, 1, { type: 'sellTrap', tile: pt(17, 40) }).ok).toBe(true);
    step(state, data);
    expect(state.doorAt[door]).toBe(0);
    expect(state.traps).toHaveLength(0);
    expect(state.mapVersion).toBeGreaterThan(v);
  });

  it('eliminar al dueño abre sus puertas', () => {
    const { state, data, rules, door } = arena();
    addDoor(state, data, 'basicDoor', door);
    state.traps = state.traps.filter((t) => t.owner !== 1);
    expect(syncDoors(state, rules)).toBe(true);
    expect(state.doorAt[door]).toBe(0);
  });

  it('los Imps del dueño reparan una puerta dañada', () => {
    const { state, data, door } = arena();
    const trap = addDoor(state, data, 'basicDoor', door, { hp: 100 });
    const imp = state.imps.find((i) => i.owner === 1)!;
    imp.x = 18.5;
    imp.y = 40.5;
    run(state, data, 400);
    expect(trap.hp).toBeGreaterThan(100);
  });
});

describe('las criaturas enemigas rompen la puerta que les cierra el paso', () => {
  it('un asalto a la sala tras la puerta: golpea la puerta, la rompe y sigue hacia la sala', () => {
    const { state, data, door, lair, Y } = arena();
    state.players[0]!.eliminated = false;
    // El dueño de la puerta no tiene defensores a la vista: solo el goblin atacante.
    const door1 = addDoor(state, data, 'basicDoor', door, { hp: 300 });
    const attacker = spawn(state, data, 2, 'goblin', 13.5, Y + 0.5, {
      assaultKind: 'structure',
      assaultId: lair,
    });
    let sawDoorTarget = false;
    for (let n = 0; n < 1800 && state.traps.some((t) => t.id === door1.id); n++) {
      step(state, data);
      if (attacker.doorTarget === door) sawDoorTarget = true;
    }
    expect(sawDoorTarget).toBe(true);
    // La puerta cayó: sin trampa y sin bloqueo.
    expect(state.traps.some((t) => t.id === door1.id)).toBe(false);
    expect(state.doorAt[door]).toBe(0);
    // Y ya puede pasar: el asalto a la sala sigue en pie.
    run(state, data, 600);
    expect(attacker.x).toBeGreaterThan(17.5);
    expect(attacker.doorTarget).toBe(-1);
  });

  it('un rival sin puertas enemigas por medio no pierde tiempo buscando (sin doorTarget)', () => {
    const { state, data, lair, Y } = arena();
    const attacker = spawn(state, data, 2, 'goblin', 13.5, Y + 0.5, {
      assaultKind: 'structure',
      assaultId: lair,
    });
    run(state, data, 100);
    expect(attacker.doorTarget).toBe(-1);
  });

  it('los golpes a una puerta no dan experiencia', () => {
    const { state, data, door, lair, Y } = arena();
    // Con mucha vida la puerta sigue en pie y no se llega a golpear la sala de detrás (que sí daría experiencia).
    const door1 = addDoor(state, data, 'basicDoor', door, { hp: 100000 });
    const attacker = spawn(state, data, 2, 'goblin', 15.5, Y + 0.5, {
      assaultKind: 'structure',
      assaultId: lair,
    });
    const xp = attacker.xp;
    run(state, data, 300);
    expect(door1.hp).toBeLessThan(100000); // sí la golpeó
    expect(attacker.xp).toBe(xp);
  });
});
