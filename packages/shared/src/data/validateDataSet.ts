import type { Rect } from '../schemas';
import type { DataError, DataSet } from './dataSet';
import { DATA_FILE_NAMES, mapFileName } from './files';

/** Ids de salas que el MVP necesita, con los parámetros que cada una exige. */
const REQUIRED_ROOM_FIELDS: Record<string, readonly string[]> = {
  heart: [],
  portal: [],
  treasury: ['goldCapacityPerTile'],
  lair: [],
  hatchery: ['chickenIntervalSeconds', 'tilesPerProducer', 'maxChickensPerTile'],
  trainingRoom: [
    'trainingXpPerSecond',
    'trainingMaxLevel',
    'trainingGoldPerSecond',
    'tilesPerTrainee',
  ],
  library: [],
  tortureChamber: [],
};

/** Terrenos que la simulación usa por id. */
const REQUIRED_TERRAIN = [
  'solidRock',
  'earth',
  'reinforcedWall',
  'goldVein',
  'neutralFloor',
  'claimedFloor',
  'water',
  'lava',
] as const;

const REQUIRED_SPELL_EFFECTS = ['spawnImp', 'rallyPoint', 'haste', 'heal', 'areaDamage'] as const;

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

function rectInside(r: Rect, width: number, height: number): boolean {
  return r.x + r.w <= width && r.y + r.h <= height;
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Comprueba que los archivos sean coherentes entre sí: referencias a ids existentes,
 * bandas de ánimo sin huecos, mapa del tamaño correcto, etc. Devuelve [] si todo está bien.
 */
export function validateDataSet(d: DataSet): DataError[] {
  const errors: DataError[] = [];
  const err = (file: string, path: string, message: string) => errors.push({ file, path, message });
  const F = DATA_FILE_NAMES;
  const mapFile = mapFileName(d.global.map.id);

  // ---------- global ----------
  const g = d.global;
  if (g.players.min > g.players.max)
    err(F.global, 'players', 'players.min no puede ser mayor que players.max');
  for (let n = g.players.min; n <= g.players.max; n++) {
    const corners = g.players.cornersByPlayerCount[String(n)];
    if (!corners) {
      err(
        F.global,
        `players.cornersByPlayerCount.${n}`,
        `falta la lista de esquinas para ${n} jugadores`,
      );
    } else if (corners.length !== n) {
      err(F.global, `players.cornersByPlayerCount.${n}`, `debe tener exactamente ${n} esquinas`);
    } else if (duplicates(corners.map(String)).length > 0) {
      err(F.global, `players.cornersByPlayerCount.${n}`, 'hay esquinas repetidas');
    }
  }
  if (g.mana.start > g.mana.max) err(F.global, 'mana.start', 'el maná inicial supera el máximo');
  if (g.imps.start > g.imps.max)
    err(F.global, 'imps.start', 'los Imps iniciales superan el máximo');
  if (g.combat.damageRandomMin > g.combat.damageRandomMax)
    err(F.global, 'combat.damageRandomMin', 'damageRandomMin no puede superar damageRandomMax');
  if (g.combat.recoverHpFraction <= g.combat.fleeHpFraction)
    err(
      F.global,
      'combat.recoverHpFraction',
      'debe ser mayor que fleeHpFraction (si no, una criatura que huye nunca recupera)',
    );
  if (duplicates(g.tiebreak).length > 0)
    err(F.global, 'tiebreak', 'criterios de desempate repetidos');

  // ---------- terrain ----------
  const terrainIds = new Set(d.terrain.map((t) => t.id));
  for (const id of duplicates(d.terrain.map((t) => t.id)))
    err(F.terrain, '', `id repetido: "${id}"`);
  for (const ch of duplicates(d.terrain.map((t) => t.char)))
    err(F.terrain, '', `carácter de mapa repetido: "${ch}"`);
  for (const id of REQUIRED_TERRAIN)
    if (!terrainIds.has(id)) err(F.terrain, '', `falta el terreno obligatorio "${id}"`);
  d.terrain.forEach((t, i) => {
    for (const field of ['becomesOnDig', 'becomesOnReinforce', 'becomesOnClaim'] as const) {
      const target = t[field];
      if (target !== undefined && !terrainIds.has(target))
        err(F.terrain, `[${i}].${field}`, `"${target}" no existe en terrain.json`);
    }
    if (t.diggable && (t.digSeconds === undefined || t.becomesOnDig === undefined))
      err(F.terrain, `[${i}]`, `"${t.id}" es excavable: necesita digSeconds y becomesOnDig`);
    if (t.reinforceable && t.becomesOnReinforce === undefined)
      err(F.terrain, `[${i}]`, `"${t.id}" es reforzable: necesita becomesOnReinforce`);
  });
  const vein = d.terrain.find((t) => t.id === 'goldVein');
  if (vein && !vein.goldPerTile) err(F.terrain, '', 'goldVein necesita goldPerTile mayor que 0');

  // ---------- rooms ----------
  const roomIds = new Set(d.rooms.map((r) => r.id));
  for (const id of duplicates(d.rooms.map((r) => r.id))) err(F.rooms, '', `id repetido: "${id}"`);
  for (const [id, fields] of Object.entries(REQUIRED_ROOM_FIELDS)) {
    const idx = d.rooms.findIndex((r) => r.id === id);
    const room = d.rooms[idx];
    if (!room) {
      err(F.rooms, '', `falta la sala obligatoria "${id}"`);
      continue;
    }
    for (const field of fields)
      if ((room as Record<string, unknown>)[field] === undefined)
        err(F.rooms, `[${idx}].${field}`, `la sala "${id}" necesita ${field}`);
  }
  for (const id of ['heart', 'portal']) {
    const r = d.rooms.find((x) => x.id === id);
    if (r?.buildable) err(F.rooms, '', `"${id}" no puede ser construible: viene en el mapa`);
  }
  const heartRoom = d.rooms.find((r) => r.id === 'heart');
  if (heartRoom && (heartRoom.minSize.w !== g.heart.size || heartRoom.minSize.h !== g.heart.size))
    err(
      F.rooms,
      '',
      `el tamaño del Corazón debe coincidir con global.heart.size (${g.heart.size})`,
    );
  const training = d.rooms.find((r) => r.id === 'trainingRoom');
  if (
    training?.trainingMaxLevel !== undefined &&
    training.trainingMaxLevel > d.progression.maxLevel
  )
    err(F.rooms, '', 'trainingMaxLevel supera progression.maxLevel');

  // ---------- creatures ----------
  const creatureIds = new Set(d.creatures.map((c) => c.id));
  for (const id of duplicates(d.creatures.map((c) => c.id)))
    err(F.creatures, '', `id repetido: "${id}"`);
  if (!creatureIds.has('imp')) err(F.creatures, '', 'falta la criatura obligatoria "imp"');
  d.creatures.forEach((c, i) => {
    c.attraction?.requires.forEach((req, j) => {
      if (!roomIds.has(req.room))
        err(
          F.creatures,
          `[${i}].attraction.requires[${j}].room`,
          `la sala "${req.room}" no existe`,
        );
    });
    c.enemies.forEach((e, j) => {
      if (!creatureIds.has(e))
        err(F.creatures, `[${i}].enemies[${j}]`, `la criatura "${e}" no existe`);
      if (e === c.id)
        err(F.creatures, `[${i}].enemies[${j}]`, 'una criatura no puede ser su propio enemigo');
    });
    if (c.needs.paid && c.base.wage === 0)
      err(F.creatures, `[${i}].base.wage`, `"${c.id}" cobra sueldo pero su sueldo es 0`);
    if (c.attraction && c.base.lairTiles === 0)
      err(
        F.creatures,
        `[${i}].base.lairTiles`,
        `"${c.id}" llega por el Portal: necesita cama (lairTiles > 0)`,
      );
  });
  const imp = d.creatures.find((c) => c.id === 'imp');
  if (imp && imp.attraction !== null)
    err(F.creatures, '', 'el Imp no llega por el Portal: su attraction debe ser null');

  // ---------- spells ----------
  for (const id of duplicates(d.spells.map((s) => s.id))) err(F.spells, '', `id repetido: "${id}"`);
  const effects = new Set(d.spells.map((s) => s.effect.type));
  for (const e of REQUIRED_SPELL_EFFECTS)
    if (!effects.has(e)) err(F.spells, '', `falta un hechizo con efecto "${e}"`);
  d.spells.forEach((s, i) => {
    if (s.effect.type === 'spawnImp' && s.manaPerExtraImp === undefined)
      err(F.spells, `[${i}].manaPerExtraImp`, 'el hechizo de crear Imp necesita manaPerExtraImp');
    if (s.mana > g.mana.max)
      err(F.spells, `[${i}].mana`, `cuesta más maná (${s.mana}) que el máximo (${g.mana.max})`);
  });

  // ---------- pve ----------
  for (const id of duplicates(d.pve.difficulties.map((x) => x.id)))
    err(F.pve, '', `dificultad repetida: "${id}"`);
  if (!d.pve.difficulties.some((x) => x.id === d.pve.defaultDifficulty))
    err(F.pve, 'defaultDifficulty', `la dificultad "${d.pve.defaultDifficulty}" no existe`);
  if (d.pve.defaultRivals > d.global.players.max - 1)
    err(F.pve, 'defaultRivals', `no caben tantos rivales (máximo ${d.global.players.max - 1})`);
  if (!d.pve.speeds.includes(1)) err(F.pve, 'speeds', 'debe incluir la velocidad normal (1)');

  // ---------- traps ----------
  for (const id of duplicates(d.traps.map((t) => t.id))) err(F.traps, '', `id repetido: "${id}"`);
  d.traps.forEach((t, i) => {
    const room = d.rooms.find((r) => r.id === t.requiresRoom);
    if (!room) err(F.traps, `[${i}].requiresRoom`, `la sala "${t.requiresRoom}" no existe`);
    else if (!room.buildable)
      err(F.traps, `[${i}].requiresRoom`, `la sala "${t.requiresRoom}" no se puede construir`);
    if (t.triggerRadius < 0.5)
      err(F.traps, `[${i}].triggerRadius`, 'debe ser al menos 0,5 tiles (la mitad de un tile)');
  });

  // ---------- progression ----------
  const p = d.progression;
  if (p.xpToNextLevel.length !== p.maxLevel - 1)
    err('progression.json', 'xpToNextLevel', `debe tener ${p.maxLevel - 1} valores (maxLevel − 1)`);
  for (let i = 1; i < p.xpToNextLevel.length; i++)
    if ((p.xpToNextLevel[i] ?? 0) <= (p.xpToNextLevel[i - 1] ?? 0))
      err('progression.json', `xpToNextLevel[${i}]`, 'los umbrales de XP deben ser crecientes');
  p.noXpOnDeath.forEach((id, i) => {
    if (!creatureIds.has(id))
      err('progression.json', `noXpOnDeath[${i}]`, `la criatura "${id}" no existe`);
  });

  // ---------- mood ----------
  const m = d.mood;
  const weightSum = m.needs.wage.weight + m.needs.lair.weight + m.needs.food.weight;
  if (m.baseline + weightSum > m.max || m.baseline - weightSum < m.min)
    err(
      'mood.json',
      'needs',
      `baseline ± suma de pesos (${weightSum}) se sale de ${m.min}..${m.max}`,
    );
  for (const id of duplicates(m.bands.map((b) => b.id)))
    err('mood.json', 'bands', `banda repetida: "${id}"`);
  const bands = [...m.bands].sort((a, b) => a.min - b.min);
  if (bands[0]?.min !== m.min)
    err('mood.json', 'bands', `la banda más baja debe empezar en ${m.min}`);
  if (bands[bands.length - 1]?.max !== m.max)
    err('mood.json', 'bands', `la banda más alta debe terminar en ${m.max}`);
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    if (b.min > b.max) err('mood.json', 'bands', `la banda "${b.id}" tiene min > max`);
    const next = bands[i + 1];
    if (next && next.min !== b.max + 1)
      err(
        'mood.json',
        'bands',
        `hueco o solape entre "${b.id}" (${b.max}) y "${next.id}" (${next.min})`,
      );
  }

  // ---------- economy ----------
  const e = d.economy;
  if (e.hunger.eatThreshold > e.hunger.max)
    err('economy.json', 'hunger.eatThreshold', 'supera hunger.max');
  if (e.sleep.sleepThreshold > e.sleep.max)
    err('economy.json', 'sleep.sleepThreshold', 'supera sleep.max');
  if (e.wanderPauseSeconds.min > e.wanderPauseSeconds.max)
    err('economy.json', 'wanderPauseSeconds', 'min no puede ser mayor que max');

  // ---------- map ----------
  const map = d.map;
  const charToTerrain = new Map(d.terrain.map((t) => [t.char, t]));
  if (map.id !== g.map.id)
    err(mapFile, 'id', `el id del mapa ("${map.id}") no coincide con global.map.id`);
  if (map.width !== g.map.width || map.height !== g.map.height)
    err(
      mapFile,
      '',
      `tamaño ${map.width}×${map.height} distinto de global.map (${g.map.width}×${g.map.height})`,
    );
  if (map.rows.length !== map.height)
    err(mapFile, 'rows', `tiene ${map.rows.length} filas, se esperaban ${map.height}`);
  map.rows.forEach((row, y) => {
    if (row.length !== map.width)
      err(mapFile, `rows[${y}]`, `tiene ${row.length} columnas, se esperaban ${map.width}`);
    const unknown = [...new Set([...row].filter((ch) => !charToTerrain.has(ch)))];
    if (unknown.length > 0)
      err(
        mapFile,
        `rows[${y}]`,
        `caracteres sin terreno en terrain.json: ${unknown.map((c) => `"${c}"`).join(', ')}`,
      );
  });
  const tileAt = (x: number, y: number) => charToTerrain.get(map.rows[y]?.[x] ?? '');

  const slots = map.bases.map((b) => b.slot);
  for (const s of duplicates(slots.map(String))) err(mapFile, 'bases', `slot repetido: ${s}`);
  if (map.bases.length < g.players.max)
    err(mapFile, 'bases', `hay ${map.bases.length} bases y se necesitan ${g.players.max}`);
  for (const corners of Object.values(g.players.cornersByPlayerCount))
    for (const c of corners)
      if (!slots.includes(c))
        err(F.global, 'players.cornersByPlayerCount', `la esquina ${c} no existe en el mapa`);

  const treasuryRoom = d.rooms.find((r) => r.id === 'treasury');
  map.bases.forEach((base, i) => {
    const at = `bases[${i}]`;
    const allRects: Array<[string, Rect]> = [
      ['claimed', base.claimed],
      ['heart', base.heart],
      ...base.rooms.map((r, j): [string, Rect] => [`rooms[${j}]`, r.rect]),
    ];
    for (const [name, r] of allRects)
      if (!rectInside(r, map.width, map.height)) err(mapFile, `${at}.${name}`, 'se sale del mapa');
    if (base.heart.w !== g.heart.size || base.heart.h !== g.heart.size)
      err(mapFile, `${at}.heart`, `el Corazón debe medir ${g.heart.size}×${g.heart.size}`);
    for (const [name, r] of allRects.slice(1))
      if (!rectContains(base.claimed, r))
        err(mapFile, `${at}.${name}`, 'debe estar dentro de la zona reclamada');
    const structures = allRects.slice(1);
    for (let a = 0; a < structures.length; a++)
      for (let b = a + 1; b < structures.length; b++)
        if (rectsOverlap(structures[a]![1], structures[b]![1]))
          err(mapFile, at, `${structures[a]![0]} y ${structures[b]![0]} se solapan`);
    base.rooms.forEach((r, j) => {
      if (!roomIds.has(r.type))
        err(mapFile, `${at}.rooms[${j}].type`, `la sala "${r.type}" no existe`);
      const def = d.rooms.find((x) => x.id === r.type);
      if (def && (r.rect.w < def.minSize.w || r.rect.h < def.minSize.h))
        err(mapFile, `${at}.rooms[${j}]`, `"${r.type}" es más pequeña que su tamaño mínimo`);
    });
    for (const type of ['treasury', 'portal'])
      if (!base.rooms.some((r) => r.type === type))
        err(mapFile, `${at}.rooms`, `la base no tiene "${type}"`);
    if (treasuryRoom?.goldCapacityPerTile !== undefined) {
      const capacity = base.rooms
        .filter((r) => r.type === 'treasury')
        .reduce((sum, r) => sum + r.rect.w * r.rect.h * treasuryRoom.goldCapacityPerTile!, 0);
      if (capacity < g.startingGold)
        err(
          mapFile,
          `${at}.rooms`,
          `la Tesorería inicial (${capacity}) no alcanza para el oro inicial (${g.startingGold})`,
        );
    }
    // Toda la zona reclamada debe ser suelo reclamado en las filas del mapa.
    for (let y = base.claimed.y; y < base.claimed.y + base.claimed.h; y++)
      for (let x = base.claimed.x; x < base.claimed.x + base.claimed.w; x++)
        if (tileAt(x, y)?.id !== 'claimedFloor') {
          err(
            mapFile,
            `${at}.claimed`,
            `el tile (${x},${y}) de la zona reclamada no es claimedFloor`,
          );
          return;
        }
    if (base.imps.length !== g.imps.start)
      err(
        mapFile,
        `${at}.imps`,
        `hay ${base.imps.length} Imps y global.imps.start es ${g.imps.start}`,
      );
    base.imps.forEach((pt, j) => {
      if (!tileAt(pt.x, pt.y)?.walkable)
        err(mapFile, `${at}.imps[${j}]`, `(${pt.x},${pt.y}) no es transitable`);
      if (rectContains(base.heart, { x: pt.x, y: pt.y, w: 1, h: 1 }))
        err(mapFile, `${at}.imps[${j}]`, 'un Imp no puede empezar dentro del Corazón');
    });
  });
  for (let a = 0; a < map.bases.length; a++)
    for (let b = a + 1; b < map.bases.length; b++)
      if (rectsOverlap(map.bases[a]!.claimed, map.bases[b]!.claimed))
        err(mapFile, 'bases', `las bases ${a} y ${b} se solapan`);

  return errors;
}
