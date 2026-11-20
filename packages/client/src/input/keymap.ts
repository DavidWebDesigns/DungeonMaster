import type { DataSet } from '@dm/shared';
import type { Tool } from './inputModel';

export type KeyAction =
  | { type: 'tool'; tool: Tool }
  | { type: 'rotate'; step: 1 | -1 }
  | { type: 'center' }
  | { type: 'cancel' }
  | { type: 'slap' }
  | { type: 'pause' }
  | { type: 'mute' }
  | { type: 'cycleCreature'; step: 1 | -1 }
  | { type: 'debug'; what: 'resources' | 'reveal' }
  | { type: 'speed'; step: 1 | -1 };

/**
 * Atajos (docs/PLAN.md 10.2): 1 a 9 construyen salas, G H J K L N colocan trampas, Q W E R T lanzan los hechizos, Espacio centra en el Corazón.
 * Tab salta a la siguiente criatura propia. M silencia o activa el sonido. P pausa y [ ] cambian la velocidad (solo en partidas locales). F refuerza, C reclama, U deshace marcas, Supr vende, Esc vuelve a excavar, B abofetea a la criatura bajo el cursor, Z y X giran la cámara
 * (Q W E R T quedan para hechizos). Las flechas y WASD mueven la cámara y no pasan por aquí.
 */
/** Teclas de las trampas, en el orden de traps.json (las salas usan 1 a 9). */
export const TRAP_KEYS = ['G', 'H', 'J', 'K', 'L', 'N'] as const;

/** Etiqueta de la tecla de la sala número `index` (0 = la primera construible): 1 a 9. */
export const roomHotkey = (index: number): string => (index < 9 ? String(index + 1) : '');

/** Etiqueta de la tecla de la trampa número `index`. */
export const trapHotkey = (index: number): string => TRAP_KEYS[index] ?? '';

export function keyAction(key: string, data: DataSet): KeyAction | null {
  const buildable = data.rooms.filter((r) => r.buildable);
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (/^[1-9]$/.test(k)) {
    // 1 a 9: las salas construibles, en el orden de los datos.
    const room = buildable[Number(k) - 1];
    return room ? { type: 'tool', tool: { kind: 'build', room: room.id } } : null;
  }
  const trapIndex = TRAP_KEYS.findIndex((t) => t.toLowerCase() === k);
  if (trapIndex >= 0) {
    const trap = data.traps[trapIndex];
    return trap ? { type: 'tool', tool: { kind: 'trap', trap: trap.id } } : null;
  }
  switch (k) {
    case 'q':
    case 'w':
    case 'e':
    case 'r':
    case 't': {
      // Q W E R T son los cinco hechizos, en el orden de spells.json.
      const spell = data.spells['qwert'.indexOf(k)];
      return spell ? { type: 'tool', tool: { kind: 'spell', spell: spell.id } } : null;
    }
    case 'f':
      return { type: 'tool', tool: { kind: 'reinforce' } };
    case 'c':
      return { type: 'tool', tool: { kind: 'claim' } };
    case 'u':
      return { type: 'tool', tool: { kind: 'cancelDig' } };
    case 'Delete':
      return { type: 'tool', tool: { kind: 'sell' } };
    case 'b':
      return { type: 'slap' };
    case 'Escape':
      return { type: 'cancel' };
    case 'z':
      return { type: 'rotate', step: -1 };
    case 'x':
      return { type: 'rotate', step: 1 };
    case ' ':
      return { type: 'center' };
    // Solo en partidas locales (PvE): pausa y velocidad. En red el juego las ignora.
    case 'p':
      return { type: 'pause' };
    case 'm':
      return { type: 'mute' };
    case 'Tab':
      return { type: 'cycleCreature', step: 1 };
    // Trampas de pruebas (solo partidas locales): F9 recursos, F10 ver todo el mapa.
    case 'F9':
      return { type: 'debug', what: 'resources' };
    case 'F10':
      return { type: 'debug', what: 'reveal' };
    case ']':
      return { type: 'speed', step: 1 };
    case '[':
      return { type: 'speed', step: -1 };
    default:
      return null;
  }
}
