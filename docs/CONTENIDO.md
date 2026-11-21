# Cómo añadir contenido

El juego está pensado para crecer con más criaturas, salas, trampas y hechizos **sin tocar la lógica**. Todo lo que cambia el juego
vive en `/data/mvp/*.json`; el código solo lo interpreta. Esta guía dice qué tocar en cada caso y qué prueba te avisa si falta algo.

> Antes de nada: `pnpm check` valida los datos (`pnpm validate-data`) y falla con un mensaje que dice el archivo y la ruta del error.
> La prueba `packages/client/src/content.test.ts` falla si añades contenido sin su parte visual.

## Añadir una criatura

1. **`data/mvp/creatures.json`**: una entrada nueva (copia una existente). Campos: `id` (camelCase), `name`, `gender` (`m` o `f`, para que el
   consejero diga "un Verdugo" / "una Torturadora"), `modelId`, `tier`, `jobClass`, `fightStyle`, `base` (vida, daño, intervalo, alcance,
   velocidad, sueldo, tiles de cama), `needs`, `attraction` (qué salas pide y su peso) y `flags`.
2. **Cómo llega:** `attraction.requires` lista las salas que el jugador debe tener (cada una con `minTiles` opcional). El Portal la atrae si se cumplen
   y hay cama libre. Una criatura sin `attraction` (`null`) no llega sola (como el Imp). Los **cupos** (`attraction.slots`) limitan cuántas puede
   tener: `{ "fromRoom": "lair", "tilesPerSlot": 2 }` = 1 por cada 2 tiles de Guarida; `{ "fromCreature": "goblin", "unlockEvery": 10 }` = 1 por cada 10 goblins vivos;
   `maxPerPlayer` es un tope duro. Una criatura sin cama (`lairTiles` 0) no puede dormir y debe pedir una sala que no exista al empezar.
3. **`packages/client/src/render/creatureStyle.ts` → `CREATURE_LOOKS`**: color, radio y altura del placeholder. Hasta que haya modelo 3D (`modelId`
   en `assets/assetManifest.json`), se dibuja una cápsula.
4. Nada más en el código. El estilo de pelea (`fightStyle`) ya lo usa el combate; si necesitas un comportamiento nuevo, va en
   `packages/shared/src/sim/combat.ts` (elegir objetivo) o `behavior.ts` (prioridades), con sus pruebas.

## Añadir una sala

1. **`data/mvp/rooms.json`**: `id`, `name`, `modelId`, `buildable`, `goldPerTile` (precio del primer tile; cada tile extra de la misma sala cuesta `economy.roomCostGrowthPerTile` veces más), `minSize`, `maxTiles` (las construibles; 10 = nivel máximo), `sellRefund`. Los parámetros propios de la sala son
   campos opcionales de `schemas/rooms.ts` (por ejemplo `goldCapacityPerTile`).
2. **`packages/shared/src/data/validateDataSet.ts` → `REQUIRED_ROOM_FIELDS`**: añade el `id` con los campos que la sala exige.
   (Es la lista de salas que el juego da por obligatorias.)
3. **`packages/client/src/render/palette.ts` → `ROOM_COLORS`**: su color. Opcional: accesorios en `render/entitiesView.ts` (`buildProps`).
4. Si da un efecto (como el Criadero o la Sala de entrenamiento), el efecto es lógica nueva en `packages/shared/src/sim/` con sus pruebas.
5. Atajos de teclado: las salas construibles toman `1`, `2`, ... en el orden del archivo (hay sitio hasta el 9; la prueba avisa si te pasas) y
   las trampas las letras `G H J K L N` (`TRAP_KEYS` en `input/keymap.ts`).
6. Niveles: una sala son tiles conectados del mismo tipo y su nivel es su número de tiles (1 a `maxTiles`); el siguiente tile abre otra sala. Los cupos de una criatura salen de los tiles (`slots.fromRoom` + `tilesPerSlot`) y las superiores piden una sala de nivel 10 (`requires[].minLevel`) y 10 de la base (`unlockEvery`).
7. Progresión: `requiresRooms` lista las salas que el jugador debe tener antes (el HUD la muestra bloqueada y el aviso nombra lo que falta). Solo
   las salas nuevas deberían llevarlo.

## Añadir una trampa

1. **`data/mvp/traps.json`**: `id`, `name`, `modelId`, `goldCost`, `buildSeconds` (lo que tarda un Imp), `requiresRooms` (las salas que hay que
   tener para colocarla), `family` (`physical` con `hp` y `wearPerTrigger`, o `elemental` con `uses`), `trigger` (`step`, `proximity` o `lineOfSight`),
   `triggerRadius`, `cooldownSeconds`, `sellRefund` y `effect`.
2. **Efectos:** hay `areaDamage`, `freezeArea`, `rollingBoulder`, `chainLightning` y `crushingWalls`. Un efecto nuevo se añade a `schemas/traps.ts` y a `sim/traps.ts` (`updateTraps`).
3. **`render/creatureStyle.ts` → `TRAP_LOOKS`**: forma (`spikes` o `barrel`) y color.
4. Se coloca en un tile de suelo propio, la construyen los Imps (tarea `buildTrap`) y es invisible para el rival.

## Añadir un nivel de muro reforzado

Casi todo es `data/mvp/terrain.json`: un terreno nuevo (al final de la lista, para no mover los índices), con `ownable: true`, `walkable: false` y `wallLevel: N`. El terreno del que se parte lo apunta con `becomesOnReinforce`, y puede llevar `reinforceSeconds` (tiempo de reforzar, por defecto `work.reinforceSeconds`) y `reinforceRequires: { room, minLevel }` (sala con ese nivel que hace falta para llegar al siguiente nivel). `digSeconds` es lo que tarda **cualquiera** en derribarlo. El comando `reinforce` lleva `level` (1 por defecto) y los botones del HUD salen de los datos; añade el color en `render/tileStyle.ts` y su carácter único en la tabla del generador de mapas si debe aparecer en mapas.

## Añadir un hechizo

`data/mvp/spells.json` + un efecto en `schemas/spells.ts` y `sim/spells.ts`. Los atajos `Q W E R T` siguen el orden del archivo; el texto de ayuda
va en `ui/hudModel.ts` (`SPELL_HINTS`) y la prueba de contenido avisa si falta.

## Reglas que no cambian

- Ningún número de juego en el código: si lo necesitas, va al JSON, al esquema y a `validateDataSet.ts`, con una prueba que rompa ese dato.
- Toda aleatoriedad pasa por el generador con semilla de la partida.
- Sin nombres ni assets de juegos comerciales (ver `CLAUDE.md`).
- Tras añadir criaturas o cambiar sueldos y daños, ejecuta `pnpm balance` y, si cambia algo grande, `pnpm sim` (ver `docs/DUDAS.md`, #46 y #61).

## Estado actual del contenido (prototipo)

| Tipo      | Hay                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criaturas | Imp, Goblin, Troll, Warlock, Demonio de bilis, Salamandra, Esqueleto, Bruja, Vampiro, Caballero negro, Ángel caído y, **provisionales**, Verdugo y Torturadora (ver `ASSETS.md`) |
| Salas     | Corazón, Portal, Guarida, Criadero, Tesorería, Sala de entrenamiento, Biblioteca, Cámara de tortura, Taller, Cementerio y Templo (con progresión y requisitos)                   |
| Trampas   | Trampa de pinchos y Trampa explosiva (provisionales)                                                                                                                             |
| Hechizos  | Crear Imp, Llamada a las armas, Acelerar, Curar y Rayo                                                                                                                           |
