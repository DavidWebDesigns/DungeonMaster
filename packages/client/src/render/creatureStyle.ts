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
  executioner: { color: [0.25, 0.22, 0.28], radius: 0.3, height: 0.95 },
  torturer: { color: [0.8, 0.35, 0.55], radius: 0.18, height: 0.7 },
  salamander: { color: [0.95, 0.5, 0.15], radius: 0.2, height: 0.6 },
  skeleton: { color: [0.88, 0.86, 0.78], radius: 0.17, height: 0.85 },
  witch: { color: [0.45, 0.2, 0.6], radius: 0.17, height: 0.78 },
  vampire: { color: [0.5, 0.08, 0.15], radius: 0.19, height: 0.9 },
  darkKnight: { color: [0.2, 0.22, 0.3], radius: 0.3, height: 1.0 },
  fallenAngel: { color: [0.75, 0.72, 0.85], radius: 0.24, height: 1.15 },
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

export interface MoodCloud {
  color: RGB;
  /** Escala de la bolita: las nubes son anchas y bajas. */
  scale: { x: number; y: number };
}

/**
 * Cómo se ve la marca de ánimo sobre la cabeza. Enfadada: nube de tormenta gris oscura; furiosa: la nube relampaguea
 * (alterna con un destello amarillo). Los demás ánimos son la bolita de siempre. `timeSeconds` es solo de dibujo.
 */
export function moodCloudOf(band: string, timeSeconds: number): MoodCloud {
  const icon = moodIconOf(band);
  if (band === 'angry') return { color: [0.35, 0.33, 0.4], scale: { x: 1.9, y: 1 } };
  if (band === 'furious') {
    // Destello de unos 0,15 s cada 0,9 s.
    const flash = timeSeconds % 0.9 < 0.15;
    return flash
      ? { color: [1, 0.95, 0.35], scale: { x: 2.2, y: 1.2 } }
      : { color: [0.22, 0.2, 0.28], scale: { x: 2.2, y: 1.2 } };
  }
  return { color: icon.color, scale: { x: 1, y: 1 } };
}

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

/** Aspecto de cada trampa (placeholder: una figura pequeña sobre el tile). */
export interface TrapLook {
  color: RGB;
  shape: 'spikes' | 'barrel';
}

export const TRAP_LOOKS: Readonly<Record<string, TrapLook>> = {
  spikeTrap: { color: [0.75, 0.75, 0.8], shape: 'spikes' },
  blastTrap: { color: [0.85, 0.3, 0.15], shape: 'barrel' },
};

export const trapLookOf = (id: string): TrapLook =>
  TRAP_LOOKS[id] ?? { color: [0.9, 0.9, 0.2], shape: 'spikes' };
