import type { DataSet } from '@dm/shared';
import type { Tool } from './inputModel';

export type KeyAction =
  | { type: 'tool'; tool: Tool }
  | { type: 'rotate'; step: 1 | -1 }
  | { type: 'center' }
  | { type: 'cancel' };

/**
 * Atajos (docs/PLAN.md 10.2): 1 a 5 construyen salas, Q lanza Crear Imp, Espacio centra en el Corazón.
 * F refuerza, C reclama, U deshace marcas, Supr vende, Esc vuelve a excavar, Z y X giran la cámara
 * (Q W E R T quedan para hechizos). Las flechas y WASD mueven la cámara y no pasan por aquí.
 */
export function keyAction(key: string, data: DataSet): KeyAction | null {
  const buildable = data.rooms.filter((r) => r.buildable);
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (/^[1-9]$/.test(k)) {
    const room = buildable[Number(k) - 1];
    return room ? { type: 'tool', tool: { kind: 'build', room: room.id } } : null;
  }
  switch (k) {
    case 'q':
      return { type: 'tool', tool: { kind: 'spell', spell: 'createImp' } };
    case 'f':
      return { type: 'tool', tool: { kind: 'reinforce' } };
    case 'c':
      return { type: 'tool', tool: { kind: 'claim' } };
    case 'u':
      return { type: 'tool', tool: { kind: 'cancelDig' } };
    case 'Delete':
      return { type: 'tool', tool: { kind: 'sell' } };
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
