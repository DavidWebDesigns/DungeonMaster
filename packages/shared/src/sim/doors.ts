/**
 * Puertas: una puerta construida deja pasar a su dueño y bloquea a los demás. Para que las rutas lo sepan sin buscar
 * en la lista de trampas (se pregunta por cada tile vecino de cada búsqueda), el estado guarda `doorAt`: el dueño de la
 * puerta construida que hay en cada tile (0 si no hay ninguna). `syncDoors` lo recalcula desde las trampas y sube
 * `mapVersion` si cambió, para que todo el mundo recalcule sus rutas.
 */
import type { Rules } from './rules';
import type { MatchState, PlayerId, Trap } from './types';

/** ¿Es esta trampa una puerta? */
export function isDoorTrap(rules: Rules, trap: Pick<Trap, 'type'>): boolean {
  return rules.data.traps.some((d) => d.id === trap.type && d.family === 'door');
}

/** Recalcula `state.doorAt` a partir de las trampas. Devuelve si cambió (y entonces sube `mapVersion`). */
export function syncDoors(state: MatchState, rules: Rules): boolean {
  const want = new Map<number, number>();
  for (const trap of state.traps)
    if (trap.built && isDoorTrap(rules, trap)) want.set(trap.tile, trap.owner);
  let changed = false;
  for (let i = 0; i < state.doorAt.length; i++) {
    const owner = want.get(i) ?? 0;
    if (state.doorAt[i] !== owner) {
      state.doorAt[i] = owner;
      changed = true;
    }
  }
  if (changed) state.mapVersion++;
  return changed;
}

/** ¿Hay una puerta ajena que impida pisar este tile a un jugador? (Una puerta propia deja pasar.) */
export function doorBlocks(state: MatchState, tile: number, owner: PlayerId): boolean {
  const d = state.doorAt[tile] as number;
  return d !== 0 && d !== owner;
}
