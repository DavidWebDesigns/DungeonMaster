/**
 * Aspecto de cada criatura (placeholders por rol, sin modelos 3D todavía): color, tamaño, icono de ánimo
 * y barra de vida. Puro y probado.
 */
import type { Creature, Imp } from '@dm/shared';
import { playerColor, type RGB } from './palette';
import { UNIT_SCALE } from './scale';

export interface CreatureLook {
  color: RGB;
  radius: number;
  height: number;
}

/** Placeholders por tipo. El Imp mide 0,22 de ancho; las criaturas son más grandes cuanto más fuertes. */
export const CREATURE_LOOKS: Readonly<Record<string, CreatureLook>> = {
  goblin: { color: [0.35, 0.75, 0.3], radius: 0.17 * UNIT_SCALE, height: 0.62 * UNIT_SCALE },
  troll: { color: [0.55, 0.55, 0.62], radius: 0.26 * UNIT_SCALE, height: 0.9 * UNIT_SCALE },
  warlock: { color: [0.55, 0.4, 0.9], radius: 0.18 * UNIT_SCALE, height: 0.8 * UNIT_SCALE },
  bileDemon: { color: [0.62, 0.7, 0.2], radius: 0.36 * UNIT_SCALE, height: 1.05 * UNIT_SCALE },
  executioner: { color: [0.25, 0.22, 0.28], radius: 0.3 * UNIT_SCALE, height: 0.95 * UNIT_SCALE },
  torturer: { color: [0.8, 0.35, 0.55], radius: 0.18 * UNIT_SCALE, height: 0.7 * UNIT_SCALE },
  salamander: { color: [0.95, 0.5, 0.15], radius: 0.2 * UNIT_SCALE, height: 0.6 * UNIT_SCALE },
  skeleton: { color: [0.88, 0.86, 0.78], radius: 0.17 * UNIT_SCALE, height: 0.85 * UNIT_SCALE },
  witch: { color: [0.45, 0.2, 0.6], radius: 0.17 * UNIT_SCALE, height: 0.78 * UNIT_SCALE },
  vampire: { color: [0.5, 0.08, 0.15], radius: 0.19 * UNIT_SCALE, height: 0.9 * UNIT_SCALE },
  darkKnight: { color: [0.2, 0.22, 0.3], radius: 0.3 * UNIT_SCALE, height: 1.0 * UNIT_SCALE },
  bandit: { color: [0.58, 0.38, 0.2], radius: 0.17 * UNIT_SCALE, height: 0.72 * UNIT_SCALE },
  assassin: { color: [0.16, 0.12, 0.22], radius: 0.19 * UNIT_SCALE, height: 0.95 * UNIT_SCALE },
  fallenAngel: { color: [0.75, 0.72, 0.85], radius: 0.24 * UNIT_SCALE, height: 1.15 * UNIT_SCALE },
};

const FALLBACK: CreatureLook = {
  color: [0.9, 0.9, 0.9],
  radius: 0.2 * UNIT_SCALE,
  height: 0.6 * UNIT_SCALE,
};

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
    case 'piglet':
      return 'Va a por un cerdito';
    case 'casino':
      return c.mode === 'acting' ? 'En el Casino' : 'Va al Casino';
    case 'wander':
      return 'Paseando';
    default:
      return 'Descansando';
  }
}

/** Lo que hace un Imp, en palabras para la tarjeta al pasar el cursor. */
export function impActivityLabel(
  imp: Pick<Imp, 'held' | 'goal' | 'mode' | 'loafUntil' | 'carry'>,
  tick: number,
): string {
  if (imp.held) return 'En tu mano';
  if (imp.loafUntil > tick) return 'Holgazaneando';
  if (imp.goal === 'haul') return 'Lleva oro a la Tesorería';
  if (imp.goal === 'task') return imp.mode === 'working' ? 'Trabajando' : 'Va a trabajar';
  return 'Libre';
}

/** Aspecto de cada trampa (placeholder: una figura pequeña sobre el tile). */
export interface TrapLook {
  color: RGB;
  shape: 'spikes' | 'barrel' | 'slab';
}

export const TRAP_LOOKS: Readonly<Record<string, TrapLook>> = {
  spikeTrap: { color: [0.75, 0.75, 0.8], shape: 'spikes' },
  boulderTrap: { color: [0.5, 0.45, 0.4], shape: 'barrel' },
  crushingWalls: { color: [0.4, 0.4, 0.45], shape: 'spikes' },
  frostTrap: { color: [0.55, 0.85, 1], shape: 'spikes' },
  fireTrap: { color: [0.95, 0.4, 0.1], shape: 'barrel' },
  lightningTrap: { color: [0.95, 0.9, 0.3], shape: 'barrel' },
  basicDoor: { color: [0.55, 0.38, 0.2], shape: 'slab' },
  reinforcedDoor: { color: [0.42, 0.45, 0.55], shape: 'slab' },
};

export const trapLookOf = (id: string): TrapLook =>
  TRAP_LOOKS[id] ?? { color: [0.9, 0.9, 0.2], shape: 'spikes' };

export interface OwnerMark {
  /** Se dibuja el símbolo sobre la barra de vida. */
  show: boolean;
  /** Color del dueño (el símbolo es el mismo para todos los rivales; el color dice de quién es). */
  color: RGB;
}

export interface CreatureBar {
  /** Se dibuja la barra de vida. */
  show: boolean;
  /** Color del marco de la barra (el del jugador dueño); `null` = sin marco. */
  frame: RGB | null;
}

/**
 * Barra de vida de una criatura: las propias solo la enseñan si están heridas y sin marco; las enemigas la llevan siempre,
 * con un marco del color del jugador al que pertenecen, para saber de quién es de un vistazo.
 */
export function creatureBarOf(owner: number, localPlayer: number, hpFrac: number): CreatureBar {
  const enemy = owner !== localPlayer;
  return { show: enemy || hpFrac < 1, frame: enemy ? playerColor(owner) : null };
}

/** Símbolo distintivo de las unidades enemigas: solo las que no son del jugador local. */
export function ownerMarkOf(owner: number, localPlayer: number): OwnerMark {
  return { show: owner !== localPlayer, color: playerColor(owner) };
}
