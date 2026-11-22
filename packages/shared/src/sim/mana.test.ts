import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { manaPulsePerSecond, manaRegenPerSecond, templeManaPerSecond } from './economy';
import { rulesOf } from './rules';
import { step } from './step';
import { extendTerritory, matchAtCorner0, run } from './testUtils';
import type { MatchState } from './types';
import type { DataSet } from '../data';

/** Territorio libre y oro de sobra; sin Portal ni día de pago que molesten. */
function world() {
  const m = matchAtCorner0();
  m.data.global.portal.attractIntervalSeconds = 100000;
  m.data.economy.paydayIntervalSeconds = 100000;
  extendTerritory(m.state, m.data);
  m.state.players[0]!.gold = 90000;
  m.state.players[0]!.mana = 0;
  return m;
}

function build(
  state: MatchState,
  data: DataSet,
  room: string,
  rect: { x: number; y: number; w: number; h: number },
) {
  const res = applyCommand(state, data, 1, { type: 'buildRoom', room, rect });
  expect(res.ok, `${room}: ${JSON.stringify(res)}`).toBe(true);
  step(state, data);
  state.players[0]!.mana = 0;
}

describe('Templo: maná por tile', () => {
  it('cada tile de Templo suma 10 de maná por segundo, por encima del tope normal', () => {
    const { state, data } = world();
    const rules = rulesOf(data);
    const before = manaRegenPerSecond(state, rules, 1);
    expect(templeManaPerSecond(state, rules, 1)).toBe(0);
    // Templo (pide Cámara de tortura y Cementerio, que pide Biblioteca) de 3 tiles.
    build(state, data, 'tortureChamber', { x: 2, y: 11, w: 1, h: 1 });
    build(state, data, 'library', { x: 4, y: 11, w: 1, h: 1 });
    build(state, data, 'graveyard', { x: 6, y: 11, w: 1, h: 1 });
    build(state, data, 'temple', { x: 2, y: 14, w: 3, h: 1 });
    expect(templeManaPerSecond(state, rules, 1)).toBe(30);
    expect(manaRegenPerSecond(state, rules, 1)).toBeCloseTo(before + 30, 5);
    // Con el tope de 25/s ya alcanzado por el territorio, el Templo sigue sumando.
    data.global.mana.regenCapPerSecond = 5;
    expect(manaRegenPerSecond(state, rules, 1)).toBeCloseTo(5 + 30, 5);
  });

  it('el maná sube de verdad cada segundo en esa cantidad', () => {
    const { state, data } = world();
    build(state, data, 'tortureChamber', { x: 2, y: 11, w: 1, h: 1 });
    build(state, data, 'library', { x: 4, y: 11, w: 1, h: 1 });
    build(state, data, 'graveyard', { x: 6, y: 11, w: 1, h: 1 });
    build(state, data, 'temple', { x: 2, y: 14, w: 2, h: 1 }); // 2 tiles = +20/s
    const rules = rulesOf(data);
    const perSecond = manaRegenPerSecond(state, rules, 1);
    state.players[0]!.mana = 0;
    run(state, data, 100); // 10 s
    expect(state.players[0]!.mana).toBeCloseTo(perSecond * 10, 0);
  });

  it('no pasa del máximo de maná y se pierde con el Templo vendido', () => {
    const { state, data } = world();
    build(state, data, 'tortureChamber', { x: 2, y: 11, w: 1, h: 1 });
    build(state, data, 'library', { x: 4, y: 11, w: 1, h: 1 });
    build(state, data, 'graveyard', { x: 6, y: 11, w: 1, h: 1 });
    build(state, data, 'temple', { x: 2, y: 14, w: 4, h: 1 });
    state.players[0]!.mana = data.global.mana.max - 1;
    run(state, data, 100);
    expect(state.players[0]!.mana).toBe(data.global.mana.max);
    applyCommand(state, data, 1, { type: 'sellRoom', tile: { x: 2, y: 14 } });
    step(state, data);
    expect(templeManaPerSecond(state, rulesOf(data), 1)).toBe(0);
  });
});

describe('Biblioteca de nivel 10: 50 de maná cada 10 segundos', () => {
  it('con 10 tiles da 50 de maná cada 10 s; con 9 no da nada', () => {
    const { state, data } = world();
    build(state, data, 'library', { x: 2, y: 11, w: 3, h: 3 }); // 9 tiles
    run(state, data, 250);
    expect(state.players[0]!.mana).toBeLessThan(data.global.mana.max); // solo la regeneración normal
    const normal = manaRegenPerSecond(state, rulesOf(data), 1) * 25;
    expect(state.players[0]!.mana).toBeCloseTo(normal, 0);
    expect(manaPulsePerSecond(state, rulesOf(data), 1)).toBe(0);
    // El tile 10 la sube de nivel: ahora sí.
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'library',
      rect: { x: 5, y: 11, w: 1, h: 1 },
    });
    step(state, data);
    expect(state.rooms.find((r) => r.type === 'library' && r.tiles.length === 10)).toBeTruthy();
    expect(manaPulsePerSecond(state, rulesOf(data), 1)).toBeCloseTo(5, 5);
  });

  it('el pulso llega justo a los 10 s y se repite', () => {
    const { state, data } = world();
    data.global.mana.regenBasePerSecond = 0;
    data.global.mana.regenPerClaimedTilePerSecond = 0;
    build(state, data, 'library', { x: 2, y: 11, w: 5, h: 2 }); // 10 tiles
    const rules = rulesOf(data);
    expect(manaRegenPerSecond(state, rules, 1)).toBe(0);
    // (el tick que ejecutó la construcción ya cuenta como el primero del reloj)
    run(state, data, 98);
    expect(state.players[0]!.mana).toBe(0);
    run(state, data, 1);
    expect(state.players[0]!.mana).toBe(50);
    run(state, data, 100);
    expect(state.players[0]!.mana).toBe(100);
  });

  it('dos Bibliotecas de nivel 10 dan un pulso cada una, y perder el nivel reinicia el reloj', () => {
    const { state, data } = world();
    data.global.mana.regenBasePerSecond = 0;
    data.global.mana.regenPerClaimedTilePerSecond = 0;
    build(state, data, 'library', { x: 2, y: 11, w: 5, h: 2 });
    build(state, data, 'library', { x: 2, y: 14, w: 5, h: 2 });
    run(state, data, 100);
    expect(state.players[0]!.mana).toBe(100);
    // Una pierde un tile (se vende entera la otra, para simplificar): queda una sola.
    applyCommand(state, data, 1, { type: 'sellRoom', tile: { x: 2, y: 14 } });
    step(state, data);
    state.players[0]!.mana = 0;
    run(state, data, 100);
    expect(state.players[0]!.mana).toBe(50);
  });

  it('el maná no pasa del máximo', () => {
    const { state, data } = world();
    data.global.mana.regenBasePerSecond = 0;
    data.global.mana.regenPerClaimedTilePerSecond = 0;
    build(state, data, 'library', { x: 2, y: 11, w: 5, h: 2 });
    state.players[0]!.mana = data.global.mana.max - 10;
    run(state, data, 100);
    expect(state.players[0]!.mana).toBe(data.global.mana.max);
  });
});
