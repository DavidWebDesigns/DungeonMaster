import type { DataSet } from '../data';
import type { BotOptions } from './bot';

/** Ajustes del bot para una dificultad de pve.json (null si el id no existe). */
export function botOptionsFor(data: DataSet, difficultyId: string): BotOptions | null {
  const d = data.pve.difficulties.find((x) => x.id === difficultyId);
  if (!d) return null;
  return {
    targetImps: d.bot.targetImps,
    attackArmy: d.bot.attackArmy,
    attackAfterTicks: Math.round(d.bot.attackAfterSeconds * data.global.tickRate),
  };
}
