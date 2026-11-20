import {
  missingRooms,
  type Command,
  type DataSet,
  type ErrorCode,
  type MatchState,
} from '@dm/shared';

/** Texto del consejero para cada código de error de la simulación. */
const MESSAGES: Readonly<Record<ErrorCode, string>> = {
  NO_GOLD: 'No tienes oro suficiente.',
  NO_MANA: 'No tienes maná suficiente.',
  INVALID_TARGET: 'No se puede hacer eso ahí.',
  OUT_OF_RANGE: 'Está demasiado lejos.',
  COOLDOWN: 'Aún no está listo.',
  NOT_OWNER: 'Eso no te pertenece.',
  RATE_LIMIT: 'Vas demasiado rápido.',
  LIMIT_REACHED: 'Has alcanzado el máximo.',
  INVALID_COMMAND: 'Esa orden no es válida.',
  REQUIRES_ROOM: 'Te falta construir una sala que esto necesita.',
};

/** Qué orden falló y en qué partida, para que el mensaje pueda nombrar lo que falta. */
export interface ErrorContext {
  cmd: Command;
  data: DataSet;
  state: MatchState;
  player: number;
}

function listNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '');
}

/**
 * Texto del consejero para un error. Con contexto, `REQUIRES_ROOM` nombra las salas que faltan
 * ("Te falta construir: Taller y Biblioteca.") sacándolas de los datos de la sala o la trampa que se intentaba.
 */
export function errorMessage(code: ErrorCode, ctx?: ErrorContext): string {
  if (code === 'REQUIRES_ROOM' && ctx) {
    const { cmd, data, state, player } = ctx;
    const required =
      cmd.type === 'buildRoom'
        ? data.rooms.find((r) => r.id === cmd.room)?.requiresRooms
        : cmd.type === 'buildTrap'
          ? [data.traps.find((t) => t.id === cmd.trap)?.requiresRoom ?? '']
          : undefined;
    const names = missingRooms(state, player, required).map(
      (id) => data.rooms.find((r) => r.id === id)?.name ?? id,
    );
    if (names.length > 0) return `Te falta construir: ${listNames(names)}.`;
  }
  return MESSAGES[code];
}
