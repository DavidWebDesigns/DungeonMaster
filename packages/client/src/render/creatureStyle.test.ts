import { describe, expect, it } from 'vitest';
import {
  activityLabel,
  CREATURE_LOOKS,
  hpColor,
  hpFraction,
  moodCloudOf,
  lookOf,
  MOOD_ICONS,
  moodIconOf,
} from './creatureStyle';
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
