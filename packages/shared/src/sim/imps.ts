import { doorBlocks } from './doors';
import { getPlayer, goldRoom, treasuryCapacity } from './economy';
import { octile, tileIndex, tileOfPosition, tileX, tileY } from './grid';
import { findPath } from './pathfinding';
import { nextFloat } from './rng';
import { walkDistances, type Rules } from './rules';
import {
  completeTask,
  findAutoClaimTile,
  getTask,
  isMining,
  isOwnGround,
  isTaskValid,
  removeTask,
  setTask,
  taskPriority,
  taskSeconds,
  workTiles,
} from './tasks';
import type { Imp, MatchState, PlayerId, SimEvent, Task } from './types';

const EPS = 1e-6;
/** Cada cuántos ticks un Imp ocioso busca suelo que reclamar (solo para ahorrar CPU, no afecta al diseño). */
const AUTO_CLAIM_SCAN_TICKS = 5;

/** Suelta lo que hacía el Imp y libera su tarea. Conserva el oro que lleva. */
export function resetImp(state: MatchState, imp: Imp): void {
  const task = imp.taskId ? getTask(state, imp.taskId) : undefined;
  if (task && task.reservedBy === imp.id) task.reservedBy = 0;
  imp.mode = 'idle';
  imp.goal = 'none';
  imp.taskId = 0;
  imp.path = [];
  imp.work = 0;
}

/**
 * Tras terminar una tarea o entregar oro, el Imp puede decidir holgazanear un rato: no coge trabajo y pasea despacio
 * por su territorio hasta que pase el tiempo (o lo despierten con una bofetada). Solo se sortea en estas transiciones
 * (nunca en cada tick ocioso) y con `chance` 0 no gasta números aleatorios.
 */
export function maybeLoaf(state: MatchState, rules: Rules, imp: Imp): void {
  const loaf = rules.data.global.imps.loaf;
  if (loaf.chance <= 0 || imp.carry > 0 || imp.held) return;
  if (nextFloat(state) >= loaf.chance) return;
  const seconds = loaf.minSeconds + nextFloat(state) * (loaf.maxSeconds - loaf.minSeconds);
  imp.loafUntil = state.tick + Math.max(1, Math.round(seconds * rules.data.global.tickRate));
  imp.loafTile = pickLoafTile(state, rules, imp);
  if (imp.loafTile >= 0) {
    imp.goal = 'loaf';
    imp.mode = 'needPath';
    imp.path = [];
  }
}

/** Un tile de suelo propio al azar dentro del radio de paseo (-1 si no hay ninguno). */
function pickLoafTile(state: MatchState, rules: Rules, imp: Imp): number {
  const radius = Math.floor(rules.data.economy.wanderRadius);
  const cx = Math.floor(imp.x);
  const cy = Math.floor(imp.y);
  const options: number[] = [];
  for (let y = Math.max(0, cy - radius); y <= Math.min(state.height - 1, cy + radius); y++)
    for (let x = Math.max(0, cx - radius); x <= Math.min(state.width - 1, cx + radius); x++) {
      const i = tileIndex(state, x, y);
      if (isOwnGround(state, rules, i, imp.owner) && state.roomAt[i] === 0) options.push(i);
    }
  if (options.length === 0) return -1;
  return options[Math.floor(nextFloat(state) * options.length)] as number;
}

/** ¿Está holgazaneando ahora mismo? */
export const isLoafing = (state: MatchState, imp: Imp): boolean => imp.loafUntil > state.tick;

/**
 * Una bofetada despierta al Imp: deja de holgazanear y, si está libre y sin oro, va a la tarea pendiente más cercana
 * (por camino). Si ya trabaja o va a una tarea no se le cambia nada (solo va más rápido, por `slapUntil`).
 */
export function wakeImp(state: MatchState, rules: Rules, imp: Imp): void {
  if (isLoafing(state, imp)) {
    imp.loafUntil = 0;
    imp.loafTile = -1;
    resetImp(state, imp);
  }
  if (imp.mode !== 'idle' || imp.held || imp.carry > 0) return;
  const best = nearestTaskByWalk(state, rules, imp, tileOfPosition(state, imp.x, imp.y));
  if (best) startTask(imp, best);
}

function startHaul(imp: Imp): void {
  imp.goal = 'haul';
  imp.mode = 'needPath';
  imp.path = [];
}

function startTask(imp: Imp, task: Task): void {
  task.reservedBy = imp.id;
  imp.taskId = task.id;
  imp.goal = 'task';
  imp.mode = 'needPath';
  imp.path = [];
  imp.work = 0;
}

/** Paso 3 del tick: los Imps ociosos eligen qué hacer (llevar oro > excavar/minar > reclamar > reforzar > reclamar cerca). */
export function assignTasks(state: MatchState, rules: Rules): void {
  const { straightCost, diagonalCost } = rules.data.global.pathfinding;
  const carryMax = rules.data.economy.impCarryGold;

  // Limpia tareas que ya no tienen sentido (otro jugador reclamó el tile, ya está excavado...).
  for (const t of state.tasks.slice()) {
    if (!isTaskValid(state, rules, t)) removeTask(state, t.id);
  }
  // Toda trampa propia dañada pide reparación (una tarea por tile; los Imps la atienden por prioridad).
  for (const trap of state.traps) {
    if (!trap.built || state.tasks.some((k) => k.tile === trap.tile && k.owner === trap.owner))
      continue;
    const max = rules.data.traps.find((d) => d.id === trap.type)?.hp ?? 0;
    if (trap.hp < max && state.players.some((p) => p.id === trap.owner && !p.eliminated))
      setTask(state, trap.owner, 'repairTrap', trap.tile);
  }

  for (const player of state.players) {
    if (player.eliminated) continue;
    const capacity = treasuryCapacity(state, rules, player.id);
    for (const imp of state.imps) {
      if (imp.owner !== player.id || imp.mode !== 'idle' || imp.held) continue;
      // Holgazanea: ni coge trabajo ni reclama suelo hasta que pase su tiempo (o lo abofeteen).
      if (isLoafing(state, imp)) continue;

      if (imp.carry > 0 && capacity > 0 && imp.haulBlockedVersion !== state.mapVersion) {
        startHaul(imp);
        continue;
      }

      const here = tileOfPosition(state, imp.x, imp.y);
      const hasRoom = goldRoom(state, rules, player) > EPS && imp.carry < carryMax - EPS;
      let best: Task | undefined;
      let bestKey: [number, number, number] | undefined;
      for (const t of state.tasks) {
        if (t.owner !== player.id || t.reservedBy !== 0 || t.blockedVersion === state.mapVersion)
          continue;
        if (isMining(state, rules, t) && !hasRoom) continue;
        // Sin ningún suelo caminable pegado todavía (pasillo marcado de una vez): espera su turno.
        if (workTiles(state, rules, t).length === 0) continue;
        const key: [number, number, number] = [
          taskPriority(t),
          octile(state, here, t.tile, straightCost, diagonalCost),
          t.id,
        ];
        if (
          !bestKey ||
          key[0] < bestKey[0] ||
          (key[0] === bestKey[0] &&
            (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))
        ) {
          best = t;
          bestKey = key;
        }
      }
      if (best) {
        startTask(imp, best);
        continue;
      }

      if (
        imp.autoBlockedVersion !== state.mapVersion &&
        (state.tick + imp.id) % AUTO_CLAIM_SCAN_TICKS === 0
      ) {
        const tile = findAutoClaimTile(state, rules, imp);
        if (tile === null) imp.autoBlockedVersion = state.mapVersion;
        else startTask(imp, setTask(state, player.id, 'claim', tile, true, imp.id));
      }
    }
  }
}

/** Calcula la ruta del Imp a su destino. Devuelve false si no hay ninguna. */
function computePath(state: MatchState, rules: Rules, imp: Imp): boolean {
  const { straightCost, diagonalCost } = rules.data.global.pathfinding;
  const start = tileOfPosition(state, imp.x, imp.y);
  const terrainWalkable = (i: number) => rules.walkable[state.terrain[i] as number] === true;
  // Una puerta ajena le cierra el paso (la propia, no).
  const walkable = (i: number) => terrainWalkable(i) && !doorBlocks(state, i, imp.owner);
  let isGoal: (i: number) => boolean;
  let heuristic: (i: number) => number = () => 0;

  if (imp.goal === 'loaf') {
    if (imp.loafTile < 0) return false;
    const target = imp.loafTile;
    isGoal = (i) => i === target;
    heuristic = (i) => octile(state, i, target, straightCost, diagonalCost);
  } else if (imp.goal === 'haul') {
    const treasuries = new Set<number>();
    for (const r of state.rooms) {
      if (r.owner === imp.owner && rules.roomDefs[r.type]?.goldCapacityPerTile !== undefined)
        treasuries.add(r.id);
    }
    isGoal = (i) => treasuries.has(state.roomAt[i] as number);
  } else {
    const task = getTask(state, imp.taskId);
    if (!task) return false;
    const goals = new Set(workTiles(state, rules, task));
    if (goals.size === 0) return false;
    isGoal = (i) => goals.has(i);
    // Los destinos están a 1 tile (recto) del tile de la tarea, salvo reclamar, que es el propio tile.
    const slack =
      task.kind === 'claim' || task.kind === 'buildTrap' || task.kind === 'repairTrap'
        ? 0
        : straightCost;
    heuristic = (i) => Math.max(0, octile(state, i, task.tile, straightCost, diagonalCost) - slack);
  }

  // El tile de salida solo mira el terreno: si le construyen una puerta ajena encima, que pueda salir.
  if (!terrainWalkable(start)) return false;
  const path = findPath({
    width: state.width,
    height: state.height,
    walkable,
    start,
    isGoal,
    heuristic,
    straightCost,
    diagonalCost,
  });
  if (!path) return false;
  imp.path = path;
  imp.pathVersion = state.mapVersion;
  imp.mode = 'moving';
  return true;
}

function deposit(state: MatchState, rules: Rules, imp: Imp, events: SimEvent[]): void {
  const player = getPlayer(state, imp.owner);
  if (!player) return;
  const room = Math.max(0, treasuryCapacity(state, rules, player.id) - player.gold);
  const amount = Math.min(imp.carry, room);
  player.gold += amount;
  imp.carry = 0;
  if (amount > 0)
    events.push({ type: 'goldDeposited', playerId: player.id, impId: imp.id, amount });
}

function arrive(state: MatchState, rules: Rules, imp: Imp, events: SimEvent[]): void {
  if (imp.goal === 'haul') {
    deposit(state, rules, imp, events);
    resetImp(state, imp);
    maybeLoaf(state, rules, imp);
    return;
  }
  if (imp.goal === 'loaf') {
    // Llegó a donde iba a pasear: se queda ahí quieto hasta que se le pase la holgazanería.
    imp.loafTile = -1;
    resetImp(state, imp);
    return;
  }
  imp.mode = 'working';
  imp.work = 0;
}

function move(state: MatchState, rules: Rules, imp: Imp): void {
  // Tras una bofetada anda más rápido (mismo bono que trabaja); holgazaneando pasea despacio.
  const slap = state.tick < imp.slapUntil ? 1 + rules.data.global.slap.workSpeedBonus : 1;
  const loaf = imp.goal === 'loaf' ? rules.data.global.imps.loaf.speedFactor : 1;
  let left = rules.imp.base.speed * rules.dt * slap * loaf;
  while (left > 0 && imp.path.length > 0) {
    const next = imp.path[0] as number;
    const tx = tileX(state, next) + 0.5;
    const ty = tileY(state, next) + 0.5;
    const dx = tx - imp.x;
    const dy = ty - imp.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= left) {
      imp.x = tx;
      imp.y = ty;
      left -= d;
      imp.path.shift();
    } else {
      imp.x += (dx / d) * left;
      imp.y += (dy / d) * left;
      left = 0;
    }
  }
}

function work(state: MatchState, rules: Rules, imp: Imp, task: Task, events: SimEvent[]): void {
  const player = getPlayer(state, imp.owner);
  if (!player) return;
  // Tras una bofetada trabaja y mina más rápido (el mismo bono que las criaturas).
  const speed = state.tick < imp.slapUntil ? 1 + rules.data.global.slap.workSpeedBonus : 1;

  if (isMining(state, rules, task)) {
    const carryMax = rules.data.economy.impCarryGold;
    const rate = rules.data.economy.miningGoldPerSecond * rules.dt * speed;
    // Una veta infinita (diamantes) no se agota: no se descuenta nada y la tarea sigue hasta que se desmarque.
    const infinite = rules.terrain[state.terrain[task.tile] as number]?.infinite === true;
    const left = infinite ? Infinity : (state.goldLeft[task.tile] as number);
    const take = Math.min(rate, left, carryMax - imp.carry, goldRoom(state, rules, player));
    if (take > EPS) {
      imp.carry += take;
      if (!infinite) state.goldLeft[task.tile] = left - take;
    }
    if (!infinite && (state.goldLeft[task.tile] as number) <= EPS) {
      completeTask(state, rules, task, events);
      imp.taskId = 0;
      imp.goal = 'none';
      imp.mode = 'idle';
      imp.work = 0;
      maybeLoaf(state, rules, imp);
    } else if (imp.carry >= carryMax - EPS || take <= EPS) {
      // Carga llena (o la Tesorería no admite más): suelta la veta para que otro Imp tome el relevo
      // mientras este lleva el oro. La reserva dura solo mientras se mina.
      const canHaul = imp.carry > 0 && imp.haulBlockedVersion !== state.mapVersion;
      resetImp(state, imp);
      if (canHaul) startHaul(imp);
    }
    return;
  }

  if (task.kind === 'repairTrap') {
    // Reparar va por vida por segundo (con el bono de bofetada), hasta la vida máxima de la trampa.
    const trap = state.traps.find((t) => t.tile === task.tile && t.owner === task.owner);
    const max = rules.data.traps.find((d) => d.id === trap?.type)?.hp ?? 0;
    if (trap)
      trap.hp = Math.min(
        max,
        trap.hp + rules.data.global.work.trapRepairHpPerSecond * rules.dt * speed,
      );
    if (!trap || trap.hp >= max - EPS) {
      if (trap) trap.hp = max;
      completeTask(state, rules, task, events);
      imp.taskId = 0;
      imp.goal = 'none';
      imp.mode = 'idle';
      imp.work = 0;
      maybeLoaf(state, rules, imp);
    }
    return;
  }

  imp.work += rules.dt * speed;
  if (imp.work >= taskSeconds(state, rules, task) - EPS) {
    completeTask(state, rules, task, events);
    imp.taskId = 0;
    imp.goal = 'none';
    imp.mode = 'idle';
    imp.work = 0;
    maybeLoaf(state, rules, imp);
  }
}

/** Paso 6 del tick para los Imps: rutas (con límite por jugador), movimiento y trabajo. */
export function updateImps(
  state: MatchState,
  rules: Rules,
  events: SimEvent[],
  budgets: Map<PlayerId, number>,
): void {
  for (const imp of state.imps) {
    if (imp.held) continue;
    // ¿Sigue siendo válida su tarea?
    if (imp.goal === 'task') {
      const task = getTask(state, imp.taskId);
      if (!task || !isTaskValid(state, rules, task)) {
        if (task) removeTask(state, task.id);
        resetImp(state, imp);
      }
    }

    if (imp.mode === 'moving' && imp.pathVersion !== state.mapVersion) imp.mode = 'needPath';

    if (imp.mode === 'needPath') {
      const budget = budgets.get(imp.owner) ?? 0;
      if (budget <= 0) continue;
      budgets.set(imp.owner, budget - 1);
      if (!computePath(state, rules, imp)) {
        if (imp.goal === 'haul') {
          imp.haulBlockedVersion = state.mapVersion;
        } else {
          const task = getTask(state, imp.taskId);
          if (task) {
            if (task.auto) removeTask(state, task.id);
            else task.blockedVersion = state.mapVersion;
          }
          if (task?.auto) imp.autoBlockedVersion = state.mapVersion;
        }
        resetImp(state, imp);
        continue;
      }
    }

    if (imp.mode === 'moving') {
      move(state, rules, imp);
      if (imp.path.length === 0) arrive(state, rules, imp, events);
    }

    if (imp.mode === 'working') {
      const task = getTask(state, imp.taskId);
      if (!task) resetImp(state, imp);
      else work(state, rules, imp, task, events);
    }
  }
}

/**
 * Suelta un Imp de la mano en un tile: va a la tarea marcada más cercana a ese tile (excavar, minar, reclamar,
 * reforzar o construir una trampa), sin importar su prioridad habitual. Si lleva oro, primero lo entrega, y si no hay
 * tareas, sigue su vida normal desde ahí (por ejemplo reclamando suelo cercano sin dueño).
 */
export function dropImp(state: MatchState, rules: Rules, imp: Imp, tile: number): void {
  imp.held = false;
  imp.x = (tile % state.width) + 0.5;
  imp.y = Math.floor(tile / state.width) + 0.5;
  // Soltarlo en la mano también lo despierta si holgazaneaba.
  imp.loafUntil = 0;
  imp.loafTile = -1;
  resetImp(state, imp);
  if (imp.carry > 0) return;
  const best = nearestTaskByWalk(state, rules, imp, tile);
  if (best) startTask(imp, best);
}

/**
 * La tarea libre de este Imp que menos hay que andar desde `from` (rodeando muros, no en línea recta; a igual
 * distancia, la de mejor prioridad y luego la de menor id). Ignora las que no tienen camino y las de minar sin sitio en
 * la Tesorería.
 */
export function nearestTaskByWalk(
  state: MatchState,
  rules: Rules,
  imp: Imp,
  from: number,
): Task | undefined {
  const player = state.players.find((p) => p.id === imp.owner);
  if (!player) return undefined;
  const hasRoom = goldRoom(state, rules, player) > EPS;
  const dist = walkDistances(state, rules, from, imp.owner);
  let best: Task | undefined;
  let bestKey: [number, number, number] | undefined;
  for (const t of state.tasks) {
    if (t.owner !== imp.owner || t.reservedBy !== 0 || t.blockedVersion === state.mapVersion)
      continue;
    if (isMining(state, rules, t) && !hasRoom) continue;
    const work = workTiles(state, rules, t);
    if (work.length === 0) continue;
    const d = Math.min(...work.map((w) => dist[w] as number));
    // Si no hay camino hasta ella, no se elige (el Imp se quedaría parado frente a una pared).
    if (!Number.isFinite(d)) continue;
    const key: [number, number, number] = [d, taskPriority(t), t.id];
    if (
      !bestKey ||
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] &&
        (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))
    ) {
      best = t;
      bestKey = key;
    }
  }
  return best;
}
