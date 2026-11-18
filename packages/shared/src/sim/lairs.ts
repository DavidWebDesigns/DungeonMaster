import { neighbors4 } from './grid';
import type { Rules } from './rules';
import type { Creature, MatchState, PlayerId } from './types';

/** Tiles de Guarida del jugador que ninguna criatura ocupa. */
export function freeLairTiles(state: MatchState, rules: Rules, owner: PlayerId): number[] {
  const taken = new Set<number>();
  for (const c of state.creatures) for (const t of c.beds) taken.add(t);
  const out: number[] = [];
  for (const room of state.rooms) {
    if (room.owner !== owner || room.type !== 'lair') continue;
    for (const t of room.tiles) if (!taken.has(t)) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Busca `size` tiles libres de Guarida (1 para casi todos, 2 contiguos para el Demonio de bilis).
 * Devuelve el más cercano a `near` si se indica (o el de menor índice), o null si no hay hueco.
 */
export function findBed(
  state: MatchState,
  rules: Rules,
  owner: PlayerId,
  size: number,
  near?: number,
): number[] | null {
  if (size <= 0) return [];
  const free = freeLairTiles(state, rules, owner);
  const freeSet = new Set(free);
  const dist = (t: number) =>
    near === undefined
      ? 0
      : Math.abs((t % state.width) - (near % state.width)) +
        Math.abs(Math.floor(t / state.width) - Math.floor(near / state.width));
  const candidates: number[][] = [];
  for (const t of free) {
    if (size === 1) {
      candidates.push([t]);
    } else {
      // Dos tiles contiguos de la misma sala.
      const next = neighbors4(state, t).find(
        (n) => n > t && freeSet.has(n) && state.roomAt[n] === state.roomAt[t],
      );
      if (next !== undefined) candidates.push([t, next]);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => dist(a[0] as number) - dist(b[0] as number) || (a[0] as number) - (b[0] as number),
  );
  return candidates[0] as number[];
}

/** Da cama a una criatura que no tiene. Devuelve si ahora la tiene. */
export function assignBed(state: MatchState, rules: Rules, c: Creature): boolean {
  if (c.beds.length > 0) return true;
  const def = rules.creatureDefs[c.type];
  if (!def || def.base.lairTiles === 0) return true;
  const bed = findBed(
    state,
    rules,
    c.owner,
    def.base.lairTiles,
    Math.floor(c.y) * state.width + Math.floor(c.x),
  );
  if (!bed) return false;
  c.beds = bed;
  return true;
}
