/**
 * Aspecto de cada criatura (placeholders por rol, sin modelos 3D todavía): color, tamaño, icono de ánimo
 * y barra de vida. Puro y probado.
 */
import type { Creature } from '@dm/shared';
import type { RGB } from './palette';

export interface CreatureLook {
  color: RGB;
  radius: number;
  height: number;
}

/** Placeholders por tipo. El Imp mide 0,22 de ancho; las criaturas son más grandes cuanto más fuertes. */
export const CREATURE_LOOKS: Readonly<Record<string, CreatureLook>> = {
  goblin: { color: [0.35, 0.75, 0.3], radius: 0.17, height: 0.62 },
  troll: { color: [0.55, 0.55, 0.62], radius: 0.26, height: 0.9 },
  warlock: { color: [0.55, 0.4, 0.9], radius: 0.18, height: 0.8 },
  bileDemon: { color: [0.62, 0.7, 0.2], radius: 0.36, height: 1.05 },
};

const FALLBACK: CreatureLook = { color: [0.9, 0.9, 0.9], radius: 0.2, height: 0.6 };

export const lookOf = (type: string): CreatureLook => CREATURE_LOOKS[type] ?? FALLBACK;

export interface MoodIcon {
  /** Texto corto para la lista (también sirve de leyenda). */
  glyph: string;
  color: RGB;
  /** Si se dibuja una bolita sobre la cabeza (en Neutral no, para no llenar la pantalla). */
  showOverHead: boolean;
}

export const MOOD_ICONS: Readonly<Record<string, MoodIcon>> = {
  radiant: { glyph: '★', color: [1, 0.85, 0.2], showOverHead: true },
  happy: { glyph: '☺', color: [0.4, 0.9, 0.4], showOverHead: true },
  neutral: { glyph: '●', color: [0.75, 0.75, 0.75], showOverHead: false },
  unhappy: { glyph: '☹', color: [1, 0.85, 0.3], showOverHead: true },
  angry: { glyph: '☠', color: [1, 0.5, 0.15], showOverHead: true },
  furious: { glyph: '⚡', color: [1, 0.15, 0.15], showOverHead: true },
};

export const moodIconOf = (band: string): MoodIcon =>
  MOOD_ICONS[band] ?? (MOOD_ICONS['neutral'] as MoodIcon);

/** Fracción de vida de 0 a 1. */
export function hpFraction(c: Pick<Creature, 'hp'>, maxHp: number): number {
  return maxHp > 0 ? Math.max(0, Math.min(1, c.hp / maxHp)) : 0;
}

/** Color de la barra de vida: verde, amarillo o rojo según lo que quede. */
export function hpColor(fraction: number): RGB {
  if (fraction > 0.6) return [0.3, 0.85, 0.3];
  if (fraction > 0.25) return [0.95, 0.8, 0.2];
  return [0.9, 0.2, 0.2];
}

/** Lo que está haciendo la criatura, en palabras para la lista. */
export function activityLabel(c: Pick<Creature, 'held' | 'goal' | 'mode'>): string {
  if (c.held) return 'En tu mano';
  switch (c.goal) {
    case 'portal':
      return c.mode === 'acting' ? 'Junto al Portal' : 'Va al Portal';
    case 'hatchery':
      return 'Va a comer';
    case 'bed':
      return c.mode === 'acting' ? 'Durmiendo' : 'Va a su cama';
    case 'treasury':
      return 'Va a cobrar';
    case 'training':
      return c.mode === 'acting' ? 'Entrenando' : 'Va a entrenar';
    case 'wander':
      return 'Paseando';
    default:
      return 'Descansando';
  }
}
