import { getPlayer, goldRoom, treasuryCapacity } from './economy';
import { octile, tileOfPosition, tileX, tileY } from './grid';
import { findPath } from './pathfinding';
import type { Rules } from './rules';
import {
  completeTask,
  findAutoClaimTile,
  getTask,
  isMining,
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

  for (const player of state.players) {
    if (player.eliminated) continue;
    const capacity = treasuryCapacity(state, rules, player.id);
    for (const imp of state.imps) {
      if (imp.owner !== player.id || imp.mode !== 'idle') continue;

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
  const walkable = (i: number) => rules.walkable[state.terrain[i] as number] === true;
  let isGoal: (i: number) => boolean;
  let heuristic: (i: number) => number = () => 0;

  if (imp.goal === 'haul') {
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
    const slack = task.kind === 'claim' ? 0 : straightCost;
    heuristic = (i) => Math.max(0, octile(state, i, task.tile, straightCost, diagonalCost) - slack);
  }

  if (!walkable(start)) return false;
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
    return;
  }
  imp.mode = 'working';
  imp.work = 0;
}

function move(state: MatchState, rules: Rules, imp: Imp): void {
  let left = rules.imp.base.speed * rules.dt;
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

  if (isMining(state, rules, task)) {
    const carryMax = rules.data.economy.impCarryGold;
    const rate = rules.data.economy.miningGoldPerSecond * rules.dt;
    const left = state.goldLeft[task.tile] as number;
    const take = Math.min(rate, left, carryMax - imp.carry, goldRoom(state, rules, player));
    if (take > EPS) {
      imp.carry += take;
      state.goldLeft[task.tile] = left - take;
    }
    if ((state.goldLeft[task.tile] as number) <= EPS) {
      completeTask(state, rules, task, events);
      imp.taskId = 0;
      imp.goal = 'none';
      imp.mode = 'idle';
      imp.work = 0;
    } else if (imp.carry >= carryMax - EPS || take <= EPS) {
      // Carga llena (o la Tesorería no admite más): suelta la veta para que otro Imp tome el relevo
      // mientras este lleva el oro. La reserva dura solo mientras se mina.
      const canHaul = imp.carry > 0 && imp.haulBlockedVersion !== state.mapVersion;
      resetImp(state, imp);
      if (canHaul) startHaul(imp);
    }
    return;
  }

  imp.work += rules.dt;
  if (imp.work >= taskSeconds(state, rules, task) - EPS) {
    completeTask(state, rules, task, events);
    imp.taskId = 0;
    imp.goal = 'none';
    imp.mode = 'idle';
    imp.work = 0;
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
