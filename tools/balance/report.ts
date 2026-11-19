/**
 * Informe de balance (docs/PLAN.md 9.3): DPS, tiempo para matar, índice de poder y coste por minuto de cada
 * criatura, a partir de los datos. Puro y probado.
 */
import type { DataSet } from '@dm/shared';

export interface CreatureRow {
  id: string;
  name: string;
  tier: string;
  hp: number;
  damage: number;
  interval: number;
  range: number;
  speed: number;
  wage: number;
  /** Daño por segundo contra un objetivo quieto. */
  dps: number;
  /** vida × DPS. */
  power: number;
  /** Sueldo por minuto (el sueldo se paga cada `paydayIntervalSeconds`). Los Imps no cobran. */
  wagePerMinute: number;
}

export function creatureRows(data: DataSet): CreatureRow[] {
  const minutesPerPayday = data.economy.paydayIntervalSeconds / 60;
  return data.creatures.map((c) => {
    const dps = c.base.damage / c.base.attackInterval;
    return {
      id: c.id,
      name: c.name,
      tier: c.tier,
      hp: c.base.hp,
      damage: c.base.damage,
      interval: c.base.attackInterval,
      range: c.base.range,
      speed: c.base.speed,
      wage: c.base.wage,
      dps,
      power: c.base.hp * dps,
      wagePerMinute: c.base.wage / minutesPerPayday,
    };
  });
}

/** Segundos que tarda `a` en matar a `v` (sin ánimo ni aleatoriedad): el primer golpe es inmediato. */
export function timeToKill(a: CreatureRow, v: CreatureRow): number {
  if (a.damage <= 0) return Infinity;
  const hits = Math.ceil(v.hp / a.damage);
  return (hits - 1) * a.interval;
}

export interface BalanceFlag {
  stronger: string;
  weaker: string;
  powerRatio: number;
  costRatio: number;
}

/**
 * Regla del plan: una criatura no puede superar en índice de poder a otra de su mismo rango por más de un 15 %
 * sin pagar proporcionalmente más (su sueldo por minuto debe crecer al menos tanto como su poder).
 */
export function powerFlags(rows: readonly CreatureRow[], tolerance = 0.15): BalanceFlag[] {
  const flags: BalanceFlag[] = [];
  const paid = rows.filter((r) => r.wagePerMinute > 0);
  for (const a of paid) {
    for (const b of paid) {
      if (a.id === b.id || a.tier !== b.tier) continue;
      const powerRatio = a.power / b.power;
      if (powerRatio <= 1 + tolerance) continue;
      const costRatio = a.wagePerMinute / b.wagePerMinute;
      if (costRatio < powerRatio)
        flags.push({ stronger: a.id, weaker: b.id, powerRatio, costRatio });
    }
  }
  return flags;
}

const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '∞');

export function renderReport(rows: readonly CreatureRow[]): string {
  const lines: string[] = [];
  lines.push('## Criaturas (nivel 1, ánimo Neutral)', '');
  lines.push(
    '| Criatura | Vida | Daño | Intervalo | DPS | Poder (vida×DPS) | Sueldo/min | Poder por oro/min |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    lines.push(
      `| ${r.name} | ${r.hp} | ${r.damage} | ${r.interval} s | ${f(r.dps)} | ${f(r.power, 0)} | ${f(r.wagePerMinute)} | ${r.wagePerMinute > 0 ? f(r.power / r.wagePerMinute, 0) : '—'} |`,
    );
  }
  lines.push('', '## Segundos para que la fila mate a la columna (un golpe tras otro)', '');
  lines.push(`| | ${rows.map((r) => r.name).join(' | ')} |`);
  lines.push(`|---|${rows.map(() => '---:').join('|')}|`);
  for (const a of rows)
    lines.push(`| ${a.name} | ${rows.map((v) => f(timeToKill(a, v))).join(' | ')} |`);
  const flags = powerFlags(rows);
  lines.push('', '## Regla de poder (±15 % del mismo rango)', '');
  if (flags.length === 0)
    lines.push(
      'Ninguna criatura supera a otra del mismo rango en más de un 15 % sin pagar proporcionalmente más.',
    );
  for (const x of flags) {
    lines.push(
      `- **${x.stronger}** tiene ${f(x.powerRatio, 2)}× el poder de **${x.weaker}** pero cobra solo ${f(x.costRatio, 2)}× (debería ser al menos ${f(x.powerRatio, 2)}×).`,
    );
  }
  return lines.join('\n');
}
