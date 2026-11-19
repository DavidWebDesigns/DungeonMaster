const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Código de sala de 6 letras (sin las que se confunden: I y O). El azar se pasa de fuera (la lógica compartida no usa Math.random) para poder probarlo. */
export function generateCode(random: () => number, length = 6): string {
  let s = '';
  for (let i = 0; i < length; i++) s += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return s;
}

/** Limpia lo que escribe el jugador: mayúsculas, solo letras, 6 como máximo. */
export const normalizeCode = (raw: unknown): string =>
  typeof raw === 'string'
    ? raw
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 6)
    : '';
