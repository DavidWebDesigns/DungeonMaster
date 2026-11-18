/**
 * Generador con semilla mulberry32. Toda la aleatoriedad de una partida pasa por aquí.
 * El estado es un solo entero (`rng` en MatchState), así que se serializa y se hashea con el resto.
 */
export interface RngHolder {
  rng: number;
}

/** Normaliza cualquier número a un estado de 32 bits. */
export function seedToState(seed: number): number {
  return seed | 0;
}

/** Siguiente número en [0, 1). Avanza el estado. */
export function nextFloat(holder: RngHolder): number {
  const a = (holder.rng + 0x6d2b79f5) | 0;
  holder.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Entero en [0, maxExclusive). */
export function nextInt(holder: RngHolder, maxExclusive: number): number {
  return Math.floor(nextFloat(holder) * maxExclusive);
}

/** Baraja una copia (Fisher-Yates) sin tocar el original. */
export function shuffled<T>(holder: RngHolder, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(holder, i + 1);
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}
