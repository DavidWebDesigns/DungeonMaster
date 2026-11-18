import { describe, expect, it } from 'vitest';
import { applyCommand, previewCommand } from './applyCommand';
import { tileIndex } from './grid';
import { step } from './step';
import type { Command } from './types';
import { matchAtCorner0, pt, row, run, send, terrainId } from './testUtils';

describe('dig / cancelDig', () => {
  it('acepta un pasillo entero de una vez aunque solo el primer tile toque suelo', () => {
    const { state, data } = matchAtCorner0();
    const r = applyCommand(state, data, 1, { type: 'dig', tiles: row(4, 11, 13) });
    expect(r).toEqual({ ok: true, accepted: 3 });
  });

  it('ignora los tiles no válidos y acepta el resto', () => {
    const { state, data } = matchAtCorner0();
    // (3,3) es suelo propio (no excavable); (11,4) es tierra.
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [pt(3, 3), pt(11, 4)] })).toEqual({
      ok: true,
      accepted: 1,
    });
  });

  it('INVALID_TARGET si ningún tile sirve, si la lista está vacía o es demasiado larga', () => {
    const { state, data } = matchAtCorner0();
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [pt(3, 3)] })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [] })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    const many = Array.from({ length: 65 }, (_, i) => pt(i % 64, 20));
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: many })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('no se puede excavar roca sólida ni tierra aislada lejos de todo suelo', () => {
    const { state, data } = matchAtCorner0();
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [pt(0, 0)] }).ok).toBe(false);
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [pt(20, 20)] }).ok).toBe(false);
  });

  it('INVALID_COMMAND con datos mal formados', () => {
    const { state, data } = matchAtCorner0();
    const bad = { type: 'dig', tiles: [{ x: 1.5, y: 'a' }] } as never;
    expect(applyCommand(state, data, 1, bad)).toEqual({ ok: false, error: 'INVALID_COMMAND' });
    expect(applyCommand(state, data, 1, { type: 'nope' } as never)).toEqual({
      ok: false,
      error: 'INVALID_COMMAND',
    });
  });

  it('NOT_OWNER al excavar el muro reforzado de otro jugador', () => {
    const { state, data } = matchAtCorner0();
    const i = tileIndex(state, 11, 4);
    state.terrain[i] = data.terrain.findIndex((t) => t.id === 'reinforcedWall');
    state.owner[i] = 2;
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
  });

  it('cancelDig retira la marca y el Imp deja de excavar', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'dig', tiles: row(4, 11, 13) });
    expect(state.tasks.some((t) => t.kind === 'dig')).toBe(true);
    expect(send(state, data, 1, { type: 'cancelDig', tiles: row(4, 11, 13) })).toEqual({
      ok: true,
      accepted: 3,
    });
    expect(state.tasks.filter((t) => t.kind === 'dig')).toHaveLength(0);
    run(state, data, 100);
    expect(terrainId(state, data, 11, 4)).toBe('earth');
  });

  it('cancelDig sin nada marcado da INVALID_TARGET', () => {
    const { state, data } = matchAtCorner0();
    expect(applyCommand(state, data, 1, { type: 'cancelDig', tiles: [pt(11, 4)] })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('un jugador no puede mandar sobre otro: un id desconocido es NOT_OWNER', () => {
    const { state, data } = matchAtCorner0();
    expect(applyCommand(state, data, 9, { type: 'dig', tiles: [pt(11, 4)] })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
  });
});

describe('claim / reinforce', () => {
  it('claim solo acepta suelo sin dueño conectado a territorio propio', () => {
    const { state, data } = matchAtCorner0();
    const i = tileIndex(state, 11, 4);
    state.terrain[i] = data.terrain.findIndex((t) => t.id === 'neutralFloor');
    expect(applyCommand(state, data, 1, { type: 'claim', tiles: [pt(11, 4)] })).toEqual({
      ok: true,
      accepted: 1,
    });
    // Lejos del territorio: no conecta.
    const j = tileIndex(state, 25, 25);
    state.terrain[j] = data.terrain.findIndex((t) => t.id === 'neutralFloor');
    expect(applyCommand(state, data, 1, { type: 'claim', tiles: [pt(25, 25)] }).ok).toBe(false);
  });

  it('un Imp reclama el suelo marcado en 1,5 s y pasa a ser propio', () => {
    const { state, data } = matchAtCorner0();
    const i = tileIndex(state, 11, 6);
    state.terrain[i] = data.terrain.findIndex((t) => t.id === 'neutralFloor');
    send(state, data, 1, { type: 'claim', tiles: [pt(11, 6)] });
    run(state, data, 150);
    expect(terrainId(state, data, 11, 6)).toBe('claimedFloor');
    expect(state.owner[i]).toBe(1);
  });

  it('reinforce solo vale para muros de tierra pegados a suelo propio', () => {
    const { state, data } = matchAtCorner0();
    expect(applyCommand(state, data, 1, { type: 'reinforce', tiles: [pt(11, 4)] })).toEqual({
      ok: true,
      accepted: 1,
    });
    expect(applyCommand(state, data, 1, { type: 'reinforce', tiles: [pt(20, 20)] }).ok).toBe(false);
  });

  it('un Imp refuerza un muro y solo su dueño puede excavarlo luego', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'reinforce', tiles: [pt(11, 4)] });
    run(state, data, 250);
    expect(terrainId(state, data, 11, 4)).toBe('reinforcedWall');
    expect(state.owner[tileIndex(state, 11, 4)]).toBe(1);
    expect(applyCommand(state, data, 2, { type: 'dig', tiles: [pt(11, 4)] })).toEqual({
      ok: false,
      error: 'NOT_OWNER',
    });
    expect(applyCommand(state, data, 1, { type: 'dig', tiles: [pt(11, 4)] }).ok).toBe(true);
  });

  it('se puede reclamar suelo enemigo sin sala pegado al propio', () => {
    const { state, data } = matchAtCorner0();
    const i = tileIndex(state, 11, 6);
    state.terrain[i] = data.terrain.findIndex((t) => t.id === 'claimedFloor');
    state.owner[i] = 2;
    expect(applyCommand(state, data, 1, { type: 'claim', tiles: [pt(11, 6)] })).toEqual({
      ok: true,
      accepted: 1,
    });
  });

  it('no se puede reclamar el Corazón ni el Portal del enemigo', () => {
    const { state, data } = matchAtCorner0();
    const enemy = data.map.bases.find((b) => b.slot === state.players[1]!.slot)!;
    const h = enemy.heart;
    expect(applyCommand(state, data, 1, { type: 'claim', tiles: [pt(h.x + 1, h.y + 1)] }).ok).toBe(
      false,
    );
  });
});

describe('buildRoom / sellRoom', () => {
  const lair = { x: 6, y: 2, w: 2, h: 2 };

  it('construye una Guarida, cobra 300 por tile y la deja en el estado', () => {
    const { state, data } = matchAtCorner0();
    expect(send(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair })).toEqual({
      ok: true,
      accepted: 4,
    });
    expect(state.players[0]!.gold).toBe(5000 - 1200);
    expect(
      state.rooms.some((r) => r.type === 'lair' && r.owner === 1 && r.tiles.length === 4),
    ).toBe(true);
    expect(state.roomAt[tileIndex(state, 6, 2)]).not.toBe(0);
  });

  it('NO_GOLD si no alcanza el oro', () => {
    const { state, data } = matchAtCorner0();
    state.players[0]!.gold = 1199;
    expect(applyCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair })).toEqual({
      ok: false,
      error: 'NO_GOLD',
    });
    state.players[0]!.gold = 1200;
    expect(applyCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair }).ok).toBe(
      true,
    );
  });

  it('INVALID_TARGET: tamaño mínimo, suelo ocupado, fuera de territorio, sala no construible', () => {
    const { state, data } = matchAtCorner0();
    const bad = (room: string, rect: { x: number; y: number; w: number; h: number }) =>
      applyCommand(state, data, 1, { type: 'buildRoom', room, rect });
    expect(bad('lair', { x: 6, y: 2, w: 1, h: 2 })).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(bad('hatchery', { x: 6, y: 2, w: 2, h: 2 })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(bad('lair', { x: 5, y: 5, w: 2, h: 2 })).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(bad('lair', { x: 11, y: 2, w: 2, h: 2 })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(bad('portal', { x: 6, y: 2, w: 3, h: 3 })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
    expect(bad('nada', { x: 6, y: 2, w: 3, h: 3 })).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(bad('lair', { x: 63, y: 63, w: 2, h: 2 })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
    });
  });

  it('dos construcciones en el mismo tick que se pisan: la segunda se rechaza al ejecutarse', () => {
    const { state, data } = matchAtCorner0();
    expect(applyCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair }).ok).toBe(
      true,
    );
    expect(applyCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair }).ok).toBe(
      true,
    );
    const events = step(state, data);
    expect(events.filter((e) => e.type === 'roomBuilt')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'commandRejected')).toHaveLength(1);
    expect(state.players[0]!.gold).toBe(3800);
  });

  it('vender devuelve el 50 % y libera los tiles', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair });
    expect(send(state, data, 1, { type: 'sellRoom', tile: pt(7, 3) }).ok).toBe(true);
    expect(state.players[0]!.gold).toBe(3800 + 600);
    expect(state.roomAt[tileIndex(state, 6, 2)]).toBe(0);
    expect(state.rooms.some((r) => r.type === 'lair')).toBe(false);
  });

  it('no se vende el Corazón ni el Portal, ni donde no hay sala, ni la sala de otro', () => {
    const { state, data } = matchAtCorner0();
    const sell = (x: number, y: number) =>
      applyCommand(state, data, 1, { type: 'sellRoom', tile: pt(x, y) });
    expect(sell(6, 6)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(sell(9, 9)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    expect(sell(6, 2)).toEqual({ ok: false, error: 'INVALID_TARGET' });
    const enemyTreasury = data.map.bases
      .find((b) => b.slot === state.players[1]!.slot)!
      .rooms.find((r) => r.type === 'treasury')!.rect;
    expect(sell(enemyTreasury.x, enemyTreasury.y)).toEqual({ ok: false, error: 'NOT_OWNER' });
  });

  it('vender la Tesorería recorta el oro a la capacidad que queda', () => {
    const { state, data } = matchAtCorner0();
    send(state, data, 1, { type: 'buildRoom', room: 'treasury', rect: { x: 6, y: 2, w: 3, h: 3 } }); // 900 de oro
    state.players[0]!.gold = 9000 + 3000; // capacidad total 18.000, esto cabe
    send(state, data, 1, { type: 'sellRoom', tile: pt(2, 2) }); // vende la original: capacidad 9.000 (3 tiles = 3×... )
    const cap = state.rooms
      .filter((r) => r.owner === 1 && r.type === 'treasury')
      .reduce((n, r) => n + r.tiles.length * 1000, 0);
    expect(state.players[0]!.gold).toBeLessThanOrEqual(cap);
  });
});

describe('límite de comandos', () => {
  it('RATE_LIMIT a partir del comando 31 en el mismo segundo, y se recupera al siguiente', () => {
    const { state, data } = matchAtCorner0();
    const cmd: Command = { type: 'dig', tiles: [pt(11, 4)] };
    for (let i = 0; i < 30; i++) expect(applyCommand(state, data, 1, cmd).ok).toBe(true);
    expect(applyCommand(state, data, 1, cmd)).toEqual({ ok: false, error: 'RATE_LIMIT' });
    // El otro jugador tiene su propio contador.
    expect(applyCommand(state, data, 2, { type: 'dig', tiles: [pt(1, 1)] }).ok).toBe(false);
    expect(applyCommand(state, data, 2, { type: 'dig', tiles: [pt(1, 1)] })).not.toEqual({
      ok: false,
      error: 'RATE_LIMIT',
    });
    run(state, data, 10);
    expect(applyCommand(state, data, 1, cmd).ok).toBe(true);
  });
});

describe('previewCommand', () => {
  const lair = { x: 6, y: 2, w: 2, h: 2 };

  it('no encola, no registra y no gasta el límite de ritmo', () => {
    const { state, data } = matchAtCorner0();
    for (let i = 0; i < 100; i++)
      previewCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair });
    expect(state.queue).toHaveLength(0);
    expect(state.log).toHaveLength(0);
    expect(applyCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair }).ok).toBe(
      true,
    );
  });

  it('da el coste y los mismos errores que applyCommand', () => {
    const { state, data } = matchAtCorner0();
    expect(
      previewCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair }),
    ).toMatchObject({ ok: true, cost: 1200 });
    state.players[0]!.gold = 10;
    expect(previewCommand(state, data, 1, { type: 'buildRoom', room: 'lair', rect: lair })).toEqual(
      { ok: false, error: 'NO_GOLD' },
    );
    expect(previewCommand(state, data, 9, { type: 'buildRoom', room: 'lair', rect: lair })).toEqual(
      { ok: false, error: 'NOT_OWNER' },
    );
  });
});
