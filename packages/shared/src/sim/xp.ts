import { creatureMaxHp, xpFactor } from './creatureStats';
import type { Rules } from './rules';
import type { Creature, MatchState, SimEvent } from './types';

const EPS = 1e-9;

/** Sube de nivel mientras tenga experiencia de sobra. La vida máxima sube y la actual con ella. */
export function levelUpIfReady(rules: Rules, c: Creature, events: SimEvent[]): void {
  const { xpToNextLevel, maxLevel } = rules.data.progression;
  for (;;) {
    const need = xpToNextLevel[c.level - 1];
    if (need === undefined || c.level >= maxLevel || c.xp + EPS < need) break;
    const before = creatureMaxHp(rules, c);
    c.xp -= need;
    c.level++;
    c.hp += creatureMaxHp(rules, c) - before;
    events.push({ type: 'levelUp', playerId: c.owner, creatureId: c.id, level: c.level });
  }
}

/** Gana experiencia (ajustada por el ánimo, que da entre −100 % y +10 %) y sube de nivel si toca. */
export function gainXp(
  state: MatchState,
  rules: Rules,
  c: Creature,
  amount: number,
  events: SimEvent[],
): void {
  void state;
  c.xp += amount * xpFactor(rules, c);
  levelUpIfReady(rules, c, events);
}
