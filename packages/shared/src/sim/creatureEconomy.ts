import { creatureWage } from './creatureStats';
import type { Rules } from './rules';
import type { MatchState, SimEvent } from './types';

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
    if (!def?.needs.paid || creatureWage(rules, c) <= 0) continue;
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
