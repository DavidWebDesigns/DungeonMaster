import { assignBed } from './lairs';
import { creatureMaxHp, moodBandOf } from './creatureStats';
import { nextFloat } from './rng';
import type { Rules } from './rules';
import type { Creature, MatchState, SimEvent } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Quita una criatura del juego (se fue o murió): suelta su cama y su lugar en la mano. */
export function removeCreature(state: MatchState, id: number): void {
  state.creatures = state.creatures.filter((c) => c.id !== id);
  for (const p of state.players) p.hand = p.hand.filter((h) => h !== id);
}

/**
 * Paso 4 del tick, una vez por segundo: hambre, sueño, inanición, curación en la cama, ánimo, bandas
 * y abandono de la mazmorra por Furioso.
 */
export function tickNeeds(state: MatchState, rules: Rules, events: SimEvent[]): void {
  const rate = rules.data.global.tickRate;
  if (state.tick === 0 || state.tick % rate !== 0) return;
  const { economy, mood } = rules.data;
  const leaving: Array<{ c: Creature; cause: 'left' | 'starved' }> = [];

  for (const c of state.creatures) {
    const def = rules.creatureDefs[c.type];
    if (!def) continue;
    const maxHp = creatureMaxHp(rules, c);

    if (def.needs.eats)
      c.hunger = Math.min(economy.hunger.max, c.hunger + economy.hunger.risePerSecond);
    if (def.needs.sleeps)
      c.sleep = Math.min(economy.sleep.max, c.sleep + economy.sleep.risePerSecond);

    // Inanición: pierde un 1 % de la vida máxima por segundo.
    if (def.needs.eats && c.hunger >= economy.hunger.max) {
      c.hp -= maxHp * economy.hunger.starvationHpFractionPerSecond;
      if (c.hp <= 0) {
        leaving.push({ c, cause: 'starved' });
        continue;
      }
    }
    // Descansando en la cama se cura un 1 % por segundo.
    if ((c.goal === 'bed' || c.goal === 'flee') && c.mode === 'acting') {
      c.hp = Math.min(maxHp, c.hp + maxHp * economy.sleep.lairHealFractionPerSecond);
    }
    if (c.beds.length === 0) assignBed(state, rules, c);

    if (!def.needs.hasMood) continue;

    // El sueldo satisface menos con el tiempo (tiende a 0).
    if (c.wageSat !== 0) {
      const step = mood.needs.wage.decayPerSecond;
      c.wageSat = c.wageSat > 0 ? Math.max(0, c.wageSat - step) : Math.min(0, c.wageSat + step);
    }
    const lairSat = def.base.lairTiles === 0 || c.beds.length > 0 ? 1 : -1;
    const foodSat = def.needs.eats ? 1 - (2 * c.hunger) / economy.hunger.max : 0;
    const target = clamp(
      mood.baseline +
        mood.needs.wage.weight * c.wageSat +
        mood.needs.lair.weight * lairSat +
        mood.needs.food.weight * foodSat,
      mood.min,
      mood.max,
    );
    c.mood = clamp(c.mood + (target - c.mood) * mood.approachRatePerSecond, mood.min, mood.max);

    const band = moodBandOf(rules, c.mood);
    if (band.id !== c.band) {
      c.band = band.id;
      events.push({ type: 'moodBand', playerId: c.owner, creatureId: c.id, band: band.id });
    }
    c.furiousSeconds = band.behavior === 'leaves' ? c.furiousSeconds + 1 : 0;
    // Enfadada: este segundo ignora sus necesidades con cierta probabilidad y se va hacia el Portal.
    c.ignoring =
      band.behavior === 'headsToPortal' ? nextFloat(state) < mood.angryIgnoreOrderChance : false;
    if (c.furiousSeconds >= mood.furiousLeaveSeconds) leaving.push({ c, cause: 'left' });
  }

  for (const { c, cause } of leaving) {
    removeCreature(state, c.id);
    events.push(
      cause === 'left'
        ? { type: 'creatureLeft', playerId: c.owner, creatureId: c.id }
        : { type: 'creatureDied', playerId: c.owner, creatureId: c.id, cause: 'starvation' },
    );
  }
}
