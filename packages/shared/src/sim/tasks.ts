import { inBounds, neighbors4, octile, tileIndex } from './grid';
import { doorBlocks, syncDoors } from './doors';
import { maxRoomLevel, removeRoomTile } from './rooms';
import { isVeinTerrain, type Rules } from './rules';
import type { Imp, MatchState, PlayerId, SimEvent, Task, TaskKind } from './types';

/** Prioridad de cada tipo de tarea (menor = antes). Sección 6.13: minar/excavar > reclamar > reforzar > reclamar cerca. */
export function taskPriority(task: Task): number {
  if (task.auto) return 4;
  switch (task.kind) {
    case 'dig':
      return 0;
    case 'claim':
      return 1;
    case 'buildTrap':
    case 'repairTrap':
      return 2;
    case 'reinforce':
      return 3;
  }
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
  // Un muro reforzado ajeno también se puede excavar, pero despacio (su `digSeconds` es largo). Lo demás ajeno, no.
  return owner === 0 || owner === player || isWall(def);
}

/** Muro con dueño (reforzado): no caminable y con dueño posible. */
const isWall = (def: { walkable: boolean; ownable: boolean }): boolean =>
  !def.walkable && def.ownable;

/** ¿Se puede reclamar este tile? Suelo sin dueño, o suelo enemigo sin sala protegida (Corazón, Portal). */
export function canClaim(state: MatchState, rules: Rules, tile: number, player: PlayerId): boolean {
  const def = rules.terrain[state.terrain[tile] as number];
  if (!def) return false;
  const owner = state.owner[tile] as number;
  if (owner === player) return false;
  if (owner === 0) return def.becomesOnClaim !== undefined;
  if (!def.walkable || !def.ownable) return false;
  // Con una puerta enemiga construida encima no se reclama: hay que romperla primero.
  if (doorBlocks(state, tile, player)) return false;
  const roomId = state.roomAt[tile] as number;
  if (!roomId) return true;
  const room = state.rooms.find((r) => r.id === roomId);
  return room ? rules.roomDefs[room.type]?.buildable === true : true;
}

/** Nivel de muro al que llevaría reforzar este tile (0 si no se puede reforzar). */
export function reinforceLevelOf(rules: Rules, tile: number, state: MatchState): number {
  const def = rules.terrain[state.terrain[tile] as number];
  if (!def?.reinforceable || def.becomesOnReinforce === undefined) return 0;
  const target = rules.terrain[rules.terrainIndex[def.becomesOnReinforce] as number];
  return target?.wallLevel ?? 0;
}

/** ¿Cumple el jugador la sala que pide este terreno para reforzarlo (por ejemplo, un Taller de nivel 10)? */
export function reinforceRoomMet(
  state: MatchState,
  rules: Rules,
  tile: number,
  player: PlayerId,
): boolean {
  const req = rules.terrain[state.terrain[tile] as number]?.reinforceRequires;
  return req === undefined || maxRoomLevel(state, player, req.room) >= req.minLevel;
}

/**
 * Forma del refuerzo sin mirar las salas: el terreno se puede reforzar, el tile es nuestro o de nadie (un muro ya
 * reforzado solo se mejora si es propio), toca suelo propio y, si se pide, lleva al muro de ese nivel.
 */
export function canReinforceShape(
  state: MatchState,
  rules: Rules,
  tile: number,
  player: PlayerId,
  level?: number,
): boolean {
  const def = rules.terrain[state.terrain[tile] as number];
  if (!def?.reinforceable) return false;
  const owner = state.owner[tile] as number;
  if (isWall(def) ? owner !== player : owner !== 0) return false;
  if (level !== undefined && reinforceLevelOf(rules, tile, state) !== level) return false;
  return hasOwnNeighbor(state, rules, tile, player);
}

export function canReinforce(
  state: MatchState,
  rules: Rules,
  tile: number,
  player: PlayerId,
  level?: number,
): boolean {
  return (
    canReinforceShape(state, rules, tile, player, level) &&
    reinforceRoomMet(state, rules, tile, player)
  );
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
    case 'buildTrap':
      // La trampa sigue en pie sin terminar y el suelo sigue siendo del dueño.
      return (
        state.traps.some((t) => t.tile === task.tile && t.owner === task.owner && !t.built) &&
        isOwnGround(state, rules, task.tile, task.owner)
      );
    case 'repairTrap': {
      // La trampa sigue en pie, construida, dañada y en suelo propio.
      const trap = state.traps.find((t) => t.tile === task.tile && t.owner === task.owner);
      const max = rules.data.traps.find((d) => d.id === trap?.type)?.hp ?? 0;
      return (
        !!trap && trap.built && trap.hp < max && isOwnGround(state, rules, task.tile, task.owner)
      );
    }
  }
}

/** Una tarea de excavar sobre una veta es minar: se extrae oro en vez de esperar un tiempo fijo. */
export function isMining(state: MatchState, rules: Rules, task: Task): boolean {
  return task.kind === 'dig' && isVeinTerrain(rules.terrain[state.terrain[task.tile] as number]);
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
      return (
        rules.terrain[state.terrain[task.tile] as number]?.reinforceSeconds ?? w.reinforceSeconds
      );
    case 'buildTrap': {
      const trap = state.traps.find((t) => t.tile === task.tile && t.owner === task.owner);
      return rules.data.traps.find((d) => d.id === trap?.type)?.buildSeconds ?? 0;
    }
    case 'repairTrap': {
      // Reparar va por velocidad (vida por segundo): esto es solo lo que falta a ritmo normal.
      const trap = state.traps.find((t) => t.tile === task.tile && t.owner === task.owner);
      const max = rules.data.traps.find((d) => d.id === trap?.type)?.hp ?? 0;
      return Math.max(0, max - (trap?.hp ?? max)) / w.trapRepairHpPerSecond;
    }
  }
}

/** Tiles desde los que se puede trabajar la tarea: el propio tile (reclamar) o sus vecinos caminables. */
export function workTiles(state: MatchState, rules: Rules, task: Task): number[] {
  if (task.kind === 'claim' || task.kind === 'buildTrap' || task.kind === 'repairTrap')
    return [task.tile];
  return neighbors4(state, task.tile).filter(
    (n) => rules.walkable[state.terrain[n] as number] && !doorBlocks(state, n, task.owner),
  );
}

/** Aplica el resultado de una tarea terminada y la retira. */
export function completeTask(
  state: MatchState,
  rules: Rules,
  task: Task,
  events: SimEvent[],
): void {
  const i = task.tile;
  if (task.kind === 'repairTrap') {
    // Reparar no toca el terreno: al terminar (vida completa) la tarea simplemente se retira.
    removeTask(state, task.id);
    return;
  }
  if (task.kind === 'buildTrap') {
    // Una trampa terminada no cambia el terreno ni las rutas: solo queda armada.
    const trap = state.traps.find((t) => t.tile === i && t.owner === task.owner);
    if (trap) {
      trap.built = true;
      syncDoors(state, rules); // una puerta terminada cambia las rutas
      events.push({
        type: 'trapBuilt',
        playerId: task.owner,
        trapId: trap.id,
        trap: trap.type,
        tile: i,
      });
    }
    removeTask(state, task.id);
    return;
  }
  const def = rules.terrain[state.terrain[i] as number];
  const becomes = (id: string | undefined) =>
    id === undefined ? undefined : rules.terrainIndex[id];
  if (def) {
    if (task.kind === 'dig') {
      const t = becomes(def.becomesOnDig);
      const previousOwner = state.owner[i] as number;
      if (t !== undefined) state.terrain[i] = t;
      // Derribar el muro de otro: su dueño se entera (aunque no lo vea).
      if (previousOwner !== 0 && previousOwner !== task.owner)
        events.push({ type: 'wallBreached', playerId: previousOwner, tile: i });
      state.owner[i] = 0;
      state.goldLeft[i] = 0;
    } else if (task.kind === 'claim') {
      if (state.owner[i] !== 0) removeRoomTile(state, rules, i);
      // Quien reclama un suelo enemigo se queda sin las trampas que había en él.
      state.traps = state.traps.filter((tr) => tr.tile !== i);
      syncDoors(state, rules);
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
