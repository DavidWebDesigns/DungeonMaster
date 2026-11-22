import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { areaDamage } from './combat';
import { creatureMaxHp, creatureWage } from './creatureStats';
import { isDowned } from './bodies';
import { rulesOf } from './rules';
import { step } from './step';
import { buildRooms, duel, run, spawn } from './testUtils';
import type { Creature, MatchState, SimEvent } from './types';
import type { DataSet } from '../data';

const DOWNED_TICKS = 600; // 60 s a 10 ticks/s

/** Partida con Guarida, Biblioteca, Cementerio y Cámara de tortura del jugador 1, sin Portal ni pagos que molesten. */
function world(
  rooms: Parameters<typeof buildRooms>[2] = ['lair', 'library', 'graveyard', 'tortureChamber'],
) {
  const m = duel();
  m.data.global.portal.attractIntervalSeconds = 100000;
  m.data.economy.paydayIntervalSeconds = 100000;
  m.data.economy.hunger.risePerSecond = 0.0001;
  m.data.economy.sleep.risePerSecond = 0.0001;
  m.data.global.imps.loaf.chance = 0;
  m.data.economy.wanderRadius = 0;
  buildRooms(m.state, m.data, rooms);
  // Solo los Imps del jugador 2 se apartan: así no se llevan nada.
  m.state.imps = m.state.imps.filter((i) => i.owner === 1);
  return { ...m, rules: rulesOf(m.data) };
}

/** Pone a una criatura derrotada (sin vida) y deja que la simulación la convierta en derrotada con un tick. */
function defeat(state: MatchState, data: DataSet, c: Creature): SimEvent[] {
  c.hp = 0;
  return run(state, data, 1);
}
const kinds = (events: SimEvent[], type: SimEvent['type']) => events.filter((e) => e.type === type);

describe('derrotada y aturdida', () => {
  it('al quedarse sin vida no muere: queda derrotada durante 60 s y el aviso lo cuenta', () => {
    const { state, data } = world();
    const c = spawn(state, data, 1, 'goblin', 6.5, 14.5);
    const events = defeat(state, data, c);
    expect(state.creatures.includes(c)).toBe(true);
    expect(isDowned(c)).toBe(true);
    expect(c.downedUntil - state.tick).toBeGreaterThan(DOWNED_TICKS - 5);
    expect(kinds(events, 'creatureDowned')).toEqual([
      expect.objectContaining({ playerId: 1, creatureId: c.id, seconds: 60 }),
    ]);
    expect(kinds(events, 'creatureDied')).toHaveLength(0);
    expect(c.hp).toBe(0);
  });

  it('no actúa, no se la ataca más, no cobra ni pasa hambre y no se puede coger, abofetear ni curar', () => {
    const { state, data } = world(['lair']);
    state.imps = [];
    const c = spawn(state, data, 1, 'goblin', 6.5, 14.5);
    const enemy = spawn(state, data, 2, 'troll', 7.5, 14.5, { mood: 50 });
    defeat(state, data, c);
    const hunger = c.hunger;
    const events = run(state, data, 100);
    expect(events.filter((e) => e.type === 'hit' && e.targetKind === 'creature')).toHaveLength(0);
    expect(c.hp).toBe(0);
    expect(c.hunger).toBe(hunger);
    expect(enemy.goal === 'combat' || enemy.targetId !== c.id).toBe(true);
    state.players[0]!.mana = 5000;
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: c.id })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(applyCommand(state, data, 1, { type: 'slap', id: c.id })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'heal', creature: c.id }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' });
    // Un hechizo de área no le quita más vida.
    areaDamage(state, rulesOf(data), 2, 6.5, 14.5, 3, 500, []);
    expect(c.hp).toBe(0);
  });

  it('si nadie la salva, a los 60 s muere, deja un cadáver y avisa con creatureDied', () => {
    const { state, data } = world(['lair']);
    state.imps = [];
    const c = spawn(state, data, 1, 'goblin', 6.5, 14.5);
    defeat(state, data, c);
    const events = run(state, data, DOWNED_TICKS + 5);
    expect(state.creatures.includes(c)).toBe(false);
    expect(kinds(events, 'creatureDied')).toEqual([
      expect.objectContaining({ creatureId: c.id, playerId: 1 }),
    ]);
    expect(state.corpses).toHaveLength(1);
    expect(state.corpses[0]).toMatchObject({
      type: 'goblin',
      origin: 1,
      buriedIn: 0,
      carriedBy: 0,
    });
    expect(Math.floor(state.corpses[0]!.x)).toBe(6);
  });

  it('el Vampiro con Cementerio no deja cadáver: se programa su regreso', () => {
    const { state, data } = world();
    state.imps = [];
    const v = spawn(state, data, 1, 'vampire', 6.5, 14.5);
    v.level = 3;
    defeat(state, data, v);
    run(state, data, DOWNED_TICKS + 5);
    expect(state.corpses).toHaveLength(0);
    expect(state.revives).toHaveLength(1);
  });
});

describe('los Imps llevan a las criaturas propias derrotadas a la Guarida', () => {
  it('la recogen, la llevan en brazos y se recupera en su cama con el 30 % de la vida', () => {
    const { state, data, rules } = world();
    const c = spawn(state, data, 1, 'goblin', 9.5, 15.5, { beds: [11 * 64 + 2] });
    const max = creatureMaxHp(rules, c);
    defeat(state, data, c);
    // Mientras la llevan, la criatura sigue al Imp.
    let carried = false;
    let followed = false;
    const events: SimEvent[] = [];
    for (let n = 0; n < 400 && isDowned(c); n++) {
      events.push(...step(state, data));
      const imp = state.imps.find((i) => i.carryKind === 'creature' && i.carryId === c.id);
      if (imp) {
        carried = true;
        followed ||= Math.hypot(c.x - imp.x, c.y - imp.y) < 0.01 && c.carriedBy === imp.id;
      }
    }
    expect(carried).toBe(true);
    expect(followed).toBe(true);
    expect(isDowned(c)).toBe(false);
    expect(kinds(events, 'creatureRescued')).toEqual([
      expect.objectContaining({ playerId: 1, creatureId: c.id }),
    ]);
    expect(c.hp).toBeGreaterThanOrEqual(Math.round(max * 0.3));
    expect(c.carriedBy).toBe(0);
    expect(
      state.rooms.find((r) => r.id === state.roomAt[Math.floor(c.y) * 64 + Math.floor(c.x)])?.type,
    ).toBe('lair');
    expect(c.goal).toBe('bed');
    expect(state.imps.every((i) => i.carryKind === 'none')).toBe(true);
    expect(state.tasks.some((t) => t.kind === 'rescue')).toBe(false);
  });

  it('sin Guarida no hay tarea de rescate y se acaba muriendo', () => {
    const { state, data } = world(['tortureChamber']);
    const c = spawn(state, data, 1, 'goblin', 9.5, 15.5);
    defeat(state, data, c);
    run(state, data, 30);
    expect(state.tasks.some((t) => t.kind === 'rescue')).toBe(false);
  });

  it('si el tiempo se acaba mientras la llevan en brazos, muere, el Imp queda libre y deja el cadáver', () => {
    const { state, data } = world();
    const c = spawn(state, data, 1, 'goblin', 9.5, 15.5, { beds: [11 * 64 + 2] });
    defeat(state, data, c);
    // Se le acaba el tiempo justo después de que la cojan.
    for (let n = 0; n < 200 && c.carriedBy === 0; n++) step(state, data);
    expect(c.carriedBy).not.toBe(0);
    c.downedUntil = state.tick + 2;
    run(state, data, 5);
    expect(state.creatures.includes(c)).toBe(false);
    expect(state.imps.every((i) => i.carryKind === 'none' || i.carryKind === 'corpse')).toBe(true);
    expect(state.corpses.length).toBe(1);
  });

  it('un Imp recogido con la mano o muerto suelta lo que lleva', () => {
    const { state, data } = world();
    const c = spawn(state, data, 1, 'goblin', 9.5, 15.5);
    defeat(state, data, c);
    for (let n = 0; n < 200 && c.carriedBy === 0; n++) step(state, data);
    const imp = state.imps.find((i) => i.id === c.carriedBy)!;
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: imp.id, kind: 'imp' }).ok).toBe(true);
    step(state, data);
    expect(c.carriedBy).toBe(0);
    expect(imp.carryKind).toBe('none');
    expect(isDowned(c)).toBe(true);
  });
});

describe('Cámara de tortura: las enemigas derrotadas se convierten o mueren', () => {
  /** Una criatura del jugador 2 derrotada en territorio del 1, con la probabilidad de conversión dada. */
  function enemy(chance: number) {
    const w = world();
    w.data.rooms.find((r) => r.id === 'tortureChamber')!.convertChance = chance;
    const e = spawn(w.state, w.data, 2, 'goblin', 9.5, 14.5);
    defeat(w.state, w.data, e);
    return { ...w, e };
  }

  it('con probabilidad 1 se convierte en aliada, con el 30 % de la vida y el nuevo dueño', () => {
    const { state, data, e, rules } = enemy(1);
    const events: SimEvent[] = [];
    for (let n = 0; n < 500 && e.owner === 2; n++) events.push(...step(state, data));
    expect(e.owner).toBe(1);
    expect(isDowned(e)).toBe(false);
    expect(e.hp).toBeGreaterThanOrEqual(Math.round(creatureMaxHp(rules, e) * 0.3));
    expect(kinds(events, 'creatureConverted')).toEqual([
      expect.objectContaining({ playerId: 1, victimOwner: 2, creatureId: e.id }),
    ]);
    expect(state.creatures.includes(e)).toBe(true);
    expect(state.corpses).toHaveLength(0);
  });

  it('con probabilidad 0 muere y su sueldo × 3 va a la Tesorería del que la torturó; queda su cadáver', () => {
    const { state, data, e, rules } = enemy(0);
    state.players[0]!.gold = 100;
    const wage = creatureWage(rules, e);
    const events: SimEvent[] = [];
    for (let n = 0; n < 500 && state.creatures.includes(e); n++) events.push(...step(state, data));
    expect(state.creatures.includes(e)).toBe(false);
    const tortured = kinds(events, 'creatureTortured');
    expect(tortured).toEqual([
      expect.objectContaining({ playerId: 1, victimOwner: 2, gold: wage * 3 }),
    ]);
    expect(state.players[0]!.gold).toBe(100 + wage * 3);
    expect(kinds(events, 'creatureDied')).toEqual([
      expect.objectContaining({ creatureId: e.id, playerId: 2, cause: 'tortured' }),
    ]);
    expect(state.corpses.some((b) => b.origin === 2)).toBe(true);
  });

  it('sin sitio en la mazmorra del captor no se convierte: muere', () => {
    const w = world();
    w.data.rooms.find((r) => r.id === 'tortureChamber')!.convertChance = 1;
    w.data.global.maxCreaturesPerPlayer = 0;
    const e = spawn(w.state, w.data, 2, 'goblin', 9.5, 14.5);
    defeat(w.state, w.data, e);
    run(w.state, w.data, 500);
    expect(w.state.creatures.includes(e)).toBe(false);
  });

  it('sin Cámara de tortura no se la llevan; y las propias no van a la Cámara sino a la Guarida', () => {
    const w = world(['lair', 'library', 'graveyard']);
    const e = spawn(w.state, w.data, 2, 'goblin', 9.5, 14.5);
    defeat(w.state, w.data, e);
    run(w.state, w.data, 30);
    expect(w.state.tasks.some((t) => t.kind === 'rescue')).toBe(false);
  });

  it('el reparto es determinista: misma semilla, mismo resultado', () => {
    const out = () => {
      const { state, data, e } = enemy(0.5);
      run(state, data, 500);
      return [e.owner, state.creatures.includes(e), state.rng];
    };
    expect(out()).toEqual(out());
  });
});

describe('Cementerio: cadáveres y esqueletos', () => {
  /** Un cadáver suelto junto al Cementerio. */
  function corpseWorld(origin = 1) {
    const w = world();
    const c = spawn(w.state, w.data, origin, 'goblin', 9.5, 14.5);
    w.state.imps = w.state.imps.filter((i) => i.owner === 1);
    w.data.global.downed.seconds = 0; // cae directamente
    defeat(w.state, w.data, c);
    expect(w.state.corpses).toHaveLength(1);
    return { ...w, c };
  }

  it('los Imps llevan el cadáver al Cementerio y lo entierran', () => {
    const { state, data } = corpseWorld();
    const events: SimEvent[] = [];
    for (let n = 0; n < 500 && state.corpses[0]?.buriedIn === 0; n++)
      events.push(...step(state, data));
    const corpse = state.corpses[0]!;
    expect(corpse.buriedIn).toBeGreaterThan(0);
    expect(state.rooms.find((r) => r.id === corpse.buriedIn)?.type).toBe('graveyard');
    expect(kinds(events, 'corpseBuried')).toHaveLength(1);
    expect(corpse.riseAt - state.tick).toBeGreaterThan(550);
  });

  it('un minuto después de enterrado se levanta como Esqueleto del dueño del Cementerio', () => {
    const { state, data } = corpseWorld();
    for (let n = 0; n < 500 && state.corpses[0]?.buriedIn === 0; n++) step(state, data);
    const before = state.creatures.filter((c) => c.type === 'skeleton').length;
    const events = run(state, data, 590);
    expect(state.creatures.filter((c) => c.type === 'skeleton')).toHaveLength(before);
    events.push(...run(state, data, 20));
    const skeletons = state.creatures.filter((c) => c.type === 'skeleton');
    expect(skeletons).toHaveLength(before + 1);
    expect(skeletons.at(-1)).toMatchObject({ owner: 1, level: 1 });
    expect(kinds(events, 'skeletonRose')).toHaveLength(1);
    expect(state.corpses).toHaveLength(0);
  });

  it('también entierran los cadáveres de las criaturas enemigas, y el Esqueleto es del que enterró', () => {
    const { state, data } = corpseWorld(2);
    run(state, data, 500);
    run(state, data, 620);
    const skeletons = state.creatures.filter((c) => c.type === 'skeleton');
    expect(skeletons).toHaveLength(1);
    expect(skeletons[0]!.owner).toBe(1);
  });

  it('sin Cementerio no se llevan nada, y un cadáver sin enterrar desaparece solo con el tiempo', () => {
    const w = world(['lair']);
    w.data.global.downed.corpseDecaySeconds = 30;
    w.data.global.downed.seconds = 0;
    const c = spawn(w.state, w.data, 1, 'goblin', 9.5, 14.5);
    defeat(w.state, w.data, c);
    run(w.state, w.data, 100);
    expect(w.state.tasks.some((t) => t.kind === 'bury')).toBe(false);
    expect(w.state.corpses).toHaveLength(1);
    run(w.state, w.data, 210);
    expect(w.state.corpses).toHaveLength(0);
  });

  it('si el Cementerio se pierde antes de que se levante, el cadáver vuelve a estar tirado', () => {
    const { state, data } = corpseWorld();
    for (let n = 0; n < 500 && state.corpses[0]?.buriedIn === 0; n++) step(state, data);
    const room = state.rooms.find((r) => r.id === state.corpses[0]!.buriedIn)!;
    applyCommand(state, data, 1, {
      type: 'sellRoom',
      tile: { x: room.tiles[0]! % 64, y: Math.floor(room.tiles[0]! / 64) },
    });
    step(state, data);
    run(state, data, 650);
    expect(state.creatures.some((c) => c.type === 'skeleton')).toBe(false);
    expect(state.corpses[0]?.buriedIn ?? 0).toBe(0);
  });

  it('con la mazmorra llena el Esqueleto espera a que haya sitio', () => {
    const { state, data } = corpseWorld();
    for (let n = 0; n < 500 && state.corpses[0]?.buriedIn === 0; n++) step(state, data);
    data.global.maxCreaturesPerPlayer = 0;
    run(state, data, 700);
    expect(state.creatures.some((c) => c.type === 'skeleton')).toBe(false);
    expect(state.corpses).toHaveLength(1);
    data.global.maxCreaturesPerPlayer = 20;
    run(state, data, 20);
    expect(state.creatures.some((c) => c.type === 'skeleton')).toBe(true);
  });
});

describe('ciclo completo con los datos reales', () => {
  it('una criatura enemiga derrotada, sin Cámara de tortura, acaba siendo un Esqueleto aliado', () => {
    const { state, data } = world(['lair', 'library', 'graveyard']);
    const e = spawn(state, data, 2, 'goblin', 9.5, 14.5);
    defeat(state, data, e);
    run(state, data, DOWNED_TICKS + 5); // muere sola (no hay Cámara de tortura)
    expect(state.corpses).toHaveLength(1);
    run(state, data, 600); // los Imps la entierran
    run(state, data, 650); // y se levanta
    expect(state.creatures.filter((c) => c.type === 'skeleton' && c.owner === 1)).toHaveLength(1);
  });
});
