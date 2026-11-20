import type { DataSet } from '../data';

type TerrainDef = DataSet['terrain'][number];
type RoomDef = DataSet['rooms'][number];
type CreatureDef = DataSet['creatures'][number];
type SpellDef = DataSet['spells'][number];

/** Búsquedas derivadas de los datos (se calculan una vez por DataSet). */
export interface Rules {
  data: DataSet;
  /** Segundos por tick. */
  dt: number;
  terrain: TerrainDef[];
  terrainIndex: Record<string, number>;
  walkable: boolean[];
  roomDefs: Record<string, RoomDef>;
  spells: Record<string, SpellDef>;
  imp: CreatureDef;
  creatureDefs: Record<string, CreatureDef>;
  /** Índice del terreno "suelo sin reclamar" (el que se puede reclamar y es caminable). */
  neutralTerrain: number | undefined;
  /** Bandas de ánimo de mayor a menor. */
  bands: DataSet['mood']['bands'];
}

const cache = new WeakMap<DataSet, Rules>();

/**
 * Los mapas por id se crean sin prototipo (`Object.create(null)`): un cliente puede mandar ids como "__proto__" o
 * "constructor", y con objetos normales esa búsqueda devolvería algo que no es una definición.
 */
export function rulesOf(data: DataSet): Rules {
  const hit = cache.get(data);
  if (hit) return hit;
  const terrainIndex: Record<string, number> = Object.create(null);
  data.terrain.forEach((t, i) => {
    terrainIndex[t.id] = i;
  });
  const roomDefs: Record<string, RoomDef> = Object.create(null);
  for (const r of data.rooms) roomDefs[r.id] = r;
  const spells: Record<string, SpellDef> = Object.create(null);
  for (const s of data.spells) spells[s.id] = s;
  const creatureDefs: Record<string, CreatureDef> = Object.create(null);
  for (const c of data.creatures) creatureDefs[c.id] = c;
  const imp = data.creatures.find((c) => c.id === 'imp');
  if (!imp) throw new Error('creatures.json no define al Imp');
  const rules: Rules = {
    data,
    dt: 1 / data.global.tickRate,
    terrain: data.terrain,
    terrainIndex,
    walkable: data.terrain.map((t) => t.walkable),
    roomDefs,
    spells,
    imp,
    creatureDefs,
    neutralTerrain:
      data.terrain.findIndex((t) => t.walkable && t.becomesOnClaim !== undefined) >= 0
        ? data.terrain.findIndex((t) => t.walkable && t.becomesOnClaim !== undefined)
        : undefined,
    bands: [...data.mood.bands].sort((a, b) => b.min - a.min),
  };
  cache.set(data, rules);
  return rules;
}
