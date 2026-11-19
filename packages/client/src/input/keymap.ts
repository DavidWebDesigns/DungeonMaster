import type { DataSet } from '@dm/shared';
import type { Tool } from './inputModel';

export type KeyAction =
  | { type: 'tool'; tool: Tool }
  | { type: 'rotate'; step: 1 | -1 }
  | { type: 'center' }
  | { type: 'cancel' }
  | { type: 'slap' };

/**
 * Atajos (docs/PLAN.md 10.2): 1 a 6 construyen salas y las teclas siguientes (7 y 8) colocan trampas, Q W E R T lanzan los hechizos, Espacio centra en el Corazón.
 * F refuerza, C reclama, U deshace marcas, Supr vende, Esc vuelve a excavar, B abofetea a la criatura bajo el cursor, Z y X giran la cámara
 * (Q W E R T quedan para hechizos). Las flechas y WASD mueven la cámara y no pasan por aquí.
 */
export function keyAction(key: string, data: DataSet): KeyAction | null {
  const buildable = data.rooms.filter((r) => r.buildable);
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (/^[1-9]$/.test(k)) {
    // Primero las salas construibles y a continuación las trampas, en el orden de los datos.
    const n = Number(k) - 1;
    const room = buildable[n];
    if (room) return { type: 'tool', tool: { kind: 'build', room: room.id } };
    const trap = data.traps[n - buildable.length];
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
    default:
      return null;
  }
}
