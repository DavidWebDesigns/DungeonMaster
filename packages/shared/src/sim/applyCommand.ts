import type { DataSet } from '../data';
import { createImpCost, getPlayer, impCount } from './economy';
import { inBounds, neighbors4, tileIndex } from './grid';
import { makeImp } from './createMatch';
import { buildRoomNow, getRoom, sellRoomNow } from './rooms';
import { rulesOf, type Rules } from './rules';
import { canClaim, canDig, canReinforce, isOwnGround, removeTask, setTask } from './tasks';
import type {
  Command,
  CommandResult,
  ErrorCode,
  MatchState,
  PlayerId,
  PlayerState,
  SimEvent,
} from './types';

type Validation = { ok: true; tiles: number[]; cost?: number } | { ok: false; error: ErrorCode };

const fail = (error: ErrorCode): Validation => ({ ok: false, error });

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
const isPoint = (p: unknown): p is { x: number; y: number } =>
  typeof p === 'object' &&
  p !== null &&
  isInt((p as { x?: unknown }).x) &&
  isInt((p as { y?: unknown }).y);

/** Convierte la lista de puntos del comando en tiles únicos dentro del mapa, en orden de llegada. */
function parseTiles(state: MatchState, rules: Rules, raw: unknown): number[] | ErrorCode {
  if (!Array.isArray(raw) || !raw.every(isPoint)) return 'INVALID_COMMAND';
  if (raw.length === 0 || raw.length > rules.data.global.commands.maxTilesPerCommand)
    return 'INVALID_TARGET';
  const seen = new Set<number>();
  const out: number[] = [];
  for (const p of raw) {
    if (!inBounds(state, p.x, p.y)) continue;
    const i = tileIndex(state, p.x, p.y);
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  }
  return out;
}

/** Tiles de `candidates` conectados (por vecinos ortogonales) a un punto de partida, pasando solo por la selección. */
function chained(
  state: MatchState,
  candidates: number[],
  isSeed: (tile: number) => boolean,
): number[] {
  const set = new Set(candidates);
  const visited = new Set<number>();
  const queue: number[] = [];
  for (const t of candidates) {
    if (isSeed(t)) {
      visited.add(t);
      queue.push(t);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    for (const n of neighbors4(state, queue[h] as number)) {
      if (set.has(n) && !visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return candidates.filter((t) => visited.has(t));
}

function validate(state: MatchState, rules: Rules, player: PlayerState, cmd: Command): Validation {
  const pid = player.id;
  switch (cmd.type) {
    case 'dig': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      // Se puede marcar un pasillo entero de una vez: cada tile debe tocar suelo caminable, otro tile
      // ya marcado para excavar, o enlazarse con ellos a través de la selección.
      const marked = new Set<number>();
      for (const k of state.tasks) if (k.owner === pid && k.kind === 'dig') marked.add(k.tile);
      const ok = chained(
        state,
        tiles.filter((t) => canDig(state, rules, t, pid)),
        (t) =>
          neighbors4(state, t).some(
            (n) => rules.walkable[state.terrain[n] as number] || marked.has(n),
          ),
      );
      if (ok.length > 0) return { ok: true, tiles: ok };
      const foreign = tiles.some((t) => {
        const def = rules.terrain[state.terrain[t] as number];
        return def?.diggable && state.owner[t] !== 0 && state.owner[t] !== pid;
      });
      return fail(foreign ? 'NOT_OWNER' : 'INVALID_TARGET');
    }
    case 'cancelDig': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      const ok = tiles.filter((t) =>
        state.tasks.some((k) => k.owner === pid && k.tile === t && k.kind === 'dig'),
      );
      return ok.length > 0 ? { ok: true, tiles: ok } : fail('INVALID_TARGET');
    }
    case 'claim': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      const ok = chained(
        state,
        tiles.filter((t) => canClaim(state, rules, t, pid)),
        (t) => neighbors4(state, t).some((n) => isOwnGround(state, rules, n, pid)),
      );
      return ok.length > 0 ? { ok: true, tiles: ok } : fail('INVALID_TARGET');
    }
    case 'reinforce': {
      const tiles = parseTiles(state, rules, cmd.tiles);
      if (typeof tiles === 'string') return fail(tiles);
      const ok = tiles.filter((t) => canReinforce(state, rules, t, pid));
      return ok.length > 0 ? { ok: true, tiles: ok } : fail('INVALID_TARGET');
    }
    case 'buildRoom': {
      const r = cmd.rect;
      if (typeof cmd.room !== 'string' || typeof r !== 'object' || r === null)
        return fail('INVALID_COMMAND');
      if (![r.x, r.y, r.w, r.h].every(isInt)) return fail('INVALID_COMMAND');
      const def = rules.roomDefs[cmd.room];
      if (!def?.buildable) return fail('INVALID_TARGET');
      if (r.w < def.minSize.w || r.h < def.minSize.h) return fail('INVALID_TARGET');
      if (!inBounds(state, r.x, r.y) || !inBounds(state, r.x + r.w - 1, r.y + r.h - 1))
        return fail('INVALID_TARGET');
      const tiles: number[] = [];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = tileIndex(state, x, y);
          const buildable = rules.terrain[state.terrain[i] as number]?.buildable === true;
          if (!buildable || state.owner[i] !== pid || state.roomAt[i] !== 0)
            return fail('INVALID_TARGET');
          tiles.push(i);
        }
      }
      const cost = def.goldPerTile * tiles.length;
      if (player.gold < cost) return fail('NO_GOLD');
      return { ok: true, tiles, cost };
    }
    case 'sellRoom': {
      if (!isPoint(cmd.tile)) return fail('INVALID_COMMAND');
      if (!inBounds(state, cmd.tile.x, cmd.tile.y)) return fail('INVALID_TARGET');
      const i = tileIndex(state, cmd.tile.x, cmd.tile.y);
      const room = getRoom(state, state.roomAt[i] as number);
      if (!room) return fail('INVALID_TARGET');
      if (room.owner !== pid) return fail('NOT_OWNER');
      if (!rules.roomDefs[room.type]?.buildable) return fail('INVALID_TARGET');
      return { ok: true, tiles: [i] };
    }
    case 'castSpell': {
      if (typeof cmd.spell !== 'string' || !isPoint(cmd.target)) return fail('INVALID_COMMAND');
      const spell = rules.spells[cmd.spell];
      // En la fase 1 solo existe Crear Imp; el resto de hechizos necesita criaturas y combate.
      if (!spell || spell.effect.type !== 'spawnImp') return fail('INVALID_COMMAND');
      if (state.tick < (player.cooldowns[spell.id] ?? 0)) return fail('COOLDOWN');
      if (!inBounds(state, cmd.target.x, cmd.target.y)) return fail('INVALID_TARGET');
      const i = tileIndex(state, cmd.target.x, cmd.target.y);
      if (!isOwnGround(state, rules, i, pid)) return fail('INVALID_TARGET');
      if (impCount(state, pid) >= rules.data.global.imps.max) return fail('LIMIT_REACHED');
      const cost = createImpCost(state, rules, pid);
      if (player.mana < cost) return fail('NO_MANA');
      return { ok: true, tiles: [i], cost };
    }
    default:
      return fail('INVALID_COMMAND');
  }
}

/** Aplica un comando ya validado (paso 1 del tick). */
function execute(
  state: MatchState,
  rules: Rules,
  player: PlayerState,
  cmd: Command,
  v: Extract<Validation, { ok: true }>,
  events: SimEvent[],
): void {
  switch (cmd.type) {
    case 'dig':
      for (const t of v.tiles) setTask(state, player.id, 'dig', t);
      break;
    case 'claim':
      for (const t of v.tiles) setTask(state, player.id, 'claim', t);
      break;
    case 'reinforce':
      for (const t of v.tiles) setTask(state, player.id, 'reinforce', t);
      break;
    case 'cancelDig':
      for (const t of v.tiles) {
        for (const k of state.tasks.filter(
          (k) => k.owner === player.id && k.tile === t && k.kind === 'dig',
        )) {
          removeTask(state, k.id);
        }
      }
      break;
    case 'buildRoom':
      buildRoomNow(state, rules, player, cmd.room, cmd.rect, events);
      break;
    case 'sellRoom': {
      const room = getRoom(state, state.roomAt[v.tiles[0] as number] as number);
      if (room) sellRoomNow(state, rules, player, room, events);
      break;
    }
    case 'castSpell': {
      const spell = rules.spells[cmd.spell];
      if (!spell) break;
      player.mana -= v.cost ?? 0;
      player.cooldowns[spell.id] =
        state.tick + Math.ceil(spell.cooldownSeconds * rules.data.global.tickRate);
      const imp = makeImp(state.nextImpId++, player.id, cmd.target.x, cmd.target.y);
      state.imps.push(imp);
      events.push({ type: 'impSpawned', playerId: player.id, impId: imp.id });
      break;
    }
  }
}

/**
 * Valida un comando del jugador y lo encola para el próximo tick. Devuelve `ok` o un código de error.
 * Todo comando que pasa el límite de ritmo se guarda en `state.log` (acertado o no), para poder reproducir la partida.
 */
export function applyCommand(
  state: MatchState,
  data: DataSet,
  playerId: PlayerId,
  cmd: Command,
): CommandResult {
  const rules = rulesOf(data);
  const player = getPlayer(state, playerId);
  if (!player || player.eliminated) return { ok: false, error: 'NOT_OWNER' };

  const second = Math.floor(state.tick / rules.data.global.tickRate);
  if (player.rateSecond !== second) {
    player.rateSecond = second;
    player.rateCount = 0;
  }
  if (player.rateCount >= rules.data.global.commands.maxPerSecond)
    return { ok: false, error: 'RATE_LIMIT' };
  player.rateCount++;

  const copy = structuredClone(cmd);
  state.log.push({ tick: state.tick, playerId, cmd: copy });

  const v = validate(state, rules, player, copy);
  if (!v.ok) return v;
  state.queue.push({ playerId, cmd: copy });
  return { ok: true, accepted: v.tiles.length };
}

/** Paso 1 del tick: ejecuta los comandos en cola, en orden de llegada y luego por id de jugador. */
export function runQueuedCommands(state: MatchState, rules: Rules, events: SimEvent[]): void {
  const queue = state.queue;
  state.queue = [];
  queue.sort((a, b) => a.playerId - b.playerId);
  for (const q of queue) {
    const player = getPlayer(state, q.playerId);
    if (!player || player.eliminated) continue;
    // El estado pudo cambiar desde que se encoló (otro comando gastó el oro, etc.): se valida otra vez.
    const v = validate(state, rules, player, q.cmd);
    if (!v.ok) events.push({ type: 'commandRejected', playerId: q.playerId, error: v.error });
    else execute(state, rules, player, q.cmd, v, events);
  }
}
