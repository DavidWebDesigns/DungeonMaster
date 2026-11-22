/**
 * Criaturas derrotadas y cadáveres.
 *
 * Una criatura que se queda sin vida no muere al instante: queda **derrotada y aturdida** durante `downed.seconds`. En ese
 * tiempo un Imp puede llevársela en brazos: a la Guarida si es de su dueño (se recupera) o a la Cámara de tortura si es
 * enemiga (se convierte en aliada con `convertChance`, y si no, muere y da oro). Si nadie la salva muere y deja un
 * cadáver, que los Imps llevan al Cementerio; un minuto después de enterrado se levanta como Esqueleto.
 */
import { passive } from './abilities';
import { creatureMaxHp, creatureWage } from './creatureStats';
import { goldRoom } from './economy';
import { assignBed } from './lairs';
import { removeCreature } from './needs';
import { creatureCount, newCreature } from './portal';
import { isVisible } from './fog';
import { nextFloat } from './rng';
import { secondsToTicks, type Rules } from './rules';
import type { Corpse, Creature, Imp, MatchState, PlayerId, SimEvent, Task } from './types';

/** ¿Está derrotada y aturdida (con la vida a 0 pero aún sin morir)? */
export const isDowned = (c: Pick<Creature, 'downedUntil'>): boolean => c.downedUntil > 0;

const findImp = (state: MatchState, id: number): Imp | undefined =>
  state.imps.find((i) => i.id === id);

const roomTilesOf = (state: MatchState, owner: PlayerId, type: string): number[] => {
  const out: number[] = [];
  for (const r of state.rooms) if (r.owner === owner && r.type === type) out.push(...r.tiles);
  return out;
};

const hasRoom = (state: MatchState, owner: PlayerId, type: string): boolean =>
  state.rooms.some((r) => r.owner === owner && r.type === type);

/** Para el jugador, ¿a dónde se lleva esta criatura derrotada? La Guarida si es suya; la Cámara de tortura si es enemiga. */
export function rescueRoomType(c: Pick<Creature, 'owner'>, player: PlayerId): string {
  return c.owner === player ? 'lair' : 'tortureChamber';
}

/** Deja de estar en brazos: el cuerpo queda donde está. */
export function releaseBody(state: MatchState, imp: Imp): void {
  if (imp.carryKind === 'creature') {
    const c = state.creatures.find((k) => k.id === imp.carryId);
    if (c && c.carriedBy === imp.id) c.carriedBy = 0;
  } else if (imp.carryKind === 'corpse') {
    const b = state.corpses.find((k) => k.id === imp.carryId);
    if (b && b.carriedBy === imp.id) b.carriedBy = 0;
  }
  imp.carryKind = 'none';
  imp.carryId = 0;
}

/** Un cadáver nuevo de una criatura que acaba de morir. */
function makeCorpse(state: MatchState, c: Creature, x: number, y: number): Corpse {
  const corpse: Corpse = {
    id: state.nextCorpseId++,
    type: c.type,
    level: c.level,
    origin: c.owner,
    x,
    y,
    carriedBy: 0,
    buriedIn: 0,
    riseAt: 0,
    born: state.tick,
  };
  state.corpses.push(corpse);
  return corpse;
}

/** Una criatura sin vida pasa al estado derrotada: aturdida y a la espera de que un Imp la lleve (o de morir). */
export function enterDowned(
  state: MatchState,
  rules: Rules,
  c: Creature,
  events: SimEvent[],
): void {
  const seconds = rules.data.global.downed.seconds;
  c.hp = 0;
  c.downedUntil = state.tick + Math.max(1, secondsToTicks(rules, seconds));
  c.carriedBy = 0;
  c.statuses = [];
  c.goal = 'none';
  c.mode = 'idle';
  c.path = [];
  c.actTimer = 0;
  c.targetKind = 'none';
  c.targetId = 0;
  c.assaultKind = 'none';
  c.assaultId = 0;
  c.doorTarget = -1;
  c.blocked = {};
  events.push({
    type: 'creatureDowned',
    playerId: c.owner,
    creatureId: c.id,
    x: c.x,
    y: c.y,
    seconds,
  });
}

/**
 * Muere de verdad (se acabó el tiempo derrotada, o `downed.seconds` es 0). Si el Vampiro puede volver, se programa su
 * regreso y no deja cadáver; si no, deja un cadáver donde cayó.
 */
export function dieDowned(
  state: MatchState,
  rules: Rules,
  c: Creature,
  events: SimEvent[],
  cause: 'combat' | 'spell' | 'tortured',
): void {
  // Si un Imp la llevaba en brazos, lo deja libre.
  if (c.carriedBy) {
    const imp = findImp(state, c.carriedBy);
    if (imp) {
      imp.carryKind = 'none';
      imp.carryId = 0;
      imp.goal = 'none';
      imp.mode = 'idle';
      imp.path = [];
      imp.taskId = 0;
    }
  }
  for (const t of state.tasks.filter((k) => k.kind === 'rescue' && k.bodyId === c.id))
    state.tasks = state.tasks.filter((k) => k.id !== t.id);
  const un = passive(rules, c, 'undying');
  let reviving = false;
  if (
    un &&
    c.level > un.effect.levelLoss &&
    state.rooms.some((r) => r.owner === c.owner && r.type === un.effect.requiresRoom)
  ) {
    state.revives.push({
      owner: c.owner,
      type: c.type,
      level: c.level - un.effect.levelLoss,
      at: state.tick + Math.round(un.effect.reviveSeconds * rules.data.global.tickRate),
    });
    reviving = true;
  }
  events.push({ type: 'creatureDied', playerId: c.owner, creatureId: c.id, cause });
  removeCreature(state, c.id);
  if (!reviving) makeCorpse(state, c, c.x, c.y);
}

/** Las tareas de Imp que ya no tienen sentido (el cuerpo ya no está disponible o no hay a dónde llevarlo) las limpia `isTaskValid`. */
export function isBodyTaskValid(state: MatchState, task: Task): boolean {
  if (task.kind === 'rescue') {
    const c = state.creatures.find((k) => k.id === task.bodyId);
    if (!c || c.downedUntil <= 0 || state.tick >= c.downedUntil) return false;
    if (c.carriedBy !== 0 && c.carriedBy !== task.reservedBy) return false;
    return hasRoom(state, task.owner, rescueRoomType(c, task.owner));
  }
  const b = state.corpses.find((k) => k.id === task.bodyId);
  if (!b || b.buriedIn !== 0) return false;
  if (b.carriedBy !== 0 && b.carriedBy !== task.reservedBy) return false;
  return hasRoom(state, task.owner, 'graveyard');
}

/**
 * Cada tick: para cada jugador con Imps, crea la tarea de llevarse cada criatura derrotada (a su Guarida si es suya, a su
 * Cámara de tortura si es enemiga) y cada cadáver suelto (al Cementerio) que ve y para los que tiene a dónde llevarlos.
 */
export function scanBodyTasks(state: MatchState, rules: Rules): void {
  const bodies = state.creatures.filter(
    (c) => c.downedUntil > 0 && state.tick < c.downedUntil && c.carriedBy === 0,
  );
  const loose = state.corpses.filter((b) => b.carriedBy === 0 && b.buriedIn === 0);
  if (bodies.length === 0 && loose.length === 0) return;
  for (const p of state.players) {
    if (p.eliminated || !state.imps.some((i) => i.owner === p.id)) continue;
    const exists = (kind: Task['kind'], id: number) =>
      state.tasks.some((t) => t.owner === p.id && t.kind === kind && t.bodyId === id);
    const add = (kind: Task['kind'], id: number, x: number, y: number) => {
      state.tasks.push({
        id: state.nextTaskId++,
        owner: p.id,
        kind,
        tile: Math.floor(y) * state.width + Math.floor(x),
        reservedBy: 0,
        blockedVersion: -1,
        auto: false,
        bodyId: id,
      });
    };
    for (const c of bodies) {
      if (!hasRoom(state, p.id, rescueRoomType(c, p.id)) || exists('rescue', c.id)) continue;
      // Las propias siempre se conocen; las ajenas solo si se ven.
      const tile = Math.floor(c.y) * state.width + Math.floor(c.x);
      if (c.owner !== p.id && !isVisible(state, rules, p.id, tile)) continue;
      add('rescue', c.id, c.x, c.y);
    }
    if (!hasRoom(state, p.id, 'graveyard')) continue;
    for (const b of loose) {
      const tile = Math.floor(b.y) * state.width + Math.floor(b.x);
      if (exists('bury', b.id) || !isVisible(state, rules, p.id, tile)) continue;
      add('bury', b.id, b.x, b.y);
    }
  }
}

/** Los tiles a los que un Imp debe llevar lo que carga (vacío si ya no hay destino). */
export function carryDestination(state: MatchState, imp: Imp): Set<number> {
  if (imp.carryKind === 'corpse') return new Set(roomTilesOf(state, imp.owner, 'graveyard'));
  const c = state.creatures.find((k) => k.id === imp.carryId);
  if (!c) return new Set();
  return new Set(roomTilesOf(state, imp.owner, rescueRoomType(c, imp.owner)));
}

/** El Imp llega al cuerpo: lo coge en brazos. Devuelve false si ya no se puede (otro se lo llevó, murió...). */
export function pickUpBody(state: MatchState, imp: Imp, task: Task): boolean {
  if (!isBodyTaskValid(state, task)) return false;
  if (task.kind === 'rescue') {
    const c = state.creatures.find((k) => k.id === task.bodyId) as Creature;
    c.carriedBy = imp.id;
    imp.carryKind = 'creature';
    imp.carryId = c.id;
  } else {
    const b = state.corpses.find((k) => k.id === task.bodyId) as Corpse;
    b.carriedBy = imp.id;
    imp.carryKind = 'corpse';
    imp.carryId = b.id;
  }
  return true;
}

/** El cuerpo en brazos sigue al Imp. */
export function syncCarried(state: MatchState, imp: Imp): void {
  if (imp.carryKind === 'creature') {
    const c = state.creatures.find((k) => k.id === imp.carryId);
    if (c) {
      c.x = imp.x;
      c.y = imp.y;
    }
  } else if (imp.carryKind === 'corpse') {
    const b = state.corpses.find((k) => k.id === imp.carryId);
    if (b) {
      b.x = imp.x;
      b.y = imp.y;
    }
  }
}

/**
 * El Imp llega a su destino con el cuerpo: lo deja. Una criatura propia se recupera en la Guarida; una enemiga pasa por la
 * Cámara de tortura (se convierte o muere dando oro); un cadáver se entierra en el Cementerio. Devuelve si se entregó.
 */
export function deliverBody(
  state: MatchState,
  rules: Rules,
  imp: Imp,
  events: SimEvent[],
): boolean {
  const owner = state.players.find((p) => p.id === imp.owner);
  if (!owner) return false;
  const tile = Math.floor(imp.y) * state.width + Math.floor(imp.x);
  const room = state.rooms.find((r) => r.id === state.roomAt[tile] && r.owner === imp.owner);
  if (imp.carryKind === 'corpse') {
    const corpse = state.corpses.find((k) => k.id === imp.carryId);
    const def = rules.roomDefs['graveyard'];
    if (!corpse || !room || room.type !== 'graveyard' || !def?.skeletonRiseSeconds) return false;
    corpse.carriedBy = 0;
    corpse.buriedIn = room.id;
    corpse.riseAt = state.tick + secondsToTicks(rules, def.skeletonRiseSeconds);
    corpse.x = imp.x;
    corpse.y = imp.y;
    imp.carryKind = 'none';
    imp.carryId = 0;
    events.push({
      type: 'corpseBuried',
      playerId: imp.owner,
      corpseId: corpse.id,
      x: imp.x,
      y: imp.y,
    });
    return true;
  }
  const c = state.creatures.find((k) => k.id === imp.carryId);
  if (!c || !room) return false;
  const downed = rules.data.global.downed;
  c.carriedBy = 0;
  imp.carryKind = 'none';
  imp.carryId = 0;
  c.x = imp.x;
  c.y = imp.y;
  const heal = () => {
    c.downedUntil = 0;
    c.hp = Math.max(1, Math.round(creatureMaxHp(rules, c) * downed.reviveHpFraction));
  };
  if (c.owner === imp.owner) {
    // Rescatada: se recupera en la Guarida, descansando en su cama si tiene.
    if (room.type !== 'lair') return false;
    heal();
    c.blocked = {};
    if (assignBed(state, rules, c)) {
      c.goal = 'bed';
      c.mode = 'acting';
      c.actTimer = 0;
    }
    events.push({ type: 'creatureRescued', playerId: c.owner, creatureId: c.id, x: c.x, y: c.y });
    return true;
  }
  // Enemiga en la Cámara de tortura.
  if (room.type !== 'tortureChamber') return false;
  const def = rules.roomDefs['tortureChamber'];
  const victimOwner = c.owner;
  const canJoin = creatureCount(state, imp.owner) < rules.data.global.maxCreaturesPerPlayer;
  if (def?.convertChance !== undefined && canJoin && nextFloat(state) < def.convertChance) {
    heal();
    c.owner = imp.owner;
    c.mood = rules.data.mood.start;
    c.hunger = 0;
    c.sleep = 0;
    c.wageSat = 0;
    c.payPending = false;
    c.purse = 0;
    c.beds = [];
    c.blocked = {};
    c.targetRoom = 0;
    assignBed(state, rules, c);
    events.push({
      type: 'creatureConverted',
      playerId: imp.owner,
      victimOwner,
      creatureId: c.id,
      x: c.x,
      y: c.y,
    });
    return true;
  }
  // No se convierte: muere y su nuevo captor cobra su sueldo × `deathGoldWages`.
  const gold = Math.round(creatureWage(rules, c) * (def?.deathGoldWages ?? 0));
  owner.gold += Math.min(gold, goldRoom(state, rules, owner));
  events.push({
    type: 'creatureTortured',
    playerId: imp.owner,
    victimOwner,
    creatureId: c.id,
    x: c.x,
    y: c.y,
    gold,
  });
  dieDowned(state, rules, c, events, 'tortured');
  return true;
}

/** Cada tick: los cadáveres enterrados se levantan como Esqueleto y los sueltos acaban desapareciendo. */
export function tickCorpses(state: MatchState, rules: Rules, events: SimEvent[]): void {
  if (state.corpses.length === 0) return;
  const decay = secondsToTicks(rules, rules.data.global.downed.corpseDecaySeconds);
  const keep: Corpse[] = [];
  for (const b of state.corpses) {
    if (b.carriedBy !== 0 && !findImp(state, b.carriedBy)) b.carriedBy = 0;
    if (b.carriedBy !== 0) {
      keep.push(b);
      continue;
    }
    if (b.buriedIn !== 0) {
      const room = state.rooms.find((r) => r.id === b.buriedIn && r.type === 'graveyard');
      if (!room) {
        b.buriedIn = 0; // perdieron el Cementerio: vuelve a estar tirado
      } else if (state.tick >= b.riseAt) {
        const player = state.players.find((p) => p.id === room.owner);
        if (!player || player.eliminated) continue; // se pierde con su dueño
        if (creatureCount(state, room.owner) < rules.data.global.maxCreaturesPerPlayer) {
          const tile = Math.floor(b.y) * state.width + Math.floor(b.x);
          const skeleton = newCreature(state, rules, room.owner, 'skeleton', tile);
          state.creatures.push(skeleton);
          events.push({
            type: 'skeletonRose',
            playerId: room.owner,
            creatureId: skeleton.id,
            x: skeleton.x,
            y: skeleton.y,
          });
          continue; // el cadáver desaparece: ya es Esqueleto
        }
        b.riseAt = state.tick + 10; // sin sitio en la mazmorra: espera
      }
      keep.push(b);
      continue;
    }
    if (state.tick - b.born >= decay) continue; // nadie lo enterró: desaparece
    keep.push(b);
  }
  state.corpses = keep;
}
