import { describe, expect, it } from 'vitest';
import {
  activityLabel,
  CREATURE_LOOKS,
  hpColor,
  creatureBarOf,
  hpFraction,
  impActivityLabel,
  moodCloudOf,
  lookOf,
  MOOD_ICONS,
  moodIconOf,
  ownerMarkOf,
} from './creatureStyle';
import { playerColor } from './palette';
import { IMP_RADIUS } from './scale';

describe('creatureStyle', () => {
  it('cada tipo del juego tiene su aspecto y los más fuertes son más grandes', () => {
    for (const t of ['goblin', 'troll', 'warlock', 'bileDemon'])
      expect(CREATURE_LOOKS[t]).toBeDefined();
    expect(lookOf('bileDemon').radius).toBeGreaterThan(lookOf('troll').radius);
    expect(lookOf('troll').radius).toBeGreaterThan(lookOf('goblin').radius);
    expect(lookOf('goblin').radius).toBeGreaterThan(IMP_RADIUS);
  });

  it('un tipo desconocido tiene un aspecto de reserva', () => {
    expect(lookOf('dragon').radius).toBeGreaterThan(0);
  });

  it('las 6 bandas de ánimo tienen icono y Neutral no se dibuja sobre la cabeza', () => {
    for (const b of ['radiant', 'happy', 'neutral', 'unhappy', 'angry', 'furious'])
      expect(MOOD_ICONS[b]).toBeDefined();
    expect(moodIconOf('neutral').showOverHead).toBe(false);
    expect(moodIconOf('furious').showOverHead).toBe(true);
    expect(moodIconOf('inventada')).toBe(moodIconOf('neutral'));
  });

  it('la fracción de vida está entre 0 y 1 y el color pasa de verde a rojo', () => {
    expect(hpFraction({ hp: 750 }, 1500)).toBe(0.5);
    expect(hpFraction({ hp: -5 }, 1500)).toBe(0);
    expect(hpFraction({ hp: 3000 }, 1500)).toBe(1);
    expect(hpFraction({ hp: 10 }, 0)).toBe(0);
    expect(hpColor(1)[1]).toBeGreaterThan(hpColor(1)[0]);
    expect(hpColor(0.1)[0]).toBeGreaterThan(hpColor(0.1)[1]);
  });

  it('describe lo que hace la criatura', () => {
    expect(activityLabel({ held: true, goal: 'wander', mode: 'moving' })).toBe('En tu mano');
    expect(activityLabel({ held: false, goal: 'bed', mode: 'acting' })).toBe('Durmiendo');
    expect(activityLabel({ held: false, goal: 'bed', mode: 'moving' })).toBe('Va a su cama');
    expect(activityLabel({ held: false, goal: 'training', mode: 'acting' })).toBe('Entrenando');
    expect(activityLabel({ held: false, goal: 'none', mode: 'idle' })).toBe('Descansando');
  });
});

describe('moodCloudOf', () => {
  it('enfadada es una nube gris oscura, ancha y baja', () => {
    const c = moodCloudOf('angry', 0);
    expect(c.scale.x).toBeGreaterThan(c.scale.y);
    expect(Math.max(...c.color)).toBeLessThan(0.5);
  });

  it('furiosa relampaguea: casi siempre oscura y a ratos amarillo vivo', () => {
    const flash = moodCloudOf('furious', 0.05);
    const dark = moodCloudOf('furious', 0.5);
    expect(flash.color[0]).toBeGreaterThan(0.9);
    expect(Math.max(...dark.color)).toBeLessThan(0.4);
    // Se repite cada 0,9 s.
    expect(moodCloudOf('furious', 0.95).color).toEqual(flash.color);
  });

  it('el resto de ánimos mantienen la bolita normal', () => {
    expect(moodCloudOf('happy', 3)).toEqual({
      color: MOOD_ICONS['happy']!.color,
      scale: { x: 1, y: 1 },
    });
  });
});

describe('ownerMarkOf', () => {
  it('solo marca a las unidades que no son del jugador local, con el color de su dueño', () => {
    expect(ownerMarkOf(1, 1).show).toBe(false);
    const enemy = ownerMarkOf(2, 1);
    expect(enemy.show).toBe(true);
    expect(enemy.color).toEqual(playerColor(2));
    expect(ownerMarkOf(3, 1).color).not.toEqual(enemy.color);
  });
});

describe('impActivityLabel', () => {
  const base = { held: false, goal: 'none', mode: 'idle', loafUntil: 0, carry: 0 } as const;
  it('distingue mano, holgazanería, entrega, trabajo y libre', () => {
    expect(impActivityLabel({ ...base, held: true }, 10)).toBe('En tu mano');
    expect(impActivityLabel({ ...base, loafUntil: 50 }, 10)).toBe('Holgazaneando');
    expect(impActivityLabel({ ...base, loafUntil: 5 }, 10)).toBe('Libre'); // ya se le pasó
    expect(impActivityLabel({ ...base, goal: 'haul' }, 10)).toBe('Lleva oro a la Tesorería');
    expect(impActivityLabel({ ...base, goal: 'task', mode: 'working' }, 10)).toBe('Trabajando');
    expect(impActivityLabel({ ...base, goal: 'task', mode: 'moving' }, 10)).toBe('Va a trabajar');
  });
});

describe('creatureBarOf', () => {
  it('las propias solo enseñan la barra si están heridas y sin marco', () => {
    expect(creatureBarOf(1, 1, 1)).toEqual({ show: false, frame: null });
    expect(creatureBarOf(1, 1, 0.6)).toEqual({ show: true, frame: null });
  });

  it('las enemigas siempre la llevan, con un marco del color de su dueño', () => {
    const full = creatureBarOf(2, 1, 1);
    expect(full.show).toBe(true);
    expect(full.frame).toEqual(playerColor(2));
    expect(creatureBarOf(3, 1, 0.3).frame).toEqual(playerColor(3));
    expect(creatureBarOf(2, 1, 1).frame).not.toEqual(creatureBarOf(3, 1, 1).frame);
  });
});
