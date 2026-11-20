/**
 * Habilidades activas en combate (Atadura, Ralentizar, Poción de lentitud, Maldición, Carga, Picada). La IA es sencilla y
 * determinista: una criatura que está en combate con una unidad y puede golpear lanza la primera habilidad activa
 * desbloqueada que esté lista y cuyo objetivo esté a su alcance; eso gasta su turno de ataque. Las condiciones de cada
 * efecto evitan malgastarla (no ata a quien ya está atado, no carga contra quien tiene al lado, no atraviesa muros).
 */
import type { AbilityDef } from '../schemas';
import {
  adjustDamage,
  applyLifesteal,
  applyStatus,
  canStandOn,
  isStunned,
  statusOf,
  unlockedAbilities,
} from './abilities';
import { attackIntervalTicks, findUnit, hasLineOfSight, rollDamage, type UnitKind } from './combat';
import type { Rules } from './rules';
import type { Creature, Imp, MatchState, SimEvent } from './types';
import { gainXp } from './xp';

/** Por debajo de esta distancia (en tiles) ya está "al lado": no hace falta cargar ni saltar. */
const ADJACENT = 1.6;

const ownerAlive = (state: MatchState, owner: number) =>
  state.players.some((p) => p.id === owner && !p.eliminated);

/** Criaturas enemigas vivas a menos de `radius` de un punto. */
function enemyCreaturesNear(
  state: MatchState,
  owner: number,
  x: number,
  y: number,
  radius: number,
): Creature[] {
  return state.creatures.filter(
    (o) =>
      o.owner !== owner &&
      !o.held &&
      o.hp > 0 &&
      ownerAlive(state, o.owner) &&
      Math.hypot(o.x - x, o.y - y) <= radius,
  );
}

/** Punto a `back` tiles del objetivo, en la línea que viene desde la criatura. */
function approachPoint(
  c: Creature,
  t: { x: number; y: number },
  back: number,
): { x: number; y: number } {
  const dx = t.x - c.x;
  const dy = t.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: t.x - (dx / d) * back, y: t.y - (dy / d) * back };
}

const tileAt = (state: MatchState, x: number, y: number) =>
  Math.floor(y) * state.width + Math.floor(x);

function announce(events: SimEvent[], c: Creature, a: AbilityDef, x: number, y: number): void {
  events.push({ type: 'abilityUsed', playerId: c.owner, creatureId: c.id, ability: a.id, x, y });
}

function cast(
  state: MatchState,
  rules: Rules,
  c: Creature,
  target: Creature | Imp,
  isCreature: boolean,
  a: AbilityDef,
  events: SimEvent[],
): boolean {
  const range = a.rangeTiles ?? 0;
  const dist = Math.hypot(target.x - c.x, target.y - c.y);
  if (dist > range + 1e-9) return false;
  if (range > ADJACENT && !hasLineOfSight(state, rules, c.x, c.y, target.x, target.y)) return false;
  const e = a.effect;
  const seconds = a.durationSeconds ?? 0;

  if (e.type === 'status') {
    if (a.radiusTiles) {
      // De zona: a los enemigos (criaturas) alrededor del objetivo que aún no lo tengan.
      const hit = enemyCreaturesNear(state, c.owner, target.x, target.y, a.radiusTiles).filter(
        (o) => !statusOf(state, o, e.status),
      );
      if (hit.length === 0) return false;
      for (const o of hit) applyStatus(state, rules, o, e.status, e.value, seconds);
    } else {
      if (!isCreature || statusOf(state, target as Creature, e.status)) return false;
      applyStatus(state, rules, target as Creature, e.status, e.value, seconds);
    }
    announce(events, c, a, target.x, target.y);
    return true;
  }

  if (e.type === 'charge') {
    // Solo contra criaturas (las aturde) y si aún no está al lado.
    if (!isCreature || dist <= ADJACENT) return false;
    const to = approachPoint(c, target, 1.0);
    if (!canStandOn(state, rules, c, tileAt(state, to.x, to.y))) return false;
    c.x = to.x;
    c.y = to.y;
    c.path = [];
    c.mode = 'acting';
    applyStatus(state, rules, target as Creature, 'stun', 0, seconds);
    announce(events, c, a, target.x, target.y);
    return true;
  }

  // dive: salta sobre el objetivo y daña en área.
  if (dist <= ADJACENT) return false;
  const to = approachPoint(c, target, 0.6);
  if (!canStandOn(state, rules, c, tileAt(state, to.x, to.y))) return false;
  c.x = to.x;
  c.y = to.y;
  c.path = [];
  c.mode = 'acting';
  const radius = a.radiusTiles ?? 1;
  const mult = e.type === 'dive' ? e.damageMultiplier : 1;
  const victims: Array<Creature | Imp> = [
    ...enemyCreaturesNear(state, c.owner, target.x, target.y, radius),
    ...state.imps.filter(
      (i) =>
        i.owner !== c.owner &&
        !i.held &&
        i.hp > 0 &&
        ownerAlive(state, i.owner) &&
        Math.hypot(i.x - target.x, i.y - target.y) <= radius,
    ),
  ];
  for (const v of victims) {
    const dmg = adjustDamage(state, rules, c, v, rollDamage(state, rules, c) * mult);
    v.hp -= dmg;
    applyLifesteal(rules, c, dmg);
    v.attackedBy = c.id;
    v.attackedTick = state.tick;
    if ('attackedByKind' in v) v.attackedByKind = 'creature';
    events.push({
      type: 'hit',
      attackerOwner: c.owner,
      targetOwner: v.owner,
      targetKind: 'level' in v ? 'creature' : 'imp',
      damage: dmg,
      x: v.x,
      y: v.y,
    });
  }
  if (victims.length > 0) gainXp(state, rules, c, rules.data.progression.xpPerHit, events);
  announce(events, c, a, target.x, target.y);
  return true;
}

/** Paso previo al combate: las criaturas que pueden golpear intentan antes una habilidad activa. */
export function updateAbilities(state: MatchState, rules: Rules, events: SimEvent[]): void {
  for (const c of state.creatures) {
    if (c.held || c.hp <= 0 || isStunned(state, c)) continue;
    if (c.goal !== 'combat' || (c.targetKind !== 'creature' && c.targetKind !== 'imp')) continue;
    if (state.tick < c.attackReadyTick) continue;
    const abilities = unlockedAbilities(rules, c).filter((a) => a.kind === 'active');
    if (abilities.length === 0) continue;
    const kind = c.targetKind as UnitKind;
    const target = findUnit(state, kind, c.targetId);
    if (!target || target.hp <= 0) continue;
    for (const a of abilities) {
      if (state.tick < (c.abilityReady[a.id] ?? 0)) continue;
      if (!cast(state, rules, c, target, kind === 'creature', a, events)) continue;
      c.abilityReady[a.id] =
        state.tick + Math.round((a.cooldownSeconds ?? 0) * rules.data.global.tickRate);
      // Lanzar la habilidad gasta el turno de ataque.
      c.attackReadyTick = state.tick + attackIntervalTicks(state, rules, c);
      break;
    }
  }
}
