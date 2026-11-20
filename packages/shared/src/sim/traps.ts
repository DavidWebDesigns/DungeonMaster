/**
 * Trampas: se colocan en un tile de suelo propio (como una sala) cuando se tiene la sala que exige cada una
 * (la Cámara de tortura). Las construyen los Imps; una vez armadas, se disparan solas contra los enemigos que
 * pasan cerca. Son invisibles para el rival.
 */
import { areaDamage } from './combat';
import { clampGold, missingRooms } from './rooms';
import type { Rules } from './rules';
import { removeTask, setTask } from './tasks';
import type { ErrorCode, MatchState, PlayerState, SimEvent, Trap } from './types';

export type TrapCheck = { ok: true; cost: number } | { ok: false; error: ErrorCode };

export function trapAt(state: MatchState, tile: number): Trap | undefined {
  return state.traps.find((t) => t.tile === tile);
}

/** ¿Tiene el jugador construida la sala que pide la trampa? */
export function hasRequiredRoom(state: MatchState, owner: number, room: string): boolean {
  return missingRooms(state, owner, [room]).length === 0;
}

/** Comprueba si el jugador puede colocar la trampa en ese tile (sin gastar nada). */
export function checkBuildTrap(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  trapId: string,
  tile: number,
): TrapCheck {
  const def = rules.data.traps.find((t) => t.id === trapId);
  if (!def) return { ok: false, error: 'INVALID_COMMAND' };
  if (!hasRequiredRoom(state, player.id, def.requiresRoom))
    return { ok: false, error: 'REQUIRES_ROOM' };
  const terrain = rules.terrain[state.terrain[tile] as number];
  // Suelo propio libre: construible, sin sala y sin otra trampa.
  if (
    !terrain?.buildable ||
    state.owner[tile] !== player.id ||
    state.roomAt[tile] !== 0 ||
    trapAt(state, tile)
  ) {
    return { ok: false, error: 'INVALID_TARGET' };
  }
  if (player.gold < def.goldCost) return { ok: false, error: 'NO_GOLD' };
  return { ok: true, cost: def.goldCost };
}

/** Coloca la trampa (ya validada), cobra su coste y manda a los Imps a construirla. */
export function placeTrapNow(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  trapId: string,
  tile: number,
  events: SimEvent[],
): void {
  const def = rules.data.traps.find((t) => t.id === trapId);
  if (!def) return;
  player.gold -= def.goldCost;
  const trap: Trap = {
    id: state.nextTrapId++,
    type: trapId,
    owner: player.id,
    tile,
    built: false,
    readyAt: 0,
  };
  state.traps.push(trap);
  setTask(state, player.id, 'buildTrap', tile);
  events.push({ type: 'trapPlaced', playerId: player.id, trapId: trap.id, trap: trapId, tile });
}

/** Vende o desmonta una trampa: devuelve su parte del coste (todo si aún no está construida). */
export function sellTrapNow(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  trap: Trap,
  events: SimEvent[],
): void {
  const def = rules.data.traps.find((t) => t.id === trap.type);
  if (def) player.gold += Math.floor(def.goldCost * (trap.built ? def.sellRefund : 1));
  clampGold(state, rules, player);
  state.traps = state.traps.filter((t) => t.id !== trap.id);
  for (const k of state.tasks.filter(
    (k) => k.kind === 'buildTrap' && k.tile === trap.tile && k.owner === trap.owner,
  )) {
    removeTask(state, k.id);
  }
  events.push({ type: 'trapSold', playerId: player.id, trap: trap.type, tile: trap.tile });
}

/**
 * Paso 7: las trampas armadas se disparan contra criaturas e Imps enemigos que estén a menos de su radio de
 * disparo. Hacen su daño en área; las de un solo uso se gastan y las demás esperan su enfriamiento.
 */
export function updateTraps(state: MatchState, rules: Rules, events: SimEvent[]): void {
  const rate = rules.data.global.tickRate;
  for (const trap of state.traps.slice()) {
    if (!trap.built || state.tick < trap.readyAt) continue;
    const def = rules.data.traps.find((t) => t.id === trap.type);
    if (!def) continue;
    const x = (trap.tile % state.width) + 0.5;
    const y = Math.floor(trap.tile / state.width) + 0.5;
    const near = (px: number, py: number) => Math.hypot(px - x, py - y) <= def.triggerRadius;
    const owner = state.players.find((p) => p.id === trap.owner);
    if (!owner || owner.eliminated) continue;
    const hit =
      state.creatures.some(
        (c) =>
          c.owner !== trap.owner && !c.held && c.hp > 0 && near(c.x, c.y) && alive(state, c.owner),
      ) ||
      state.imps.some(
        (i) =>
          i.owner !== trap.owner && !i.held && i.hp > 0 && near(i.x, i.y) && alive(state, i.owner),
      );
    if (!hit) continue;
    if (def.effect.type === 'areaDamage')
      areaDamage(state, rules, trap.owner, x, y, def.effect.radius, def.effect.damage, events);
    events.push({ type: 'trapTriggered', playerId: trap.owner, trap: trap.type, x, y });
    if (def.consumable) state.traps = state.traps.filter((t) => t.id !== trap.id);
    else trap.readyAt = state.tick + Math.round(def.cooldownSeconds * rate);
  }
}

const alive = (state: MatchState, owner: number) =>
  state.players.some((p) => p.id === owner && !p.eliminated);
