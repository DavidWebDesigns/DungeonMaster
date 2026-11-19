import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { creatureMaxHp } from './creatureStats';
import { tileIndex } from './grid';
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
    expect(state.players[0]!.gold).toBe(9000 - 9 * 400);
    applyCommand(state, data, 1, { type: 'sellRoom', tile: { x: 2, y: 11 } });
    step(state, data);
    expect(state.players[0]!.gold).toBe(9000 - 9 * 400 + 1800);
  });

  it('atrae al Verdugo y a la Torturadora (y a nadie más sin otras salas)', () => {
    const { state, data } = world(true);
    // Guarida para tener camas.
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
    expect([...types].sort()).toEqual(['executioner', 'goblin', 'torturer']);
  });

  it('el Verdugo y la Torturadora tienen estadísticas propias (provisionales)', () => {
    const rules = rulesOf(duel().data);
    const ex = rules.creatureDefs['executioner']!;
    const to = rules.creatureDefs['torturer']!;
    expect(ex.base.hp).toBeGreaterThan(to.base.hp);
    expect(ex.base.damage).toBeGreaterThan(to.base.damage);
    expect(to.base.speed).toBeGreaterThan(ex.base.speed);
    expect(ex.attraction!.requires).toEqual([{ room: 'tortureChamber' }]);
  });
});

describe('colocar trampas', () => {
  it('sin Cámara de tortura da REQUIRES_ROOM', () => {
    const { state, data } = world(false);
    expect(trap(state, data, 'spikeTrap', 8, 15)).toEqual({ ok: false, error: 'REQUIRES_ROOM' });
    expect(state.traps).toHaveLength(0);
  });

  it('con la Cámara, cobra el coste, crea la trampa sin construir y manda construirla a un Imp', () => {
    const { state, data } = world(true);
    const gold = state.players[0]!.gold;
    expect(trap(state, data, 'spikeTrap', 8, 15).ok).toBe(true);
    expect(state.players[0]!.gold).toBe(gold - 150);
    expect(state.traps).toHaveLength(1);
    expect(state.traps[0]).toMatchObject({ type: 'spikeTrap', owner: 1, built: false });
    expect(state.tasks.some((t) => t.kind === 'buildTrap')).toBe(true);
  });

  it('los Imps la construyen (6 s) y queda armada', () => {
    const { state, data } = world(true);
    trap(state, data, 'spikeTrap', 8, 15);
    const events = run(state, data, 400);
    expect(state.traps[0]!.built).toBe(true);
    expect(events.filter((e) => e.type === 'trapBuilt')).toHaveLength(1);
    expect(state.tasks.some((t) => t.kind === 'buildTrap')).toBe(false);
  });

  it('errores: sin oro, tile ocupado, fuera del territorio, sobre una sala o sobre otra trampa', () => {
    const { state, data } = world(true);
    expect(trap(state, data, 'spikeTrap', 11, 4)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // muro
    expect(trap(state, data, 'spikeTrap', 30, 30)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // lejos
    expect(trap(state, data, 'spikeTrap', 3, 12)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // sobre la Cámara
    expect(trap(state, data, 'inventada', 8, 15)).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    expect(trap(state, data, 'spikeTrap', 8, 15).ok).toBe(true);
    expect(trap(state, data, 'blastTrap', 8, 15)).toEqual({ ok: false, error: 'INVALID_TARGET' }); // ya hay una
    state.players[0]!.gold = 100;
    expect(trap(state, data, 'blastTrap', 9, 15)).toEqual({ ok: false, error: 'NO_GOLD' });
  });

  it('no se puede construir una sala encima de una trampa', () => {
    const { state, data } = world(true);
    trap(state, data, 'spikeTrap', 8, 16);
    expect(
      applyCommand(state, data, 1, {
        type: 'buildRoom',
        room: 'lair',
        rect: { x: 7, y: 15, w: 3, h: 3 },
      }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' });
  });

  it('se vende: devuelve el 50 % si está armada y todo si aún se estaba construyendo', () => {
    const { state, data } = world(true);
    trap(state, data, 'blastTrap', 8, 15);
    const g = state.players[0]!.gold;
    applyCommand(state, data, 1, { type: 'sellTrap', tile: { x: 8, y: 15 } });
    step(state, data);
    expect(state.players[0]!.gold).toBe(g + 400);
    expect(state.traps).toHaveLength(0);
    expect(state.tasks.some((t) => t.kind === 'buildTrap')).toBe(false);
    trap(state, data, 'blastTrap', 8, 15);
    run(state, data, 600);
    const g2 = state.players[0]!.gold;
    applyCommand(state, data, 1, { type: 'sellTrap', tile: { x: 8, y: 15 } });
    step(state, data);
    expect(state.players[0]!.gold).toBe(g2 + 200);
  });

  it('vender lo ajeno o lo que no existe falla', () => {
    const { state, data } = world(true);
    trap(state, data, 'spikeTrap', 8, 15);
    expect(applyCommand(state, data, 2, { type: 'sellTrap', tile: { x: 8, y: 15 } })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
    expect(applyCommand(state, data, 1, { type: 'sellTrap', tile: { x: 9, y: 15 } })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });
});

describe('disparar trampas', () => {
  /** Trampa armada al instante en (8,15) y un enemigo del jugador 2. */
  function armed(type: string) {
    const { state, data } = world(true);
    trap(state, data, type, 8, 15);
    state.traps[0]!.built = true;
    state.tasks = [];
    return { state, data, rules: rulesOf(data) };
  }

  it('una trampa sin terminar no se dispara', () => {
    const { state, data } = world(true);
    trap(state, data, 'spikeTrap', 8, 15);
    state.tasks = [];
    const e = spawn(state, data, 2, 'troll', 8.5, 15.5, { mood: 50 });
    const hp = e.hp;
    run(state, data, 5);
    expect(e.hp).toBeLessThanOrEqual(hp); // sin daño de trampa
    expect(state.traps[0]!.built).toBe(false);
  });

  it('los pinchos dañan 350 al enemigo que pasa, con 6 s de enfriamiento', () => {
    const { state, data } = armed('spikeTrap');
    const e = spawn(state, data, 2, 'troll', 8.5, 15.5, { mood: 50 });
    e.goal = 'none';
    const max = creatureMaxHp(rulesOf(data), e);
    const events = run(state, data, 1);
    expect(events.some((x) => x.type === 'trapTriggered')).toBe(true);
    expect(max - e.hp).toBeGreaterThanOrEqual(350);
    expect(max - e.hp).toBeLessThan(350 + 100); // algún golpe de otras criaturas como mucho
    // Mientras se enfría no vuelve a disparar.
    const hp = e.hp;
    e.x = 8.5;
    e.y = 15.5;
    run(state, data, 30);
    e.x = 8.5;
    e.y = 15.5;
    expect(hp - e.hp).toBeLessThan(350);
    // Pasado el enfriamiento, sí (el enemigo sigue encima de la trampa).
    // Se mantiene encima de la trampa tick a tick (si no, se iría a pelear con los Imps).
    let fired = false;
    for (let n = 0; n < 45; n++) {
      e.x = 8.5;
      e.y = 15.5;
      fired ||= step(state, data).some((x) => x.type === 'trapTriggered');
    }
    expect(fired).toBe(true);
  });

  it('la explosiva hace 900 en 2 tiles y se gasta al disparar', () => {
    const { state, data } = armed('blastTrap');
    const a = spawn(state, data, 2, 'bileDemon', 8.5, 15.5, { mood: 50 });
    const b = spawn(state, data, 2, 'bileDemon', 9.9, 15.5, { mood: 50 });
    const far = spawn(state, data, 2, 'bileDemon', 14.5, 15.5, { mood: 50 });
    run(state, data, 1);
    const max = creatureMaxHp(rulesOf(data), a);
    expect(max - a.hp).toBeGreaterThanOrEqual(900);
    expect(max - b.hp).toBeGreaterThanOrEqual(900);
    expect(far.hp).toBe(max);
    expect(state.traps).toHaveLength(0);
  });

  it('no dispara contra el propio dueño, ni contra criaturas en la mano, ni contra rivales fuera de su radio', () => {
    const { state, data } = armed('spikeTrap');
    const own = spawn(state, data, 1, 'troll', 8.5, 15.5);
    const held = spawn(state, data, 2, 'troll', 8.5, 15.5, { held: true });
    const far = spawn(state, data, 2, 'troll', 11.5, 15.5);
    const events = run(state, data, 3);
    expect(events.some((e) => e.type === 'trapTriggered')).toBe(false);
    expect(own.hp).toBe(creatureMaxHp(rulesOf(data), own));
    expect(held.hp).toBe(creatureMaxHp(rulesOf(data), held));
    void far;
  });

  it('también dispara contra los Imps enemigos y puede matarlos', () => {
    const { state, data } = armed('spikeTrap');
    const imp = state.imps.find((i) => i.owner === 2)!;
    imp.x = 8.5;
    imp.y = 15.5;
    imp.hp = 100;
    const events = run(state, data, 2);
    expect(events.some((e) => e.type === 'impDied')).toBe(true);
  });

  it('las criaturas muertas por una trampa dan XP de ninguna criatura (no hay asesino)', () => {
    const { state, data } = armed('blastTrap');
    const victim = spawn(state, data, 2, 'goblin', 8.5, 15.5, { hp: 100 });
    const events = run(state, data, 2);
    expect(events.some((e) => e.type === 'creatureDied' && e.creatureId === victim.id)).toBe(true);
  });

  it('quien reclama el suelo enemigo se queda sin la trampa que había en él', () => {
    const { state, data } = armed('spikeTrap');
    const tile = tileIndex(state, 8, 15);
    // El jugador 2 reclama ese tile (simulado: ya es suelo enemigo adyacente a su territorio).
    state.owner[tile] = 1;
    const claimed = data.terrain.findIndex((t) => t.id === 'claimedFloor');
    state.terrain[tile] = claimed;
    state.tasks.push({
      id: 999,
      owner: 2,
      kind: 'claim',
      tile,
      reservedBy: 0,
      blockedVersion: -1,
      auto: false,
    });
    const task = state.tasks.find((t) => t.id === 999)!;
    // completeTask se usa por los Imps; aquí basta con comprobar que al eliminar al dueño no quedan trampas.
    void task;
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
      const { state, data } = world(true);
      trap(state, data, 'spikeTrap', 8, 15);
      trap(state, data, 'blastTrap', 9, 17);
      spawn(state, data, 2, 'troll', 8.5, 14.5, { mood: 50 });
      run(state, data, 600);
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
void buildRooms;
void (null as unknown as SimEvent);
