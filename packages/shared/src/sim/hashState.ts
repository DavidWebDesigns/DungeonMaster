import type { MatchState } from './types';

/** Serialización canónica: claves de objeto ordenadas, para que el orden de creación no importe. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

/** FNV-1a de 32 bits sobre el texto, en hexadecimal. Sin dependencias de Node. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Huella del estado de la partida. Misma semilla + mismos comandos ⇒ misma huella. El registro de comandos no cuenta. */
export function hashState(state: MatchState): string {
  return fnv1a(canonical({ ...state, log: [] }));
}
