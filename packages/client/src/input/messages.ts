import type { ErrorCode } from '@dm/shared';

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
  REQUIRES_ROOM: 'Te falta construir la sala que pide esta trampa (la Cámara de tortura).',
};

export function errorMessage(code: ErrorCode): string {
  return MESSAGES[code];
}
