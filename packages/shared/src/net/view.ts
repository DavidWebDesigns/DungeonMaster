/**
 * Vistas por jugador (niebla de guerra en el servidor).
 *
 * El servidor guarda, por cada cliente, lo que ese cliente ya sabe (`ClientKnowledge`) y en cada tick calcula la
 * diferencia con lo que puede ver ahora (`computeDelta`). El primer delta (`snapshot: true`) es la partida completa
 * vista por ese jugador; la reconexión es volver a empezar con conocimiento vacío.
 *
 * Qué ve un jugador: sus propias cosas siempre; del rival solo lo que cae dentro de su visión (criaturas, Imps,
 * terreno y salas). El terreno visto queda recordado en el cliente. Las trampas y las tareas son siempre propias.
 */
import type { DataSet } from '../data';
import { visibleMask } from '../sim/fog';
import { rulesOf } from '../sim/rules';
import type { MatchResult, MatchState, PlayerId, SimEvent } from '../sim/types';

/** Un campo de un registro de entidad. */
export type Field = number | string | number[] | number[][];
export type EntityRec = Record<string, Field>;

export interface Delta {
  tick: number;
  /** Primer mensaje (o tras reconectar): el cliente debe empezar de cero. */
  snapshot?: boolean;
  /** Tiles que cambian, de cuatro en cuatro: índice, terreno, dueño, id de sala. */
  tiles?: number[];
  /** Tiles que se ven por primera vez (terreno recordado). */
  seen?: number[];
  /** Entidades nuevas o con campos cambiados (solo los campos que cambian). Clave: "c:12", "i:3", "r:5", "t:2", "k:9". */
  set?: Record<string, EntityRec>;
  /** Entidades que ya no se ven o ya no existen. */
  del?: string[];
  /** Valores sueltos que cambian (oro, maná, estado de la partida...). */
  scalars?: Record<string, unknown>;
  /** Eventos del tick que este jugador puede ver (para efectos y avisos). */
  ev?: SimEvent[];
}

/** Lo que el servidor sabe que un cliente ya tiene. */
export class ClientKnowledge {
  readonly terrain: Int16Array;
  readonly owner: Int16Array;
  readonly roomAt: Int32Array;
  readonly seen: Uint8Array;
  readonly entities = new Map<string, EntityRec>();
  readonly scalars = new Map<string, string>();
  sentSnapshot = false;

  constructor(tiles: number) {
    this.terrain = new Int16Array(tiles).fill(-1);
    this.owner = new Int16Array(tiles).fill(-1);
    this.roomAt = new Int32Array(tiles).fill(-1);
    this.seen = new Uint8Array(tiles);
  }
}

const q2 = (n: number) => Math.round(n * 100) / 100;

function creatureRec(c: MatchState['creatures'][number], own: boolean): EntityRec {
  const r: EntityRec = {
    o: c.owner,
    t: c.type,
    x: q2(c.x),
    y: q2(c.y),
    l: c.level,
    h: Math.round(c.hp),
  };
  if (own) {
    r['hd'] = c.held ? 1 : 0;
    r['m'] = Math.round(c.mood);
    r['b'] = c.band;
    r['g'] = c.goal;
    r['d'] = c.mode;
    r['xp'] = Math.round(c.xp);
    r['hu'] = Math.round(c.hunger);
    r['sl'] = Math.round(c.sleep);
    r['bd'] = c.beds;
    r['su'] = c.slapUntil;
    r['ha'] = c.hasteUntil;
  }
  return r;
}

function impRec(i: MatchState['imps'][number], own: boolean): EntityRec {
  const r: EntityRec = { o: i.owner, x: q2(i.x), y: q2(i.y), h: Math.round(i.hp) };
  if (own) {
    r['c'] = Math.round(i.carry);
    r['hd'] = i.held ? 1 : 0;
    r['su'] = i.slapUntil;
  }
  return r;
}

/** Campos de un registro que cambiaron respecto al anterior (todos si no había anterior). */
function changedFields(prev: EntityRec | undefined, next: EntityRec): EntityRec | null {
  if (!prev) return next;
  const out: EntityRec = {};
  let any = false;
  for (const [k, v] of Object.entries(next)) {
    const p = prev[k];
    const same = Array.isArray(v) ? JSON.stringify(v) === JSON.stringify(p) : v === p;
    if (!same) {
      out[k] = v;
      any = true;
    }
  }
  return any ? out : null;
}

/** Valores sueltos que ve este jugador (los suyos con detalle; de los demás, lo público). */
export function scalarsFor(
  state: MatchState,
  data: DataSet,
  pid: PlayerId,
  vis: Uint8Array,
): Record<string, unknown> {
  const me = state.players.find((p) => p.id === pid);
  const heartVisible = (owner: PlayerId) => {
    const heart = state.rooms.find((r) => r.owner === owner && r.type === 'heart');
    return !!heart && heart.tiles.some((t) => vis[t] === 1);
  };
  const out: Record<string, unknown> = {
    status: state.status,
    result: state.result,
    nextPay: state.nextPayTick,
    // [id, esquina, eliminado, vida del Corazón si se ve (o -1)]
    pl: state.players.map((p) => [
      p.id,
      p.slot,
      p.eliminated ? 1 : 0,
      p.id === pid || heartVisible(p.id) ? Math.round(p.heartHp) : -1,
    ]),
  };
  if (me) {
    out['gold'] = Math.round(me.gold);
    out['mana'] = Math.round(me.mana);
    out['cd'] = me.cooldowns;
    out['hand'] = me.hand.map((h) => [h.kind === 'imp' ? 1 : 0, h.id]);
    out['slapAt'] = me.slapReadyTick;
    out['rally'] = [me.rallyTile, me.rallyUntil];
  }
  void data;
  return out;
}

/**
 * Eventos del tick que un jugador puede conocer: los suyos, los públicos (día de pago, eliminaciones, fin) y los que
 * ocurren dentro de su visión (golpes, hechizos, trampas, salas destruidas). Los cambios de terreno no se envían:
 * el cliente los deduce de los tiles. Nada de lo que pasa fuera de su vista.
 */
export function eventsFor(
  events: readonly SimEvent[],
  state: MatchState,
  pid: PlayerId,
  vis: Uint8Array,
): SimEvent[] {
  const sees = (x: number, y: number) => vis[Math.floor(y) * state.width + Math.floor(x)] === 1;
  const out: SimEvent[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'tileChanged':
        break;
      case 'payday':
      case 'eliminated':
      case 'gameOver':
        out.push(e);
        break;
      case 'hit':
      case 'spellCast':
      case 'trapTriggered':
        if (sees(e.x, e.y)) out.push(e);
        break;
      case 'tileDestroyed':
        if (vis[e.tile] === 1) out.push(e);
        break;
      default:
        if ('playerId' in e && e.playerId === pid) out.push(e);
    }
  }
  return out;
}

/**
 * Calcula el delta de este tick para un jugador y actualiza lo que sabe su cliente. Devuelve `null` si no hay nada
 * nuevo que contar (casi nunca: el tick siempre avanza).
 */
export function computeDelta(
  state: MatchState,
  data: DataSet,
  pid: PlayerId,
  known: ClientKnowledge,
  /** Eventos del tick (se filtran por lo que el jugador puede ver). */
  events: readonly SimEvent[] = [],
): Delta {
  const rules = rulesOf(data);
  const vis = visibleMask(state, rules, pid);
  const snapshot = !known.sentSnapshot;
  known.sentSnapshot = true;
  const delta: Delta = { tick: state.tick };
  if (snapshot) delta.snapshot = true;

  // Terreno, dueño y sala de los tiles que se ven ahora.
  const tiles: number[] = [];
  const seen: number[] = [];
  for (let i = 0; i < vis.length; i++) {
    if (vis[i] !== 1) continue;
    const t = state.terrain[i] as number;
    const o = state.owner[i] as number;
    const r = state.roomAt[i] as number;
    if (known.terrain[i] !== t || known.owner[i] !== o || known.roomAt[i] !== r) {
      tiles.push(i, t, o, r);
      known.terrain[i] = t;
      known.owner[i] = o;
      known.roomAt[i] = r;
    }
    if (known.seen[i] === 0) {
      known.seen[i] = 1;
      seen.push(i);
    }
  }
  if (tiles.length) delta.tiles = tiles;
  if (seen.length) delta.seen = seen;

  // Entidades.
  const current = new Map<string, EntityRec>();
  const seesTile = (x: number, y: number) => vis[Math.floor(y) * state.width + Math.floor(x)] === 1;
  for (const c of state.creatures) {
    const own = c.owner === pid;
    if (own || (!c.held && c.hp > 0 && seesTile(c.x, c.y)))
      current.set(`c:${c.id}`, creatureRec(c, own));
  }
  for (const i of state.imps) {
    const own = i.owner === pid;
    if (own || (!i.held && i.hp > 0 && seesTile(i.x, i.y)))
      current.set(`i:${i.id}`, impRec(i, own));
  }
  for (const room of state.rooms) {
    // Una sala propia siempre; una enemiga cuando se ve alguno de sus tiles.
    if (room.owner === pid || room.tiles.some((t) => vis[t] === 1))
      current.set(`r:${room.id}`, { t: room.type, o: room.owner });
  }
  for (const t of state.traps)
    if (t.owner === pid) current.set(`t:${t.id}`, { y: t.type, i: t.tile, b: t.built ? 1 : 0 });
  for (const k of state.tasks)
    if (k.owner === pid) current.set(`k:${k.id}`, { k: k.kind, i: k.tile });

  const set: Record<string, EntityRec> = {};
  for (const [key, rec] of current) {
    const diff = changedFields(known.entities.get(key), rec);
    if (diff) set[key] = diff;
    known.entities.set(key, rec);
  }
  const del: string[] = [];
  for (const key of [...known.entities.keys()]) {
    // Las salas nunca se borran desde el servidor (revelaría que se destruyeron fuera de la vista): el cliente las
    // retira cuando ya no cubren ningún tile.
    if (!current.has(key) && !key.startsWith('r:')) {
      del.push(key);
      known.entities.delete(key);
    }
  }
  if (Object.keys(set).length) delta.set = set;
  if (del.length) delta.del = del;

  // Valores sueltos.
  const scalars: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(scalarsFor(state, data, pid, vis))) {
    const s = JSON.stringify(v);
    if (known.scalars.get(k) !== s) {
      scalars[k] = v;
      known.scalars.set(k, s);
    }
  }
  if (Object.keys(scalars).length) delta.scalars = scalars;
  const ev = eventsFor(events, state, pid, vis);
  if (ev.length) delta.ev = ev;
  return delta;
}

export type { MatchResult };
