import { creatureWage } from './creatureStats';
import { populationOf } from './portal';
import type { Rules } from './rules';
import type { MatchState, PlayerId, SimEvent } from './types';

/** Día de pago: cada `paydayIntervalSeconds` todas las criaturas con sueldo van a cobrar a la Tesorería. */
export function tickPayday(state: MatchState, rules: Rules, events: SimEvent[]): void {
  if (state.tick < state.nextPayTick) return;
  const interval = Math.round(
    rules.data.economy.paydayIntervalSeconds * rules.data.global.tickRate,
  );
  state.nextPayTick += interval;
  events.push({ type: 'payday', tick: state.tick });
  for (const c of state.creatures) {
    const def = rules.creatureDefs[c.type];
    if (!def?.needs.paid || creatureWage(rules, c) <= 0 || c.downedUntil > 0) continue;
    // Si el pago anterior no llegó a cobrarse, cuenta como impago.
    if (c.payPending) {
      c.wageSat = -1;
      events.push({ type: 'paid', playerId: c.owner, creatureId: c.id, amount: 0, ok: false });
    }
    c.payPending = true;
  }
}

/** Criaderos: producen pollos (1 cada 20 s por cada 3 tiles, con tope por tile). */
export function tickHatcheries(state: MatchState, rules: Rules): void {
  for (const room of state.rooms) {
    if (room.type !== 'hatchery') continue;
    const def = rules.roomDefs['hatchery'];
    if (!def?.chickenIntervalSeconds || !def.tilesPerProducer || !def.maxChickensPerTile) continue;
    room.timer++;
    if (room.timer < Math.round(def.chickenIntervalSeconds * rules.data.global.tickRate)) continue;
    room.timer = 0;
    const producers = Math.floor(room.tiles.length / def.tilesPerProducer);
    room.stock = Math.min(def.maxChickensPerTile * room.tiles.length, room.stock + producers);
  }
}

/** Cerditos que tiene el jugador listos en todos sus Criaderos. */
export function pigletCount(state: MatchState, owner: PlayerId): number {
  let n = 0;
  for (const r of state.rooms) if (r.owner === owner && r.type === 'hatchery') n += r.piglets;
  return n;
}

/** Tope de cerditos: `pigletCapPerMaxCreature` por cada criatura de la población máxima actual (el "N/M" del HUD). */
export function pigletCap(state: MatchState, rules: Rules, owner: PlayerId): number {
  const per = rules.roomDefs['hatchery']?.pigletCapPerMaxCreature ?? 0;
  return per * populationOf(state, rules, owner).max;
}

/**
 * Cada tile de Criadero cría un cerdito cada `pigletIntervalSeconds`, hasta el tope del jugador. Los cerditos que no caben
 * en el tope no se crían (el reloj de cada Criadero sigue corriendo).
 */
export function tickPiglets(state: MatchState, rules: Rules): void {
  const def = rules.roomDefs['hatchery'];
  if (!def?.pigletIntervalSeconds) return;
  const interval = Math.round(def.pigletIntervalSeconds * rules.data.global.tickRate);
  for (const room of state.rooms) {
    if (room.type !== 'hatchery') continue;
    room.pigletTimer++;
    if (room.pigletTimer < interval) continue;
    room.pigletTimer = 0;
    const space = pigletCap(state, rules, room.owner) - pigletCount(state, room.owner);
    room.piglets += Math.max(0, Math.min(room.tiles.length, space));
  }
}
