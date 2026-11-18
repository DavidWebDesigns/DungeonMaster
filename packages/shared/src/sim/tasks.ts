import { inBounds, neighbors4, octile, tileIndex } from './grid';
import { removeRoomTile } from './rooms';
import type { Rules } from './rules';
import type { Imp, MatchState, PlayerId, SimEvent, Task, TaskKind } from './types';

/** Prioridad de cada tipo de tarea (menor = antes). Sección 6.13: minar/excavar > reclamar > reforzar > reclamar cerca. */
export function taskPriority(task: Task): number {
  if (task.auto) return 3;
  return task.kind === 'dig' ? 0 : task.kind === 'claim' ? 1 : 2;
}

export function getTask(state: MatchState, id: number): Task | undefined {
  let lo = 0;
  let hi = state.tasks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = state.tasks[mid] as Task;
    if (t.id === id) return t;
    if (t.id < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

export function removeTask(state: MatchState, id: number): void {
  state.tasks = state.tasks.filter((t) => t.id !== id);
}

/** Suelo propio: caminable y con dueño igual al jugador. */
export function isOwnGround(
  state: MatchState,
  rules: Rules,
  tile: number,
  player: PlayerId,
): boolean {
  return state.owner[tile] === player && rules.walkable[state.terrain[tile] as number] === true;
}

function hasOwnNeighbor(state: MatchState, rules: Rules, tile: number, player: PlayerId): boolean {
  return neighbors4(state, tile).some((n) => isOwnGround(state, rules, n, player));
}

/** ¿Se puede excavar este tile (marcarlo para minar)? */
export function canDig(state: MatchState, rules: Rules, tile: number, player: PlayerId): boolean {
  const def = rules.terrain[state.terrain[tile] as number];
  if (!def?.diggable) return false;
  const owner = state.owner[tile] as number;
  return owner === 0 || owner === player;
}

/** ¿Se puede reclamar este tile? Suelo sin dueño, o suelo enemigo sin sala protegida (Corazón, Portal). */
export function canClaim(state: MatchState, rules: Rules, tile: number, player: PlayerId): boolean {
  const def = rules.terrain[state.terrain[tile] as number];
  if (!def) return false;
  const owner = state.owner[tile] as number;
  if (owner === player) return false;
  if (owner === 0) return def.becomesOnClaim !== undefined;
  if (!def.walkable || !def.ownable) return false;
  const roomId = state.roomAt[tile] as number;
  if (!roomId) return true;
  const room = state.rooms.find((r) => r.id === roomId);
  return room ? rules.roomDefs[room.type]?.buildable === true : true;
}

export function canReinforce(
  state: MatchState,
  rules: Rules,
  tile: number,
  player: PlayerId,
): boolean {
  const def = rules.terrain[state.terrain[tile] as number];
  if (!def?.reinforceable || state.owner[tile] !== 0) return false;
  return hasOwnNeighbor(state, rules, tile, player);
}

/** Crea o sustituye la tarea de un tile (una tarea por tile y jugador; gana la última orden). */
export function setTask(
  state: MatchState,
  owner: PlayerId,
  kind: TaskKind,
  tile: number,
  auto = false,
  reservedBy = 0,
): Task {
  const existing = state.tasks.find((t) => t.owner === owner && t.tile === tile);
  if (existing && existing.kind === kind && !existing.auto) return existing;
  if (existing) removeTask(state, existing.id);
  const task: Task = {
    id: state.nextTaskId++,
    owner,
    kind,
    tile,
    reservedBy,
    blockedVersion: -1,
    auto,
  };
  state.tasks.push(task);
  return task;
}

export function isTaskValid(state: MatchState, rules: Rules, task: Task): boolean {
  switch (task.kind) {
    case 'dig':
      return canDig(state, rules, task.tile, task.owner);
    case 'claim':
      return canClaim(state, rules, task.tile, task.owner);
    case 'reinforce':
      return canReinforce(state, rules, task.tile, task.owner);
  }
}

/** Una tarea de excavar sobre una veta es minar: se extrae oro en vez de esperar un tiempo fijo. */
export function isMining(state: MatchState, rules: Rules, task: Task): boolean {
  return (
    task.kind === 'dig' &&
    rules.terrain[state.terrain[task.tile] as number]?.goldPerTile !== undefined
  );
}

/** Segundos de trabajo para tareas con duración fija. */
export function taskSeconds(state: MatchState, rules: Rules, task: Task): number {
  const w = rules.data.global.work;
  switch (task.kind) {
    case 'dig':
      return rules.terrain[state.terrain[task.tile] as number]?.digSeconds ?? 0;
    case 'claim':
      return state.owner[task.tile] === 0 ? w.claimSeconds : w.enemyClaimSeconds;
    case 'reinforce':
      return w.reinforceSeconds;
  }
}

/** Tiles desde los que se puede trabajar la tarea: el propio tile (reclamar) o sus vecinos caminables. */
export function workTiles(state: MatchState, rules: Rules, task: Task): number[] {
  if (task.kind === 'claim') return [task.tile];
  return neighbors4(state, task.tile).filter((n) => rules.walkable[state.terrain[n] as number]);
}

/** Aplica el resultado de una tarea terminada y la retira. */
export function completeTask(
  state: MatchState,
  rules: Rules,
  task: Task,
  events: SimEvent[],
): void {
  const i = task.tile;
  const def = rules.terrain[state.terrain[i] as number];
  const becomes = (id: string | undefined) =>
    id === undefined ? undefined : rules.terrainIndex[id];
  if (def) {
    if (task.kind === 'dig') {
      const t = becomes(def.becomesOnDig);
      if (t !== undefined) state.terrain[i] = t;
      state.owner[i] = 0;
      state.goldLeft[i] = 0;
    } else if (task.kind === 'claim') {
      if (state.owner[i] !== 0) removeRoomTile(state, rules, i);
      const t = becomes(def.becomesOnClaim);
      if (t !== undefined) state.terrain[i] = t;
      state.owner[i] = task.owner;
    } else {
      const t = becomes(def.becomesOnReinforce);
      if (t !== undefined) state.terrain[i] = t;
      state.owner[i] = task.owner;
    }
  }
  state.mapVersion++;
  events.push({ type: 'tileChanged', tile: i });
  removeTask(state, task.id);
}

/**
 * Para un Imp ocioso: el suelo sin dueño más cercano pegado a territorio propio (dentro del radio de
 * work.autoClaimRadius) que nadie tiene ya como tarea.
 */
export function findAutoClaimTile(state: MatchState, rules: Rules, imp: Imp): number | null {
  const radius = rules.data.global.work.autoClaimRadius;
  const cx = Math.floor(imp.x);
  const cy = Math.floor(imp.y);
  const taken = new Set<number>();
  for (const t of state.tasks) if (t.owner === imp.owner) taken.add(t.tile);
  const { straightCost, diagonalCost } = rules.data.global.pathfinding;
  const here = tileIndex(state, cx, cy);
  let best = -1;
  let bestD = Infinity;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (!inBounds(state, x, y)) continue;
      const i = tileIndex(state, x, y);
      if (state.owner[i] !== 0 || taken.has(i)) continue;
      if (rules.terrain[state.terrain[i] as number]?.becomesOnClaim === undefined) continue;
      if (!hasOwnNeighbor(state, rules, i, imp.owner)) continue;
      const d = octile(state, here, i, straightCost, diagonalCost);
      if (d < bestD || (d === bestD && i < best)) {
        best = i;
        bestD = d;
      }
    }
  }
  return best < 0 ? null : best;
}
