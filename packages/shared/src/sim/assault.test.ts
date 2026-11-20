import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { findAssaultTarget } from './combat';
import { creatureMaxHp } from './creatureStats';
import { tileIndex } from './grid';
import { rulesOf } from './rules';
import { step } from './step';
import { baseRoom, duel, run, spawn } from './testUtils';

const noImps = (s: { imps: Array<{ owner: number }> }) => {
  s.imps = s.imps.filter(() => false);
};

/** Recoge y suelta una criatura propia en un tile, como hace el jugador con el ratón. */
function moveWithHand(
  state: Parameters<typeof applyCommand>[0],
  data: Parameters<typeof applyCommand>[1],
  id: number,
  x: number,
  y: number,
) {
  expect(applyCommand(state, data, 1, { type: 'pickUp', id }).ok).toBe(true);
  step(state, data);
  const res = applyCommand(state, data, 1, { type: 'drop', tile: { x, y } });
  step(state, data);
  return res;
}

describe('soltar con la mano = asalto al objetivo visible más cercano', () => {
  it('una criatura soltada va a por un enemigo que ve aunque esté fuera del radio de combate (más de 6 tiles)', () => {
    const { state, data } = duel();
    noImps(state);
    const enemy = spawn(state, data, 2, 'troll', 9.5, 3.5, { mood: 50, hp: 2500 });
    const g = spawn(state, data, 1, 'goblin', 3.5, 8.5, { mood: 50 });
    const hp0 = creatureMaxHp(rulesOf(data), enemy);
    // Sin asalto, a 6,4 tiles no la ve como amenaza: no se acerca por su cuenta.
    run(state, data, 3);
    expect(g.goal).not.toBe('combat');
    expect(g.assaultKind).toBe('none');
    // Recogida y soltada en el mismo sitio: ahora va a por el troll.
    moveWithHand(state, data, g.id, 3, 8);
    expect(g.assaultKind).toBe('creature');
    expect(g.assaultId).toBe(enemy.id);
    run(state, data, 150);
    expect(enemy.hp).toBeLessThan(hp0);
  });

  it('elige el objetivo más cercano al tile donde se soltó, no a la criatura', () => {
    const { state, data } = duel();
    noImps(state);
    const near = spawn(state, data, 2, 'troll', 9.5, 3.5);
    spawn(state, data, 2, 'troll', 3.5, 3.5);
    const g = spawn(state, data, 1, 'goblin', 5.5, 8.5);
    // Cerca de (9,3): el troll de la derecha es el más cercano al punto de suelta.
    moveWithHand(state, data, g.id, 9, 5);
    expect(g.assaultId).toBe(near.id);
  });

  it('sin enemigos a la vista no hay asalto y la criatura sigue su vida normal', () => {
    const { state, data } = duel();
    const g = spawn(state, data, 1, 'goblin', 3.5, 8.5);
    // La base enemiga está lejos y en la niebla.
    moveWithHand(state, data, g.id, 3, 8);
    expect(g.assaultKind).toBe('none');
  });

  it('solo cuenta lo que se ve: un enemigo en la niebla no se marca', () => {
    const { state, data } = duel();
    noImps(state);
    spawn(state, data, 2, 'troll', 40.5, 40.5);
    const g = spawn(state, data, 1, 'goblin', 3.5, 8.5);
    moveWithHand(state, data, g.id, 3, 8);
    expect(g.assaultKind).toBe('none');
    const rules = rulesOf(data);
    expect(findAssaultTarget(state, rules, 1, tileIndex(state, 3, 8))).toBeNull();
  });

  it('también marca salas y el Corazón enemigos que se vean', () => {
    const { state, data } = duel();
    noImps(state);
    // Una criatura propia ve la base enemiga; otra se suelta en terreno propio y sale a asaltar lo que se ve.
    const h = baseRoom(data, 2, 'heart');
    spawn(state, data, 1, 'troll', h.x - 1.5, h.y + 1.5);
    const g = spawn(state, data, 1, 'goblin', 3.5, 8.5);
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: g.id }).ok).toBe(true);
    step(state, data);
    expect(applyCommand(state, data, 1, { type: 'drop', tile: { x: 3, y: 8 } }).ok).toBe(true);
    step(state, data);
    expect(['structure', 'creature', 'imp']).toContain(g.assaultKind);
    expect(g.assaultKind).not.toBe('none');
  });

  it('el asalto termina cuando el objetivo muere y entonces vuelve a su comportamiento normal', () => {
    const { state, data } = duel();
    noImps(state);
    const enemy = spawn(state, data, 2, 'goblin', 8.5, 4.5, { mood: 50, hp: 20 });
    const g = spawn(state, data, 1, 'troll', 3.5, 8.5, { mood: 50 });
    moveWithHand(state, data, g.id, 3, 8);
    expect(g.assaultKind).toBe('creature');
    run(state, data, 120);
    expect(state.creatures.find((c) => c.id === enemy.id)).toBeUndefined();
    run(state, data, 5);
    expect(g.assaultKind).toBe('none');
  });

  it('recoger de nuevo borra el asalto anterior', () => {
    const { state, data } = duel();
    noImps(state);
    spawn(state, data, 2, 'troll', 8.5, 4.5, { mood: 50 });
    const g = spawn(state, data, 1, 'goblin', 3.5, 8.5);
    moveWithHand(state, data, g.id, 3, 8);
    expect(g.assaultKind).not.toBe('none');
    applyCommand(state, data, 1, { type: 'pickUp', id: g.id });
    step(state, data);
    expect(g.assaultKind).toBe('none');
  });

  it('con poca vida prefiere huir a su cama antes que seguir con el asalto', () => {
    const { state, data } = duel();
    noImps(state);
    const rules = rulesOf(data);
    state.players[0]!.gold = 50000;
    const claimed = data.terrain.findIndex((t) => t.id === 'claimedFloor');
    for (let y = 11; y < 14; y++)
      for (let x = 2; x < 6; x++) {
        state.terrain[y * 64 + x] = claimed;
        state.owner[y * 64 + x] = 1;
      }
    state.mapVersion++;
    applyCommand(state, data, 1, {
      type: 'buildRoom',
      room: 'lair',
      rect: { x: 2, y: 11, w: 2, h: 2 },
    });
    step(state, data);
    spawn(state, data, 2, 'troll', 8.5, 4.5, { mood: 50 });
    const g = spawn(state, data, 1, 'goblin', 3.5, 8.5, { mood: 50, beds: [11 * 64 + 2] });
    g.hp = creatureMaxHp(rules, g) * 0.1;
    moveWithHand(state, data, g.id, 3, 8);
    run(state, data, 10);
    expect(g.goal).toBe('flee');
  });

  it('se pueden llevar y soltar 10 criaturas de una vez, todas al mismo objetivo', () => {
    const { state, data } = duel();
    noImps(state);
    const enemy = spawn(state, data, 2, 'troll', 8.5, 4.5, { mood: 50 });
    const crew = Array.from({ length: 10 }, (_, i) =>
      spawn(state, data, 1, 'goblin', 2.5 + (i % 5), 8.5 + Math.floor(i / 5), { mood: 50 }),
    );
    for (const c of crew)
      expect(applyCommand(state, data, 1, { type: 'pickUp', id: c.id }).ok).toBe(true);
    step(state, data);
    expect(state.players[0]!.hand).toHaveLength(10);
    for (let i = 0; i < 10; i++)
      expect(applyCommand(state, data, 1, { type: 'drop', tile: { x: 6, y: 8 } }).ok).toBe(true);
    step(state, data);
    expect(state.players[0]!.hand).toHaveLength(0);
    expect(crew.every((c) => !c.held && c.assaultId === enemy.id)).toBe(true);
  });
});

describe('soltar solo en terreno propio', () => {
  it('suelo sin dueño o de otro jugador se rechaza; el propio vale', () => {
    const { state, data } = duel();
    noImps(state);
    const g = spawn(state, data, 1, 'goblin', 3.5, 8.5);
    expect(applyCommand(state, data, 1, { type: 'pickUp', id: g.id }).ok).toBe(true);
    step(state, data);
    // Un tile caminable sin dueño: se excava uno y no se reclama.
    const neutral = state.terrain.findIndex(
      (t, i) => state.owner[i] === 0 && data.terrain[t]?.walkable === true,
    );
    if (neutral >= 0) {
      const r = applyCommand(state, data, 1, {
        type: 'drop',
        tile: { x: neutral % state.width, y: Math.floor(neutral / state.width) },
      });
      expect(r).toEqual({ ok: false, error: 'NOT_OWNER' });
    }
    expect(applyCommand(state, data, 1, { type: 'drop', tile: { x: 3, y: 8 } }).ok).toBe(true);
  });
});

describe('precisión: el más cercano es el más cercano andando', () => {
  /** Encierra un tile entre rocas para que nadie pueda llegar a él. */
  function isolate(
    state: Parameters<typeof applyCommand>[0],
    data: Parameters<typeof applyCommand>[1],
    x: number,
    y: number,
  ) {
    const rock = rulesOf(data).terrainIndex['solidRock']!;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (dx !== 0 || dy !== 0) state.terrain[tileIndex(state, x + dx, y + dy)] = rock;
  }

  it('un enemigo cercano pero inalcanzable no gana a uno algo más lejano al que sí se puede llegar', () => {
    const { state, data } = duel();
    noImps(state);
    const sealed = spawn(state, data, 2, 'troll', 9.5, 3.5);
    const reachable = spawn(state, data, 2, 'troll', 3.5, 3.5);
    // Una criatura propia da vista sobre ambos.
    spawn(state, data, 1, 'troll', 6.5, 6.5);
    isolate(state, data, 9, 3);
    const t = findAssaultTarget(state, rulesOf(data), 1, tileIndex(state, 9, 5));
    expect(t).toEqual({ kind: 'creature', id: reachable.id });
    expect(t?.id).not.toBe(sealed.id);
  });

  it('si todos están tras los muros, se cae a la distancia en línea recta (como antes)', () => {
    const { state, data } = duel();
    noImps(state);
    const a = spawn(state, data, 2, 'troll', 9.5, 3.5);
    const b = spawn(state, data, 2, 'troll', 3.5, 3.5);
    spawn(state, data, 1, 'troll', 6.5, 6.5);
    isolate(state, data, 9, 3);
    isolate(state, data, 3, 3);
    const t = findAssaultTarget(state, rulesOf(data), 1, tileIndex(state, 9, 5));
    expect(t).toEqual({ kind: 'creature', id: a.id });
    expect(t?.id).not.toBe(b.id);
  });
});
