import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import {
  attackIntervalTicks,
  chooseTarget,
  distToTileBox,
  hasLineOfSight,
  rollDamage,
} from './combat';
import { creatureMaxHp, scaledStat } from './creatureStats';
import { tileIndex } from './grid';
import { rulesOf } from './rules';
import { step } from './step';
import { baseRoom, duel, run, spawn } from './testUtils';
import type { Creature, SimEvent } from './types';

const hits = (events: SimEvent[]) =>
  events.filter((e) => e.type === 'hit') as Array<Extract<SimEvent, { type: 'hit' }>>;

/** Quita los Imps de un jugador para que no se mezclen en el escenario. */
function noImps(state: { imps: Array<{ owner: number }> }, owner: number) {
  state.imps = state.imps.filter((i) => i.owner !== owner);
}

/** Dos criaturas enfrentadas en el suelo libre de la base 1, con las demás cosas quietas. */
function fight(typeA: string, typeB: string, dx = 1) {
  const m = duel();
  const a = spawn(m.state, m.data, 1, typeA, 4.5, 8.5, { mood: 50 });
  const b = spawn(m.state, m.data, 2, typeB, 4.5 + dx, 8.5, { mood: 50 });
  return { ...m, a, b };
}

describe('daño', () => {
  it('daño = base × nivel × ánimo × aleatorio(0,9 a 1,1), con el generador de la partida', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    const g = spawn(state, data, 1, 'goblin', 4.5, 8.5, { mood: 50, level: 1 });
    for (let i = 0; i < 200; i++) {
      const d = rollDamage(state, rules, g);
      expect(d).toBeGreaterThanOrEqual(60 * 0.9 - 1e-9);
      expect(d).toBeLessThanOrEqual(60 * 1.1 + 1e-9);
    }
    g.level = 3;
    const base3 = scaledStat(rules, 'damage', 60, 3);
    expect(base3).toBe(102);
    const d3 = rollDamage(state, rules, g);
    expect(d3).toBeGreaterThanOrEqual(base3 * 0.9 - 1e-9);
    expect(d3).toBeLessThanOrEqual(base3 * 1.1 + 1e-9);
  });

  it('el ánimo modifica el daño: Radiante +15 %, Enfadado −25 %', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    const sample = (mood: number) => {
      const g = spawn(state, data, 1, 'goblin', 4.5, 8.5, { mood });
      let sum = 0;
      for (let i = 0; i < 400; i++) sum += rollDamage(state, rules, g);
      return sum / 400;
    };
    const neutral = sample(50);
    expect(sample(95) / neutral).toBeGreaterThan(1.1);
    expect(sample(95) / neutral).toBeLessThan(1.2);
    expect(sample(12) / neutral).toBeGreaterThan(0.7);
    expect(sample(12) / neutral).toBeLessThan(0.8);
  });

  it('el intervalo entre golpes sale de cada criatura y Acelerar lo reduce a dos tercios', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    expect(attackIntervalTicks(state, rules, spawn(state, data, 1, 'goblin', 4.5, 8.5))).toBe(10);
    expect(attackIntervalTicks(state, rules, spawn(state, data, 1, 'troll', 4.5, 8.5))).toBe(12);
    expect(attackIntervalTicks(state, rules, spawn(state, data, 1, 'warlock', 4.5, 8.5))).toBe(15);
    const fast = spawn(state, data, 1, 'goblin', 4.5, 8.5, { hasteUntil: 1000 });
    expect(attackIntervalTicks(state, rules, fast)).toBe(7); // 10 / 1,5 = 6,67 → 7
  });
});

describe('alcance y línea de visión', () => {
  it('un Goblin golpea a menos de 1,2 tiles y no más allá', () => {
    const near = fight('goblin', 'troll', 1);
    noImps(near.state, 1);
    noImps(near.state, 2);
    const ev1 = run(near.state, near.data, 5);
    expect(hits(ev1).some((h) => h.targetOwner === 2 && h.targetKind === 'creature')).toBe(true);
    // A 2 tiles tiene que acercarse antes de golpear; en el primer tick no hay golpe.
    const far = fight('goblin', 'troll', 2);
    noImps(far.state, 1);
    noImps(far.state, 2);
    const first = run(far.state, far.data, 1);
    expect(hits(first)).toHaveLength(0);
    run(far.state, far.data, 30);
    expect(far.b.hp).toBeLessThan(creatureMaxHp(rulesOf(far.data), far.b));
  });

  it('un Warlock dispara a 4 tiles con línea de visión sin acercarse', () => {
    const { state, data, a, b } = fight('warlock', 'troll', 4);
    const x0 = a.x;
    b.goal = 'none';
    run(state, data, 40);
    expect(b.hp).toBeLessThan(creatureMaxHp(rulesOf(data), b));
    expect(Math.abs(a.x - x0)).toBeLessThan(0.1);
  });

  it('un muro entre medias corta la línea de visión y el Warlock no dispara a través', () => {
    const { state, data } = duel();
    const rules = rulesOf(data);
    const earth = data.terrain.findIndex((t) => t.id === 'earth');
    state.terrain[tileIndex(state, 6, 8)] = earth;
    expect(hasLineOfSight(state, rules, 4.5, 8.5, 8.5, 8.5)).toBe(false);
    expect(hasLineOfSight(state, rules, 4.5, 7.5, 4.5, 9.5)).toBe(true);
    // El agua y la lava no tapan la vista.
    state.terrain[tileIndex(state, 6, 8)] = data.terrain.findIndex((t) => t.id === 'lava');
    expect(hasLineOfSight(state, rules, 4.5, 8.5, 8.5, 8.5)).toBe(true);
  });

  it('distToTileBox mide hasta el borde del tile', () => {
    const { state } = duel();
    expect(distToTileBox(state, 5.5, 5.5, tileIndex(state, 5, 5))).toBe(0);
    expect(distToTileBox(state, 4.5, 5.5, tileIndex(state, 5, 5))).toBeCloseTo(0.5);
    expect(distToTileBox(state, 4.5, 4.5, tileIndex(state, 5, 5))).toBeCloseTo(
      Math.hypot(0.5, 0.5),
    );
  });
});

describe('a quién ataca', () => {
  it('ignora enemigos a más de 6 tiles y persigue a los que están dentro', () => {
    const m = duel();
    const g = spawn(m.state, m.data, 1, 'goblin', 3.5, 8.5, { mood: 50 });
    const rules = rulesOf(m.data);
    const far = spawn(m.state, m.data, 2, 'troll', 10.5, 8.5);
    expect(chooseTarget(m.state, rules, g)).toBeNull();
    far.x = 8.5;
    expect(chooseTarget(m.state, rules, g)?.id).toBe(far.id);
  });

  it('prefiere a quien la ataca y, si no, al más cercano', () => {
    const m = duel();
    const rules = rulesOf(m.data);
    const t = spawn(m.state, m.data, 1, 'troll', 4.5, 8.5);
    const near = spawn(m.state, m.data, 2, 'troll', 5.5, 8.5);
    const far = spawn(m.state, m.data, 2, 'troll', 8.5, 8.5);
    expect(chooseTarget(m.state, rules, t)?.id).toBe(near.id);
    t.attackedByKind = 'creature';
    t.attackedBy = far.id;
    t.attackedTick = m.state.tick;
    expect(chooseTarget(m.state, rules, t)?.id).toBe(far.id);
  });

  it('el Goblin (flanker) prefiere a un Warlock o a un Imp antes que a uno más cercano', () => {
    const m = duel();
    const rules = rulesOf(m.data);
    const g = spawn(m.state, m.data, 1, 'goblin', 4.5, 8.5);
    const troll = spawn(m.state, m.data, 2, 'troll', 5.5, 8.5);
    const warlock = spawn(m.state, m.data, 2, 'warlock', 8.5, 8.5);
    expect(chooseTarget(m.state, rules, g)?.id).toBe(warlock.id);
    // El Troll (blocker) va al más cercano.
    const t = spawn(m.state, m.data, 1, 'troll', 4.5, 7.5);
    expect(chooseTarget(m.state, rules, t)?.id).toBe(troll.id);
  });

  it('también ataca a los Imps enemigos', () => {
    const m = duel();
    const rules = rulesOf(m.data);
    const g = spawn(m.state, m.data, 1, 'goblin', 4.5, 8.5);
    const enemyImp = m.state.imps.find((i) => i.owner === 2)!;
    enemyImp.x = 5.5;
    enemyImp.y = 8.5;
    expect(chooseTarget(m.state, rules, g)).toMatchObject({ kind: 'imp', id: enemyImp.id });
  });
});

describe('combate completo', () => {
  it('dos criaturas se pelean hasta que una muere; el asesino gana 20 × nivel y la víctima desaparece', () => {
    const { state, data, a, b } = fight('troll', 'goblin', 1);
    data.global.downed.seconds = 0; // muerte inmediata (la derrota con tiempo se prueba en bodies.test)
    a.level = 4;
    a.hp = creatureMaxHp(rulesOf(data), a);
    const events = run(state, data, 600);
    expect(state.creatures.find((c) => c.id === b.id)).toBeUndefined();
    expect(
      events.some(
        (e) => e.type === 'creatureDied' && e.creatureId === b.id && e.cause === 'combat',
      ),
    ).toBe(true);
    // Golpes (1 XP) + 20 × nivel de la víctima (1).
    expect(a.xp + (a.level - 4) * 700).toBeGreaterThan(20);
  });

  it('el Imp muerto no da XP de muerte (solo los golpes)', () => {
    const m = duel();
    const g = spawn(m.state, m.data, 1, 'goblin', 4.5, 8.5, { mood: 50 });
    const imp = m.state.imps.find((i) => i.owner === 2)!;
    imp.x = 5.5;
    imp.y = 8.5;
    imp.hp = 10;
    const events = run(m.state, m.data, 30);
    expect(events.some((e) => e.type === 'impDied')).toBe(true);
    expect(g.xp).toBeLessThan(5); // solo el golpe, nunca 20
  });

  it('la criatura muerta suelta su cama y su lugar en la mano', () => {
    const { state, data, a } = fight('goblin', 'troll', 1);
    data.global.downed.seconds = 0;
    a.beds = [11 * 64 + 2];
    state.players[0]!.hand = [{ kind: 'creature', id: a.id }];
    a.held = false;
    a.hp = 0;
    run(state, data, 1);
    expect(state.creatures.find((c) => c.id === a.id)).toBeUndefined();
    expect(state.players[0]!.hand).toEqual([]);
  });

  it('con poca vida y cama accesible huye a su cama, se cura en ella y vuelve a la pelea', () => {
    const m = duel();
    const rules = rulesOf(m.data);
    const g = spawn(m.state, m.data, 1, 'goblin', 6.5, 8.5, { mood: 50 });
    // Cama en la Guarida que construimos para la prueba.
    m.state.players[0]!.gold = 50000;
    const claimed = m.data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 14; y++)
      for (let x = 2; x < 6; x++) {
        m.state.terrain[y * 64 + x] = claimed;
        m.state.owner[y * 64 + x] = 1;
      }
    m.state.mapVersion++;
    applyCommand(m.state, m.data, 1, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 2, y: 11, w: 2, h: 2 },
    });
    step(m.state, m.data);
    g.beds = [11 * 64 + 2];
    g.hp = creatureMaxHp(rules, g) * 0.2;
    noImps(m.state, 2);
    const troll = spawn(m.state, m.data, 2, 'troll', 7.5, 8.5, { mood: 50 });
    run(m.state, m.data, 20);
    expect(g.goal).toBe('flee');
    // Una vez a salvo (el enemigo ya no la persigue) descansa en su cama y se cura.
    m.state.creatures = m.state.creatures.filter((c) => c.id !== troll.id);
    run(m.state, m.data, 400);
    expect(g.hp).toBeGreaterThan(creatureMaxHp(rules, g) * 0.2);
  });

  it('si no tiene cama, sigue luchando aunque esté herida', () => {
    const { state, data, a } = fight('goblin', 'troll', 1);
    a.hp = creatureMaxHp(rulesOf(data), a) * 0.1;
    run(state, data, 3);
    expect(a.goal).toBe('combat');
  });

  it('una criatura Furiosa no pelea', () => {
    const { state, data, a, b } = fight('goblin', 'troll', 1);
    a.mood = 2;
    a.wageSat = -1;
    a.hunger = 100;
    const before = b.hp;
    run(state, data, 40);
    expect(b.hp).toBeLessThan(before + 1); // solo pega el Troll
    expect(a.goal).toBe('none');
  });

  it('el combate es determinista con la misma semilla', () => {
    const play = () => {
      const m = duel();
      spawn(m.state, m.data, 1, 'goblin', 4.5, 8.5);
      spawn(m.state, m.data, 1, 'troll', 4.5, 7.5);
      spawn(m.state, m.data, 2, 'warlock', 7.5, 8.5);
      spawn(m.state, m.data, 2, 'bileDemon', 7.5, 7.5);
      run(m.state, m.data, 800);
      return JSON.stringify(
        m.state.creatures.map((c: Creature) => [c.id, Math.round(c.hp), c.xp, c.level]),
      );
    };
    expect(play()).toBe(play());
  });
});

describe('asedio: salas y Corazón', () => {
  it('una criatura enemiga pegada a una sala la golpea y la sala pierde el tile a los 1.000 de daño', () => {
    const m = duel();
    noImps(m.state, 1);
    m.state.players[0]!.gold = 50000;
    applyCommand(m.state, m.data, 1, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 6, y: 6, w: 2, h: 2 },
    });
    step(m.state, m.data);
    const t = spawn(m.state, m.data, 2, 'troll', 8.5, 6.5, { mood: 50 });
    const tile = tileIndex(m.state, 7, 6);
    const events = run(m.state, m.data, 400);
    expect(hits(events).some((h) => h.targetKind === 'room')).toBe(true);
    expect(events.some((e) => e.type === 'tileDestroyed' && e.tile === tile)).toBe(true);
    expect(m.state.roomAt[tile]).toBe(0);
    expect(m.state.owner[tile]).toBe(0);
    expect(m.data.terrain[m.state.terrain[tile] as number]!.id).toBe('neutralFloor');
    expect(t.hp).toBeGreaterThan(0);
  });

  it('al destruirse un tile de Tesorería baja su capacidad y el oro que no cabe se pierde', () => {
    const m = duel();
    const tre = baseRoom(m.data, 0, 'treasury');
    noImps(m.state, 1);
    m.state.players[0]!.gold = 9000;
    // Pegado a la Tesorería por su lado oeste.
    spawn(m.state, m.data, 2, 'bileDemon', tre.x - 0.5, tre.y + 0.5, { mood: 50 });
    run(m.state, m.data, 300);
    expect(m.state.players[0]!.gold).toBeLessThan(9000);
  });

  it('el Corazón recibe daño de criaturas enemigas adyacentes y de nadie más', () => {
    const m = duel();
    const h = baseRoom(m.data, 0, 'heart');
    noImps(m.state, 1);
    const before = m.state.players[0]!.heartHp;
    spawn(m.state, m.data, 2, 'troll', h.x + h.w + 0.5, h.y + 1.5, { mood: 50 });
    run(m.state, m.data, 100);
    expect(m.state.players[0]!.heartHp).toBeLessThan(before);
    // Un rayo no lo toca.
    const m2 = duel();
    const c = spawn(m2.state, m2.data, 1, 'goblin', 4.5, 8.5);
    m2.state.players[0]!.mana = 5000;
    applyCommand(m2.state, m2.data, 1, {
      type: 'castSpell',
      spell: 'lightning',
      target: { x: 6, y: 6 },
    });
    run(m2.state, m2.data, 5);
    expect(m2.state.players[0]!.heartHp).toBe(8000);
    void c;
  });

  it('el Portal está protegido contra los golpes a estructuras', () => {
    const m = duel();
    const p = baseRoom(m.data, 0, 'portal');
    noImps(m.state, 1);
    spawn(m.state, m.data, 2, 'troll', p.x - 0.5, p.y + 1.5, { mood: 50 });
    const events = run(m.state, m.data, 100);
    expect(events.some((e) => e.type === 'tileDestroyed')).toBe(false);
  });

  it('las criaturas de un jugador no golpean sus propias salas', () => {
    const m = duel();
    const tre = baseRoom(m.data, 0, 'treasury');
    spawn(m.state, m.data, 1, 'troll', tre.x + 3.5, tre.y + 0.5);
    const events = run(m.state, m.data, 100);
    expect(hits(events).filter((h) => h.targetKind === 'room')).toHaveLength(0);
  });

  it('dos criaturas atacantes tumban el Corazón: el jugador es eliminado y gana el otro', () => {
    const m = duel();
    const h = baseRoom(m.data, 0, 'heart');
    noImps(m.state, 1);
    m.state.players[0]!.heartHp = 300;
    spawn(m.state, m.data, 2, 'troll', h.x + h.w + 0.5, h.y + 1.5, { mood: 50 });
    const events = run(m.state, m.data, 100);
    expect(events.some((e) => e.type === 'eliminated' && e.playerId === 1)).toBe(true);
    expect(m.state.status).toBe('ended');
    expect(m.state.result).toMatchObject({ winners: [2], reason: 'lastStanding' });
  });
});
