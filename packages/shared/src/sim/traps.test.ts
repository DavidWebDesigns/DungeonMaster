import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { creatureMaxHp } from './creatureStats';
import { tileIndex } from './grid';
import { attractionCandidates, newCreature } from './portal';
import { rulesOf } from './rules';
import { step } from './step';
import { buildRooms, duel, extendTerritory, row, run, spawn } from './testUtils';
import type { Command, MatchState, SimEvent } from './types';
import type { DataSet } from '../data';

/** Partida con territorio libre y, si se pide, una Cámara de tortura ya construida. */
function world(torture: boolean) {
  const { state, data } = duel();
  extendTerritory(state, data);
  // Menos que la capacidad de la Tesorería (9.000), para que vender no recorte el oro.
  state.players[0]!.gold = 9000;
  if (torture) {
    expect(
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'tortureChamber',
        rect: { x: 2, y: 11, w: 3, h: 3 },
      }).ok,
    ).toBe(true);
    step(state, data);
  }
  return { state, data };
}

const trap = (state: MatchState, data: DataSet, id: string, x: number, y: number, pid = 1) => {
  const res = applyCommand(state, data, pid, {
    type: 'buildTrap',
    trap: id,
    tile: { x, y },
  } as Command);
  step(state, data);
  return res;
};

describe('Cámara de tortura', () => {
  it('es una sala construible de 3×3 a 400 por tile que se vende por la mitad', () => {
    const { state, data } = world(true);
    const room = state.rooms.find((r) => r.type === 'tortureChamber')!;
    expect(room.tiles).toHaveLength(9);
    // 9 tiles a 400 con +20 % por tile: 8.318.
    expect(state.players[0]!.gold).toBe(9000 - 8318);
    applyCommand(state, data, 1, { type: 'sellRoom', tile: { x: 2, y: 11 } });
    step(state, data);
    expect(state.players[0]!.gold).toBe(9000 - 8318 + 4159);
  });

  it('atrae a la Torturadora (1 por 3 tiles de Cámara); el Verdugo pide 10 torturadoras y una Cámara de nivel 10', () => {
    const { state, data } = world(true);
    // Guarida para tener camas (con oro de sobra: cada tile cuesta un 20 % más que el anterior).
    state.players[0]!.gold = 50000;
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 6, y: 11, w: 3, h: 3 },
    });
    step(state, data);
    data.global.portal.attractIntervalSeconds = 30;
    const types = new Set<string>();
    for (let n = 0; n < 12; n++) {
      run(state, data, 300);
      for (const c of state.creatures.filter((k) => k.owner === 1)) types.add(c.type);
    }
    expect([...types].sort()).toEqual(['goblin', 'torturer']);
    // Con 3 torturadoras vivas aún no: el Verdugo pide 10 y una Cámara de nivel 10 (la de las pruebas tiene 9 tiles).
    const rules = rulesOf(data);
    for (let i = 0; i < 3; i++)
      state.creatures.push(newCreature(state, rules, 1, 'torturer', 9 * 64 + 9));
    const candidates = attractionCandidates(state, rules, 1, 9 * 64 + 9).candidates.map(
      (c) => c.type,
    );
    expect(candidates).not.toContain('executioner');
  });

  it('el Verdugo y la Torturadora tienen estadísticas propias (provisionales)', () => {
    const rules = rulesOf(duel().data);
    const ex = rules.creatureDefs['executioner']!;
    const to = rules.creatureDefs['torturer']!;
    expect(ex.base.hp).toBeGreaterThan(to.base.hp);
    expect(ex.base.damage).toBeGreaterThan(to.base.damage);
    expect(to.base.speed).toBeGreaterThan(ex.base.speed);
    expect(ex.attraction!.requires).toEqual([{ room: 'tortureChamber', minLevel: 10 }]);
  });
});

/** Partida con las salas pedidas ya construidas (en sus sitios de ROOM_SPOTS) y 9.000 de oro. Las trampas van en (9..10, 11..13). */
function tw(rooms: Parameters<typeof buildRooms>[2]) {
  const { state, data } = duel();
  buildRooms(state, data, rooms);
  state.players[0]!.gold = 9000;
  return { state, data };
}
const PHYSICAL = ['trainingRoom', 'workshop'] as const;
const ALL = ['trainingRoom', 'workshop', 'library', 'tortureChamber'] as const;

describe('colocar trampas', () => {
  it('sin el Taller da REQUIRES_ROOM; las elementales piden además Cámara de tortura y Biblioteca', () => {
    const { state, data } = tw([]);
    expect(trap(state, data, 'spikeTrap', 9, 12)).toEqual({ ok: false, error: 'REQUIRES_ROOM' });
    const m2 = tw([...PHYSICAL]);
    expect(trap(m2.state, m2.data, 'spikeTrap', 9, 12).ok).toBe(true);
    expect(trap(m2.state, m2.data, 'frostTrap', 10, 12)).toEqual({
      ok: false,
      error: 'REQUIRES_ROOM',
    });
    const m3 = tw(['trainingRoom', 'workshop', 'library']);
    expect(trap(m3.state, m3.data, 'frostTrap', 10, 12)).toEqual({
      ok: false,
      error: 'REQUIRES_ROOM',
    });
    const m4 = tw([...ALL]);
    expect(trap(m4.state, m4.data, 'frostTrap', 10, 12).ok).toBe(true);
  });

  it('cobra el coste, crea la trampa sin construir (con su vida o sus usos) y manda construirla a un Imp', () => {
    const { state, data } = tw([...ALL]);
    const gold = state.players[0]!.gold;
    expect(trap(state, data, 'spikeTrap', 9, 12).ok).toBe(true);
    expect(trap(state, data, 'fireTrap', 10, 12).ok).toBe(true);
    expect(state.players[0]!.gold).toBe(gold - 300 - 500);
    expect(state.traps[0]).toMatchObject({
      type: 'spikeTrap',
      owner: 1,
      built: false,
      hp: 1200,
      usesLeft: 0,
    });
    expect(state.traps[1]).toMatchObject({
      type: 'fireTrap',
      built: false,
      hp: 900,
      usesLeft: 5,
      revealed: false,
    });
    expect(state.tasks.filter((t) => t.kind === 'buildTrap')).toHaveLength(2);
  });

  it('los Imps la construyen (20 s) y queda armada', () => {
    const { state, data } = tw([...PHYSICAL]);
    trap(state, data, 'spikeTrap', 9, 12);
    const events = run(state, data, 600);
    expect(state.traps[0]!.built).toBe(true);
    expect(events.filter((e) => e.type === 'trapBuilt')).toHaveLength(1);
  });

  it('errores: tile ocupado, fuera del territorio, sobre una sala, otra trampa o sin oro', () => {
    const { state, data } = tw([...PHYSICAL]);
    expect(trap(state, data, 'spikeTrap', 11, 4)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // muro
    expect(trap(state, data, 'spikeTrap', 30, 30)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // lejos
    expect(trap(state, data, 'spikeTrap', 3, 15)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // sobre una sala
    expect(trap(state, data, 'inventada', 9, 12)).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    expect(trap(state, data, 'spikeTrap', 9, 12).ok).toBe(true);
    expect(trap(state, data, 'boulderTrap', 9, 12)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // ya hay una
    state.players[0]!.gold = 100;
    expect(trap(state, data, 'boulderTrap', 10, 12)).toEqual({ ok: false, error: 'NO_GOLD' });
  });

  it('las paredes aplastantes solo se colocan en un pasillo de 1 tile', () => {
    const { state, data } = tw([...PHYSICAL]);
    expect(trap(state, data, 'crushingWalls', 9, 12)).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    // Un pasillo: muro a izquierda y derecha del tile (10,13).
    const wall = data.terrain.findIndex((t) => t.id === 'solidRock');
    state.terrain[tileIndex(state, 9, 13)] = wall;
    state.terrain[tileIndex(state, 11, 13)] = wall;
    state.mapVersion++;
    expect(trap(state, data, 'crushingWalls', 10, 13).ok).toBe(true);
  });

  it('se vende: devuelve el 50 % si está armada y todo si aún se estaba construyendo', () => {
    const { state, data } = tw([...PHYSICAL]);
    trap(state, data, 'spikeTrap', 9, 12);
    const g = state.players[0]!.gold;
    applyCommand(state, data, 1, { type: 'sellTrap', tile: { x: 9, y: 12 } });
    step(state, data);
    expect(state.players[0]!.gold).toBe(g + 300);
    trap(state, data, 'spikeTrap', 9, 12);
    run(state, data, 800);
    const g2 = state.players[0]!.gold;
    applyCommand(state, data, 1, { type: 'sellTrap', tile: { x: 9, y: 12 } });
    step(state, data);
    expect(state.players[0]!.gold).toBe(g2 + 150);
  });

  it('vender lo ajeno o lo que no existe falla', () => {
    const { state, data } = tw([...PHYSICAL]);
    trap(state, data, 'spikeTrap', 9, 12);
    // Una trampa ajena y un tile sin trampa dan la MISMA respuesta (si no, se podrían sondear trampas ocultas).
    expect(applyCommand(state, data, 2, { type: 'sellTrap', tile: { x: 9, y: 12 } })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(applyCommand(state, data, 1, { type: 'sellTrap', tile: { x: 10, y: 12 } })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });
});

describe('disparar trampas', () => {
  /** Trampa armada al instante en (9,12). */
  function armed(type: string, rooms: Parameters<typeof tw>[0] = [...ALL]) {
    const { state, data } = tw(rooms);
    trap(state, data, type, 9, 12);
    state.traps[0]!.built = true;
    state.tasks = [];
    return { state, data, rules: rulesOf(data) };
  }
  const maxHp = (data: DataSet, c: Parameters<typeof creatureMaxHp>[1]) =>
    creatureMaxHp(rulesOf(data), c);

  it('una trampa sin terminar no se dispara', () => {
    const { state, data } = tw([...PHYSICAL]);
    trap(state, data, 'spikeTrap', 9, 12);
    state.tasks = [];
    const e = spawn(state, data, 2, 'troll', 9.5, 12.5, { mood: 50 });
    const hp = e.hp;
    run(state, data, 5);
    expect(e.hp).toBeLessThanOrEqual(hp);
    expect(state.traps[0]!.built).toBe(false);
  });

  it('los pinchos (física, al pisar) dañan 350, se desgastan 150 y esperan 6 s', () => {
    const { state, data } = armed('spikeTrap');
    const e = spawn(state, data, 2, 'troll', 9.5, 12.5, { mood: 50 });
    const events = run(state, data, 1);
    expect(events.some((x) => x.type === 'trapTriggered')).toBe(true);
    expect(maxHp(data, e) - e.hp).toBeGreaterThanOrEqual(350);
    expect(state.traps[0]!.hp).toBe(1200 - 150);
    // En enfriamiento no vuelve a disparar.
    const hp = e.hp;
    for (let n = 0; n < 30; n++) {
      e.x = 9.5;
      e.y = 12.5;
      step(state, data);
    }
    expect(state.traps[0]!.hp).toBe(1050);
    expect(hp - e.hp).toBeLessThan(350);
  });

  it('una trampa física se rompe al quedarse sin vida', () => {
    const { state, data } = armed('spikeTrap');
    state.traps[0]!.hp = 100; // el desgaste por disparo es 150
    spawn(state, data, 2, 'troll', 9.5, 12.5, { mood: 50 });
    run(state, data, 1);
    expect(state.traps).toHaveLength(0);
  });

  it('una elemental tiene 5 usos y se consume al quinto', () => {
    const { state, data } = armed('fireTrap');
    const e = spawn(state, data, 2, 'bileDemon', 11.0, 12.5, { mood: 50 });
    e.hp = 1e9;
    let shots = 0;
    for (let n = 0; n < 600 && state.traps.length > 0; n++) {
      e.x = 11.0;
      e.y = 12.5;
      e.hp = 1e9;
      shots += step(state, data).filter((x) => x.type === 'trapTriggered').length;
    }
    expect(shots).toBe(5);
    expect(state.traps).toHaveLength(0);
  });

  it('la de fuego (disparo a 3 tiles) daña 360 a todos en 3 tiles y no a los lejanos', () => {
    const { state, data } = armed('fireTrap');
    const a = spawn(state, data, 2, 'bileDemon', 11.5, 12.5, { mood: 50 });
    const b = spawn(state, data, 2, 'bileDemon', 9.5, 14.5, { mood: 50 });
    const far = spawn(state, data, 2, 'bileDemon', 9.5, 19.5, { mood: 50 });
    run(state, data, 1);
    expect(maxHp(data, a) - a.hp).toBeGreaterThanOrEqual(360);
    expect(maxHp(data, b) - b.hp).toBeGreaterThanOrEqual(360);
    expect(far.hp).toBe(maxHp(data, far));
    expect(state.traps[0]!.usesLeft).toBe(4);
  });

  it('la de hielo daña 150 e inmoviliza 3 s a las criaturas en 1,5 tiles', () => {
    const { state, data } = armed('frostTrap');
    const a = spawn(state, data, 2, 'goblin', 9.5, 12.5, { mood: 50 });
    const b = spawn(state, data, 2, 'goblin', 10.5, 12.5, { mood: 50 });
    run(state, data, 1);
    for (const c of [a, b]) expect(c.statuses.find((s) => s.kind === 'root')).toBeDefined();
    expect(maxHp(data, a) - a.hp).toBeGreaterThanOrEqual(150);
  });

  it('la eléctrica salta a los enemigos cercanos y cada salto hace un 25 % menos', () => {
    const { state, data } = armed('lightningTrap');
    const a = spawn(state, data, 2, 'bileDemon', 9.5, 14.0, { mood: 50 });
    const b = spawn(state, data, 2, 'bileDemon', 9.5, 16.0, { mood: 50 });
    const c = spawn(state, data, 2, 'bileDemon', 9.5, 18.0, { mood: 50 });
    const d = spawn(state, data, 2, 'bileDemon', 9.5, 20.5, { mood: 50 });
    const events = run(state, data, 1);
    const dmg = (u: typeof a) => maxHp(data, u) - u.hp;
    expect(dmg(a)).toBeCloseTo(300, 0);
    expect(dmg(b)).toBeCloseTo(225, 0);
    expect(dmg(c)).toBeCloseTo(168.75, 0);
    expect(dmg(d)).toBe(0); // solo salta a 3 enemigos
    expect(
      events.filter((x) => x.type === 'hit' && x.targetOwner === 2 && x.attackerOwner === 1),
    ).toHaveLength(3);
  });

  it('la piedra rodante (línea de visión, 8 tiles) daña 800 a todos los de la línea hasta el muro', () => {
    const { state, data } = armed('boulderTrap', [...PHYSICAL]);
    const a = spawn(state, data, 2, 'bileDemon', 9.5, 15.5, { mood: 50 });
    const b = spawn(state, data, 2, 'bileDemon', 9.5, 17.5, { mood: 50 });
    const off = spawn(state, data, 2, 'bileDemon', 7.5, 16.5, { mood: 50 });
    run(state, data, 1);
    expect(maxHp(data, a) - a.hp).toBeGreaterThanOrEqual(800);
    expect(maxHp(data, b) - b.hp).toBeGreaterThanOrEqual(800);
    expect(off.hp).toBe(maxHp(data, off));
  });

  it('la piedra rodante no se dispara contra quien no está en línea recta', () => {
    const { state, data } = armed('boulderTrap', [...PHYSICAL]);
    spawn(state, data, 2, 'bileDemon', 12.0, 15.0, { mood: 50 });
    expect(run(state, data, 3).some((e) => e.type === 'trapTriggered')).toBe(false);
  });

  it('las paredes aplastantes hacen 1.200 al que pisa el pasillo', () => {
    const { state, data } = tw([...PHYSICAL]);
    const wall = data.terrain.findIndex((t) => t.id === 'solidRock');
    state.terrain[tileIndex(state, 9, 13)] = wall;
    state.terrain[tileIndex(state, 11, 13)] = wall;
    trap(state, data, 'crushingWalls', 10, 13);
    state.traps[0]!.built = true;
    state.tasks = [];
    const e = spawn(state, data, 2, 'bileDemon', 10.5, 13.5, { mood: 50 });
    run(state, data, 1);
    expect(maxHp(data, e) - e.hp).toBeGreaterThanOrEqual(1200);
  });

  it('no dispara contra el propio dueño, ni contra criaturas en la mano, ni contra rivales fuera de su radio', () => {
    const { state, data } = armed('spikeTrap');
    const own = spawn(state, data, 1, 'troll', 9.5, 12.5);
    const held = spawn(state, data, 2, 'troll', 9.5, 12.5, { held: true });
    spawn(state, data, 2, 'troll', 11.5, 12.5);
    expect(run(state, data, 3).some((e) => e.type === 'trapTriggered')).toBe(false);
    expect(own.hp).toBe(maxHp(data, own));
    expect(held.hp).toBe(maxHp(data, held));
  });

  it('también dispara contra los Imps enemigos y puede matarlos', () => {
    const { state, data } = armed('spikeTrap');
    const imp = state.imps.find((i) => i.owner === 2)!;
    imp.x = 9.5;
    imp.y = 12.5;
    imp.hp = 100;
    expect(run(state, data, 2).some((e) => e.type === 'impDied')).toBe(true);
  });

  it('las criaturas muertas por una trampa no dan XP a nadie (no hay asesino)', () => {
    const { state, data } = armed('spikeTrap');
    data.global.downed.seconds = 0;
    const victim = spawn(state, data, 2, 'goblin', 9.5, 12.5, { hp: 100 });
    const events = run(state, data, 2);
    expect(events.some((e) => e.type === 'creatureDied' && e.creatureId === victim.id)).toBe(true);
  });

  it('al eliminar al dueño no quedan trampas', () => {
    const { state, data } = armed('spikeTrap');
    state.players[0]!.heartHp = 0;
    run(state, data, 1);
    expect(state.traps).toHaveLength(0);
  });

  it('el rival no tiene ninguna información de las trampas en su estado visible: son del dueño', () => {
    const { state } = armed('spikeTrap');
    expect(state.traps.every((t) => t.owner === 1)).toBe(true);
  });
});

describe('determinismo con trampas', () => {
  it('misma semilla y mismos comandos, mismo estado', () => {
    const play = () => {
      const { state, data } = tw([...ALL]);
      trap(state, data, 'spikeTrap', 9, 12);
      trap(state, data, 'fireTrap', 10, 12);
      spawn(state, data, 2, 'troll', 9.5, 11.5, { mood: 50 });
      run(state, data, 900);
      return JSON.stringify([
        state.traps,
        state.creatures.map((c) => [c.id, Math.round(c.hp)]),
        state.players[0]!.gold,
      ]);
    };
    expect(play()).toBe(play());
  });
});

void row;
void extendTerritory;
void (null as unknown as SimEvent);
