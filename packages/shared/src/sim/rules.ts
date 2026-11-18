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
  /** Bandas de ánimo de mayor a menor. */
  bands: DataSet['mood']['bands'];
}

const cache = new WeakMap<DataSet, Rules>();

export function rulesOf(data: DataSet): Rules {
  const hit = cache.get(data);
  if (hit) return hit;
  const terrainIndex: Record<string, number> = {};
  data.terrain.forEach((t, i) => {
    terrainIndex[t.id] = i;
  });
  const roomDefs: Record<string, RoomDef> = {};
  for (const r of data.rooms) roomDefs[r.id] = r;
  const spells: Record<string, SpellDef> = {};
  for (const s of data.spells) spells[s.id] = s;
  const creatureDefs: Record<string, CreatureDef> = {};
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
    bands: [...data.mood.bands].sort((a, b) => b.min - a.min),
  };
  cache.set(data, rules);
  return rules;
}
