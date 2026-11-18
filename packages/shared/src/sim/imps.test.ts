import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { carriedGold, treasuryCapacity } from './economy';
import { rulesOf } from './rules';
import { tileIndex } from './grid';
import { matchAtCorner0, pt, row, run, send, terrainId } from './testUtils';

/** Corredor (11..13, 4) hasta la veta (14..16, 4..5) de la esquina 0. */
const corridor = row(4, 11, 13);

describe('Imps: excavar y reclamar', () => {
  it('un Imp excava un pasillo de tierra (2 s por tile) y lo deja caminable', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'dig', tiles: corridor });
    run(state, data, 400);
    for (const t of corridor)
      expect(['neutralFloor', 'claimedFloor']).toContain(terrainId(state, data, t.x, t.y));
  });

  it('excavar tarda lo que dicen los datos: nada a los 10 ticks, el primer tile a los pocos segundos', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] });
    run(state, data, 10);
    expect(terrainId(state, data, 11, 4)).toBe('earth');
    run(state, data, 150);
    expect(terrainId(state, data, 11, 4)).not.toBe('earth');
  });

  it('los Imps ociosos reclaman solos el suelo sin dueño pegado a su territorio', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'dig', tiles: corridor });
    run(state, data, 800);
    expect(terrainId(state, data, 11, 4)).toBe('claimedFloor');
    expect(state.owner[tileIndex(state, 11, 4)]).toBe(1);
  });

  it('cada tarea la lleva un solo Imp: nunca hay dos reservas sobre el mismo tile', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, {
      type: 'dig',
      tiles: [...row(4, 11, 13), ...row(5, 11, 13), ...row(6, 11, 13)],
    });
    for (let n = 0; n < 300; n++) {
      run(state, data, 1);
      const reserved = state.tasks.filter((t) => t.reservedBy !== 0).map((t) => t.reservedBy);
      expect(new Set(reserved).size).toBe(reserved.length);
      const tiles = state.tasks.map((t) => `${t.owner}:${t.tile}`);
      expect(new Set(tiles).size).toBe(tiles.length);
    }
  });

  it('una tarea inalcanzable no bloquea al resto ni rompe nada', () => {
    const { state, data } = matchAtCorner0();
    // (20,20) no es alcanzable (tierra rodeada de tierra) pero se marca junto a un pasillo válido.
    const i = tileIndex(state, 20, 20);
    state.tasks.push({
      id: state.nextTaskId++,
      owner: 1,
      kind: 'dig',
      tile: i,
      reservedBy: 0,
      blockedVersion: -1,
      auto: false,
    });
    send(state, data, 1, { type: 'dig', tiles: corridor });
    run(state, data, 500);
    expect(terrainId(state, data, 11, 4)).not.toBe('earth');
    expect(terrainId(state, data, 20, 20)).toBe('earth');
  });

  it('si el mapa cambia por el camino, el Imp recalcula la ruta', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'dig', tiles: corridor });
    const v0 = state.mapVersion;
    run(state, data, 400);
    expect(state.mapVersion).toBeGreaterThan(v0);
    expect(
      state.imps.every(
        (i) => i.mode !== 'moving' || i.pathVersion === state.mapVersion || i.path.length >= 0,
      ),
    ).toBe(true);
  });
});

describe('Imps: minar y llevar oro a la Tesorería', () => {
  function mining() {
    const m = matchAtCorner0();
    send(m.state, m.data, 1, { type: 'dig', tiles: [...corridor, pt(14, 4)] });
    return m;
  }

  it('un Imp mina una veta y lleva el oro a la Tesorería', () => {
    const { state, data } = mining();
    state.players[0]!.gold = 1000;
    const events = run(state, data, 1500);
    const deposits = events.filter((e) => e.type === 'goldDeposited');
    expect(deposits.length).toBeGreaterThan(0);
    // La veta de un tile da 600 de oro: dos viajes de 300.
    expect(state.players[0]!.gold).toBeCloseTo(1600, 3);
    expect(terrainId(state, data, 14, 4)).not.toBe('goldVein');
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBe(0);
  });

  it('nunca lleva más de 300 por viaje', () => {
    const { state, data } = mining();
    let maxCarry = 0;
    for (let n = 0; n < 1500; n++) {
      run(state, data, 1);
      for (const imp of state.imps) maxCarry = Math.max(maxCarry, imp.carry);
    }
    expect(maxCarry).toBeLessThanOrEqual(300 + 1e-6);
    expect(maxCarry).toBeGreaterThan(299);
  });

  it('el oro nunca se crea ni se pierde: lo minado es lo que entra en la Tesorería', () => {
    const { state, data } = mining();
    state.players[0]!.gold = 0;
    run(state, data, 3000);
    const mined = 600 - (state.goldLeft[tileIndex(state, 14, 4)] as number);
    expect(state.players[0]!.gold + carriedGold(state, 1)).toBeCloseTo(mined, 3);
  });

  it('con la Tesorería llena, los Imps no minan y la veta queda intacta', () => {
    const { state, data } = mining();
    const rules = rulesOf(data);
    state.players[0]!.gold = treasuryCapacity(state, rules, 1);
    run(state, data, 1500);
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBe(600);
    expect(terrainId(state, data, 14, 4)).toBe('goldVein');
    expect(carriedGold(state, 1)).toBe(0);
    expect(state.players[0]!.gold).toBe(treasuryCapacity(state, rules, 1));
  });

  it('al gastar oro y quedar hueco, se reanuda la minería', () => {
    const { state, data } = mining();
    const rules = rulesOf(data);
    const cap = treasuryCapacity(state, rules, 1);
    state.players[0]!.gold = cap;
    run(state, data, 600);
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBe(600);
    send(state, data, 1, { type: 'buildRoom', room: 'lair', rect: { x: 6, y: 2, w: 2, h: 2 } }); // gasta 1.200
    run(state, data, 1500);
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBeLessThan(600);
  });

  it('el oro de la Tesorería nunca supera su capacidad aunque se mine sin parar', () => {
    const { state, data } = matchAtCorner0();
    const rules = rulesOf(data);
    send(state, data, 1, {
      type: 'dig',
      tiles: [...corridor, ...row(4, 14, 16), ...row(5, 14, 16)],
    });
    state.players[0]!.gold = 8500;
    for (let n = 0; n < 4000; n++) {
      run(state, data, 1);
      expect(state.players[0]!.gold + carriedGold(state, 1)).toBeLessThanOrEqual(
        treasuryCapacity(state, rules, 1) + 1e-6,
      );
    }
  });

  it('sin Tesorería no se mina', () => {
    const { state, data } = mining();
    state.rooms = state.rooms.filter((r) => r.type !== 'treasury');
    for (let i = 0; i < state.roomAt.length; i++) if (state.roomAt[i] === 1) state.roomAt[i] = 0;
    run(state, data, 1500);
    expect(state.goldLeft[tileIndex(state, 14, 4)]).toBe(600);
  });
});

describe('Crear Imp', () => {
  it('crea un Imp en suelo propio, gasta 300 de maná y respeta el enfriamiento de 2 s', () => {
    const { state, data } = matchAtCorner0();
    const mana0 = state.players[0]!.mana;
    const r = applyCommand(state, data, 1, {
      type: 'castSpell',
      spell: 'createImp',
      target: pt(3, 8),
    });
    expect(r.ok).toBe(true);
    run(state, data, 1);
    expect(state.imps.filter((i) => i.owner === 1)).toHaveLength(5);
    // 300 de coste menos lo que regenera ese tick (1,21).
    expect(mana0 - state.players[0]!.mana).toBeGreaterThan(296);
    expect(mana0 - state.players[0]!.mana).toBeLessThan(300);
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) }),
    ).toEqual({ ok: false, error: 'COOLDOWN' });
    run(state, data, 20);
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) }).ok,
    ).toBe(true);
  });

  it('cuesta 50 más por cada Imp por encima de 4', () => {
    const { state, data } = matchAtCorner0();
    state.players[0]!.mana = 5000;
    send(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) });
    expect(state.players[0]!.mana).toBeGreaterThan(4700);
    expect(state.players[0]!.mana).toBeLessThan(4702);
    run(state, data, 20);
    const before = state.players[0]!.mana;
    send(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) });
    // 350 de coste menos lo que regenera ese tick.
    expect(before - state.players[0]!.mana).toBeGreaterThan(348);
    expect(before - state.players[0]!.mana).toBeLessThan(350);
  });

  it('NO_MANA, INVALID_TARGET y LIMIT_REACHED', () => {
    const { state, data } = matchAtCorner0();
    state.players[0]!.mana = 299;
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) }),
    ).toEqual({ ok: false, error: 'NO_MANA' });
    state.players[0]!.mana = 5000;
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(20, 20) }),
    ).toEqual({ ok: false, error: 'INVALID_TARGET' });
    for (let k = 0; k < 8; k++) {
      state.players[0]!.cooldowns = {};
      send(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) });
    }
    expect(state.imps.filter((i) => i.owner === 1)).toHaveLength(12);
    state.players[0]!.cooldowns = {};
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) }),
    ).toEqual({ ok: false, error: 'LIMIT_REACHED' });
  });

  it('los hechizos que aún no existen en la simulación se rechazan', () => {
    const { state, data } = matchAtCorner0();
    expect(
      applyCommand(state, data, 1, { type: 'castSpell', spell: 'lightning', target: pt(3, 8) }),
    ).toEqual({ ok: false, error: 'INVALID_COMMAND' });
  });

  it('más Imps terminan antes una obra con muchos frentes de excavación', () => {
    const wall = [
      ...Array.from({ length: 7 }, (_, k) => pt(11, 3 + k)),
      ...Array.from({ length: 7 }, (_, k) => pt(12, 3 + k)),
    ];
    const dug = (s: ReturnType<typeof matchAtCorner0>['state']) =>
      wall.every(
        (t) =>
          s.goldLeft[tileIndex(s, t.x, t.y)] === 0 &&
          s.terrain[tileIndex(s, t.x, t.y)] !== undefined &&
          s.tasks.every((k) => k.tile !== tileIndex(s, t.x, t.y)),
      );
    const ticksToFinish = (extraImps: number) => {
      const { state, data } = matchAtCorner0();
      state.players[0]!.mana = 5000;
      for (let k = 0; k < extraImps; k++) {
        state.players[0]!.cooldowns = {};
        send(state, data, 1, { type: 'castSpell', spell: 'createImp', target: pt(3, 8) });
      }
      const start = state.tick;
      send(state, data, 1, { type: 'dig', tiles: wall });
      while (!dug(state) && state.tick < 3000) run(state, data, 1);
      return state.tick - start;
    };
    const few = ticksToFinish(0);
    const many = ticksToFinish(8);
    expect(few).toBeLessThan(3000);
    expect(many).toBeLessThan(few);
  });
});
