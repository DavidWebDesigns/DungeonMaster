import { treasuryCapacity, rulesOf, type DataSet, type MatchState, type Room } from '@dm/shared';

/** Cuánto está llena la Tesorería del dueño (0 a 1); los montones de oro suben con esto. */
export function treasuryFill(state: MatchState, data: DataSet, room: Room): number {
  const player = state.players.find((p) => p.id === room.owner);
  if (!player) return 0;
  const cap = treasuryCapacity(state, rulesOf(data), room.owner);
  return cap > 0 ? Math.min(1, player.gold / cap) : 0;
}

/** Cómo se ve una sala según su nivel: crece y gana piezas poco a poco. */
export interface RoomLook {
  level: number;
  /** 1 (nivel bajo) a 4 (nivel máximo). */
  tier: 1 | 2 | 3 | 4;
  /** Escala horizontal de los accesorios de cada tile (1 = como en el nivel 1). */
  girth: number;
  /** Escala vertical de los accesorios. */
  height: number;
  /** Torre central, desde el 40 % del nivel máximo (nivel 4 de 10). */
  tower: { height: number; baseDiameter: number; topDiameter: number } | null;
  /** Anillo alrededor de la torre, desde el 70 % (nivel 7). */
  ring: boolean;
  /** Joya que corona la torre: solo en el nivel máximo. */
  crown: boolean;
}

/**
 * Forma y tamaño de una sala por su nivel (su número de tiles, de 1 a `maxLevel`). El nivel 1 es el aspecto de siempre;
 * a medida que sube, los accesorios engordan y se alargan, aparece una torre en el centro (nivel 4), se le añade un anillo
 * (nivel 7) y en el nivel máximo, una joya encima. Puro y probado: el dibujo solo lo aplica.
 */
export function roomLook(level: number, maxLevel = 10): RoomLook {
  const max = Math.max(2, maxLevel);
  const lv = Math.max(1, Math.min(max, Math.round(level)));
  const p = (lv - 1) / (max - 1);
  const towerAt = Math.ceil(0.4 * max);
  const ringAt = Math.ceil(0.7 * max);
  const tier = lv >= max ? 4 : lv >= ringAt ? 3 : lv >= towerAt ? 2 : 1;
  const hasTower = lv >= towerAt;
  const base = 0.4 + 0.3 * p;
  return {
    level: lv,
    tier,
    girth: 1 + 0.2 * p,
    height: 1 + 0.35 * p,
    tower: hasTower
      ? { height: 0.5 + 1.1 * p, baseDiameter: base, topDiameter: base * 0.35 }
      : null,
    ring: lv >= ringAt,
    crown: lv >= max,
  };
}
