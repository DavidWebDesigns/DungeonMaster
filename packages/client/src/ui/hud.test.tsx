import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { applyCommand, step } from '@dm/shared';
import { loadGameData } from '../data/loadGameData';
import { LOCAL_PLAYER, Sandbox } from '../sandbox/sandbox';
import { Hud } from './Hud';
import { buildHudModel, formatClock, NOTICE_SECONDS } from './hudModel';

const data = loadGameData();
const fresh = () => new Sandbox(data, 1);
const dig = { kind: 'dig' } as const;

describe('buildHudModel', () => {
  it('muestra el oro, la capacidad, el maná y los Imps del inicio', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, LOCAL_PLAYER, dig, null);
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
    expect(buildHudModel(sb.state, data, 1, dig, null).goldFull).toBe(true);
  });

  it('lista las 5 salas con tecla, coste mínimo y si alcanza el oro', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, dig, null);
    expect(m.rooms.map((r) => [r.hotkey, r.id, r.minCost])).toEqual([
      ['1', 'lair', 1200],
      ['2', 'hatchery', 1350],
      ['3', 'treasury', 900],
      ['4', 'trainingRoom', 2250],
      ['5', 'library', 2250],
    ]);
    expect(m.rooms.every((r) => r.affordable)).toBe(true);
    sb.state.players[0]!.gold = 1000;
    const poor = buildHudModel(sb.state, data, 1, dig, null).rooms;
    expect(poor.filter((r) => r.affordable).map((r) => r.id)).toEqual(['treasury']);
  });

  it('marca la herramienta activa', () => {
    const sb = fresh();
    const m = buildHudModel(sb.state, data, 1, { kind: 'build', room: 'lair' }, null);
    expect(m.rooms.find((r) => r.id === 'lair')!.active).toBe(true);
    expect(m.tools.some((t) => t.active)).toBe(false);
    expect(
      buildHudModel(sb.state, data, 1, { kind: 'claim' }, null).tools.find((t) => t.id === 'claim')!
        .active,
    ).toBe(true);
  });

  it('el hechizo Crear Imp muestra su coste, que sube con cada Imp extra, y su enfriamiento', () => {
    const sb = fresh();
    expect(buildHudModel(sb.state, data, 1, dig, null).spell).toMatchObject({
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
    const m = buildHudModel(sb.state, data, 1, dig, null);
    expect(m.spell.cost).toBe(350);
    expect(m.spell.cooldownLeft).toBeGreaterThan(1.5);
    sb.state.players[0]!.mana = 10;
    expect(buildHudModel(sb.state, data, 1, dig, null).spell.affordable).toBe(false);
  });

  it('los avisos caducan a los 4 segundos', () => {
    const sb = fresh();
    const notice = { text: 'No tienes oro suficiente.', tick: 0 };
    expect(buildHudModel(sb.state, data, 1, dig, notice).notice).toBe('No tienes oro suficiente.');
    sb.state.tick = NOTICE_SECONDS * data.global.tickRate;
    expect(buildHudModel(sb.state, data, 1, dig, notice).notice).toBeNull();
  });

  it('el reloj da minutos y segundos de juego', () => {
    expect(formatClock(0, 10)).toBe('00:00');
    expect(formatClock(605, 10)).toBe('01:00');
    expect(formatClock(36_000, 10)).toBe('60:00');
  });

  it('un jugador que no existe es un error claro', () => {
    expect(() => buildHudModel(fresh().state, data, 9, dig, null)).toThrow(/jugador 9/);
  });
});

describe('Hud', () => {
  const html = (over: (m: ReturnType<typeof buildHudModel>) => void = () => {}) => {
    const sb = fresh();
    const model = buildHudModel(sb.state, data, 1, dig, null);
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
    expect(html((m) => (m.notice = 'La Tesorería está llena.'))).toContain(
      'La Tesorería está llena.',
    );
  });

  it('marca la Tesorería llena y las salas que no se pueden pagar', () => {
    expect(html((m) => (m.goldFull = true))).toContain('LLENA');
    const poor = html((m) => m.rooms.forEach((r) => (r.affordable = false)));
    expect(poor.match(/btn poor/g)?.length).toBe(5);
  });
});
