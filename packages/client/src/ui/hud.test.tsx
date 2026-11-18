import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { applyCommand, newCreature, rulesOf, step } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { LOCAL_PLAYER, Sandbox } from '../sandbox/sandbox';
import { Hud } from './Hud';
import { buildHudModel, formatClock } from './hudModel';

const data = loadGameData();
const fresh = () => new Sandbox(data, 1);
const dig = { kind: 'dig' } as const;

describe('buildHudModel', () => {
  it('muestra el oro, la capacidad, el maná y los Imps del inicio', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, LOCAL_PLAYER, dig, []);
    expect(m.gold).toBe(5000);
    expect(m.goldCapacity).toBe(9000);
    expect(m.goldFull).toBe(false);
    expect(m.mana).toBe(2000);
    expect(m.manaMax).toBe(5000);
    expect(m.manaRegen).toBeCloseTo(12.1);
    expect(m.imps).toBe(4);
    expect(m.impsMax).toBe(12);
    expect(m.clock).toBe('00:00');
  });

  it('avisa de Tesorería llena', () => {
    const sb = fresh();
    sb.state.players[0]!.gold = 9000;
    expect(buildHudModel(sb.state, data, 1, dig, []).goldFull).toBe(true);
  });

  it('lista las 5 salas con tecla, coste mínimo y si alcanza el oro', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(m.rooms.map((r) => [r.hotkey, r.id, r.minCost])).toEqual([
      ['1', 'lair', 1200],
      ['2', 'hatchery', 1350],
      ['3', 'treasury', 900],
      ['4', 'trainingRoom', 2250],
      ['5', 'library', 2250],
    ]);
    expect(m.rooms.every((r) => r.affordable)).toBe(true);
    sb.state.players[0]!.gold = 1000;
    const poor = buildHudModel(sb.state, data, 1, dig, []).rooms;
    expect(poor.filter((r) => r.affordable).map((r) => r.id)).toEqual(['treasury']);
  });

  it('marca la herramienta activa', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, { kind: 'build', room: 'lair' }, []);
    expect(m.rooms.find((r) => r.id === 'lair')!.active).toBe(true);
    expect(m.tools.some((t) => t.active)).toBe(false);
    expect(
      buildHudModel(sb.state, data, 1, { kind: 'claim' }, []).tools.find((t) => t.id === 'claim')!
        .active,
    ).toBe(true);
  });

  it('el hechizo Crear Imp muestra su coste, que sube con cada Imp extra, y su enfriamiento', () => {
    const sb = fresh();
    expect(buildHudModel(sb.state, data, 1, dig, []).spell).toMatchObject({
      cost: 300,
      cooldownLeft: 0,
      affordable: true,
    });
    applyCommand(sb.state, data, 1, {
      type: 'castSpell',
      spell: 'createImp',
      target: { x: 3, y: 8 },
    });
    step(sb.state, data);
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(m.spell.cost).toBe(350);
    expect(m.spell.cooldownLeft).toBeGreaterThan(1.5);
    sb.state.players[0]!.mana = 10;
    expect(buildHudModel(sb.state, data, 1, dig, []).spell.affordable).toBe(false);
  });

  it('los avisos activos pasan al HUD en el mismo orden', () => {
    const sb = fresh();
    const notices = [
      { text: 'Primero', tick: 0 },
      { text: 'Segundo', tick: 3 },
    ];
    expect(buildHudModel(sb.state, data, 1, dig, notices).notices).toEqual(['Primero', 'Segundo']);
  });

  it('lista las criaturas propias con nivel, ánimo, vida y lo que hacen', () => {
    const sb = fresh();
    const goblin = newCreature(sb.state, rulesOf(data), 1, 'goblin', 9 * 64 + 9);
    goblin.hp = 750;
    goblin.goal = 'training';
    goblin.mode = 'acting';
    sb.state.creatures.push(goblin);
    const other = newCreature(sb.state, rulesOf(data), 2, 'troll', 9 * 64 + 9);
    sb.state.creatures.push(other);
    const m = buildHudModel(sb.state, data, 1, dig, []);
    expect(m.creatures).toHaveLength(1);
    expect(m.creatures[0]).toMatchObject({
      name: 'Goblin',
      level: 1,
      band: 'neutral',
      bandName: 'Neutral',
      activity: 'Entrenando',
      hpFraction: 0.5,
      held: false,
    });
  });

  it('cuenta la mano y los segundos que faltan para el día de pago', () => {
    const sb = fresh();
    expect(buildHudModel(sb.state, data, 1, dig, []).payday).toBe(120);
    sb.state.tick = 300;
    expect(buildHudModel(sb.state, data, 1, dig, []).payday).toBe(90);
    sb.state.players[0]!.hand = [1, 2];
    expect(buildHudModel(sb.state, data, 1, dig, []).hand).toEqual({ count: 2, capacity: 8 });
  });

  it('el reloj da minutos y segundos de juego', () => {
    expect(formatClock(0, 10)).toBe('00:00');
    expect(formatClock(605, 10)).toBe('01:00');
    expect(formatClock(36_000, 10)).toBe('60:00');
  });

  it('un jugador que no existe es un error claro', () => {
    expect(() => buildHudModel(fresh().state, data, 9, dig, [])).toThrow(/jugador 9/);
  });
});

describe('Hud', () => {
  const html = (over: (m: ReturnType<typeof buildHudModel>) => void = () => {}) => {
    const sb = fresh();
    const model = buildHudModel(sb.state, data, 1, dig, []);
    over(model);
    return render(<Hud model={model} onTool={() => {}} />);
  };

  it('pinta oro, maná, Imps y las 5 salas con sus atajos', () => {
    const out = html();
    expect(out).toContain('Oro 5000 / 9000');
    expect(out).toContain('Maná 2000');
    expect(out).toContain('Imps 4/12');
    for (const name of ['Guarida', 'Criadero', 'Tesorería', 'Sala de entrenamiento', 'Biblioteca'])
      expect(out).toContain(name);
    expect(out).toContain('Crear Imp');
  });

  it('muestra el aviso cuando lo hay y no cuando no', () => {
    expect(html()).not.toContain('class="notice"');
    expect(html((m) => (m.notices = ['La Tesorería está llena.']))).toContain(
      'La Tesorería está llena.',
    );
  });

  it('marca la Tesorería llena y las salas que no se pueden pagar', () => {
    expect(html((m) => (m.goldFull = true))).toContain('LLENA');
    const poor = html((m) => m.rooms.forEach((r) => (r.affordable = false)));
    expect(poor.match(/btn poor/g)?.length).toBe(5);
  });

  it('pinta la lista de criaturas con su actividad y el contador de pago y de la mano', () => {
    const sb = fresh();
    const c = newCreature(sb.state, rulesOf(data), 1, 'troll', 9 * 64 + 9);
    sb.state.creatures.push(c);
    sb.state.players[0]!.hand = [c.id];
    const out = render(<Hud model={buildHudModel(sb.state, data, 1, dig, [])} onTool={() => {}} />);
    expect(out).toContain('Criaturas (1)');
    expect(out).toContain('Troll');
    expect(out).toContain('Descansando');
    expect(out).toContain('Pago 120 s');
    expect(out).toContain('Mano 1/8');
  });

  it('sin criaturas no hay panel de criaturas ni contador de mano', () => {
    const out = html();
    expect(out).not.toContain('Criaturas (');
    expect(out).not.toContain('Mano ');
  });
});
