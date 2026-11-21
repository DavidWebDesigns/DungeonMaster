# Dungeon Master: plan de desarrollo para Claude Code

> Documento maestro para construir el MVP PvP de **Dungeon Master**, un gestor de mazmorras multijugador, gratuito y para navegador.
> Úsalo así: guarda este archivo en `docs/PLAN.md` del repositorio, copia la sección 3 como `CLAUDE.md` en la raíz y arranca con el prompt de la sección 13.

---

## Estado y progreso (actualizado 2026-11-18)

| Fase | Estado |
|---|---|
| Fase 0: cimientos | **Terminada.** Puerta 0 cumplida y reconfirmada. |
| Fase 1: núcleo de la simulación | **Terminada.** Puerta 1 cumplida (`packages/shared/src/sim/gate1.test.ts`). |
| Fase 2: cliente gris jugable en local | **Implementada.** Puerta 2 técnica cumplida (60 fps medidos con WebGL por software, tick de 0,02 ms). **Falta el playtest humano de sensaciones.** |
| Fase 3: criaturas vivas | **Implementada.** Puerta 3 cubierta por pruebas. Falta jugarla (playtest humano). |
| Fase 4: combate, victoria y bots | **Implementada.** Falta cerrar la Puerta 4: el reparto de victorias por esquina se deja para cuando esté la plantilla final de criaturas (dudas 46 y 61). Falta el playtest humano. |
| Fase 5: multijugador | **Implementada.** Criterios automáticos de la Puerta 5 cubiertos (rendimiento, ancho de banda y reconexión). **Falta el Playtest #1 con 3 o 4 personas reales en red.** |
| Fase 6: pulido | **En curso.** Hecho: modo PvE por defecto (3 bots, 3 dificultades), checklist de game feel 10.3 completo salvo el vuelo de monedas al contador, pantalla de fin con estadísticas, minimapa, Tab para ciclar criaturas, sonido silenciable, trampas de pruebas, guías de despliegue y de playtest, endurecimiento del servidor (fuzzing, límites) y tick 3× más rápido. Pendiente: modelos .glb reales, balance final (y un Difícil realmente más difícil), menús conectados, tutorial (aplazado tras el MVP) y la prueba de diversión de la Puerta 6. |

### Qué dejó hecho la fase 0

- **Monorepo pnpm** (`pnpm@10.28.0`, Node ≥ 22.12) con `packages/shared`, `packages/server`, `packages/client` y `tools`. `server` y `client` solo tienen un `index.ts` vacío de momento.
- **Calidad:** TypeScript strict, ESLint, Prettier, Vitest, `.editorconfig`, `.nvmrc`. ESLint prohíbe en `packages/shared` el uso de `Math.random`, `Date.now` y las importaciones de Node, Babylon y Colyseus.
- **Excepción `packages/shared/src/node/`:** utilidades de Node (leer `/data` del disco) que el navegador nunca importa.
- **Esquemas zod** en `packages/shared/src/schemas/` para global, terrain, rooms, creatures, spells, progression, mood, economy y map.
- **Validación cruzada** en `packages/shared/src/data/validateDataSet.ts` (referencias entre archivos), con pruebas que rompen datos a propósito.
- **Datos** completos en `data/mvp/*.json` con los valores de la sección 6.
- **Mapa** `map-4p-01.json` generado por `tools/gen-map/generate.ts` (`pnpm gen-map`), con su prueba. No se edita a mano.
- **Scripts:** `pnpm check` (typecheck + lint + formato + validate-data + test). `dev`, `sim` y `balance` existen pero solo avisan de la fase en que llegarán.
- **CI** en `.github/workflows` con los mismos pasos que `pnpm check`.
- **`CLAUDE.md`** con las reglas del proyecto y **`docs/DUDAS.md`** con 10 decisiones [PROPUESTO] de la fase 0 (ritmo de minado, muro reforzado, decaimiento del sueldo, ánimo inicial, diseño del mapa, posición del Portal, el Rayo no daña salas, etc.).

### Cambios respecto al plan original

- Se añadió `tools/gen-map` para generar el mapa en vez de escribir el JSON a mano.
- Se añadió el comando `pnpm check` como verificación única antes de cada commit.
- La regla "todo número nuevo va al JSON + zod + `validateDataSet.ts` con una prueba que lo rompa" quedó escrita en `CLAUDE.md`.

### Incidencias

- **2026-11-18:** se borraron los datos locales de la app de Claude y con ellos el historial de las sesiones anteriores. El proyecto no se perdió, pero solo queda lo que está escrito en este archivo, `CLAUDE.md` y `docs/DUDAS.md`.
- La carpeta del proyecto **no es un repositorio git** (no hay `.git`): no hay historial de commits y la CI no puede correr.
- No había `node_modules`. La reinstalación se empezó y se detuvo a mitad.

### Qué dejó hecho la fase 2

- **Cliente** en `packages/client` con Vite, Babylon.js y Preact. `pnpm dev` abre el juego; `pnpm e2e` corre las pruebas de navegador.
- **Sandbox** (`src/sandbox`): la simulación de `shared` dentro del navegador, un jugador, reloj inyectado y recuperación limitada.
- **Render** (`src/render`): cámara isométrica ortográfica (rotación en pasos de 90°, zoom, WASD y bordes), terreno con una instancia por tile, Imps interpolados, Corazón, Portal, montones de oro y placeholders de las 5 salas.
- **Entrada** (`src/input`): arrastrar para excavar, reclamar y reforzar; fantasma de sala con coste y color; vender; Crear Imp; atajos.
- **HUD** (`src/ui`): oro con capacidad, maná con regeneración, Imps, reloj, herramientas, salas, hechizo y avisos del consejero.
- **Game feel** (`src/feel`): tierra al excavar, monedas al minar y depositar, polvo al construir, sonidos con WebAudio.
- **En `shared`:** `previewCommand` (validación de solo lectura para los fantasmas) y `work.autoClaimRadius` (fase 1).
- Decisiones en `docs/DUDAS.md` (23 a 31). Controles: ver el pie de pantalla del juego.

### Qué dejó hecho la fase 3

- **Simulación** (`shared/src/sim`): Portal con atracción ponderada (`portal.ts`), camas de Guarida (`lairs.ts`), niveles y bandas de ánimo (`creatureStats.ts`), hambre, sueño, ánimo y abandono (`needs.ts`), día de pago y pollos del Criadero (`creatureEconomy.ts`), comportamiento por prioridades y entrenamiento (`behavior.ts`), y los comandos `pickUp`, `drop` y `slap`.
- **Cliente:** criaturas dibujadas (placeholders por tipo) con barra de vida e icono de ánimo, lista de criaturas, cuenta atrás del pago, mano, avisos del consejero apilados y nuevos efectos y sonidos.
- **Controles nuevos:** clic en una criatura la recoge, clic derecho la suelta, B abofetea.
- Decisiones en `docs/DUDAS.md` (32 a 45).

### Verificado (2026-11-18)

1. Repositorio git creado (`main`, remoto `DavidWebDesigns/DungeonMaster`).
2. `pnpm install` y `pnpm check` en verde: Puerta 0 reconfirmada.
3. Fase 1 propuesta, confirmada e implementada en `packages/shared/src/sim/`. Decisiones tomadas en `docs/DUDAS.md` (11 a 22).

---

## Índice

1. Visión, pilares de diversión y alcance
2. Stack técnico definitivo
3. `CLAUDE.md` (reglas para Claude Code)
4. Estructura del repositorio
5. Arquitectura: simulación, red y cliente
6. Especificación de juego del MVP (contrato de lógica)
7. Esquemas de datos y archivos JSON
8. Fases de desarrollo con puertas de calidad
9. Pruebas, bots y balance
10. Cliente: render, cámara, interfaz y "game feel"
11. Assets 3D desde Blender
12. Despliegue
13. Prompts listos para Claude Code
14. Después del MVP
15. Decisiones abiertas

---

## 1. Visión, pilares de diversión y alcance

**Qué es.** Cada jugador es un Guardián que excava su mazmorra, reclama territorio, mina oro, construye salas, atrae criaturas, las mantiene contentas y las lanza contra los demás para destruir su Corazón. Partidas de 2 a 4 jugadores en el MVP, en navegador, sin instalar nada.

**Identidad.** Juego propio inspirado en los clásicos de gestión de mazmorras. No se usan nombres, textos, assets ni código de juegos existentes. Todo el balance numérico es propio.

### Pilares de diversión (toda decisión se mide contra estos)

1. **Ser el villano se siente bien.** Excavar, abofetear, recoger criaturas con la mano y soltar un ejército en la base enemiga deben tener respuesta inmediata, con sonido y efecto.
2. **Tus criaturas tienen personalidad.** Comen, duermen, cobran, se quejan y se van si las tratas mal. Gestionarlas es la mitad del juego.
3. **Tensión creciente.** Empieza tranquilo (excavar y construir), se calienta en la mina central disputada y termina con asaltos al Corazón.
4. **Partidas cortas y legibles.** Objetivo de 20 a 30 minutos (tope duro de 45). Siempre se entiende por qué ganaste o perdiste.

### Alcance

| Bloque | Contenido |
|---|---|
| **MVP-1 (este plan)** | Salas de 2 a 4 jugadores con código de invitación, mapa fijo 64×64, excavar, reclamar, reforzar, 5 salas, 5 criaturas (Imp + 4), 5 hechizos, mano (recoger, soltar, abofetear), niebla de guerra, victoria por destrucción del Corazón, reconexión, registro de comandos, bots de prueba. |
| **MVP-2** | Taller con trampas y puertas, Prisión, Cámara de tortura, investigación en Biblioteca, más criaturas, bots jugables. |
| **Fuera del MVP** | Héroes, oleadas, Supervivencia, PvE, Creativo, salas de 5 y 10, posesión, cuentas, emparejamiento automático, chat, criaturas Élite, modelos finales de Blender. |

---

## 2. Stack técnico definitivo

Todo en **TypeScript**, para que Claude Code trabaje en un solo lenguaje y los tipos se compartan entre servidor y cliente.

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript (modo `strict`) | Tipos compartidos de punta a punta |
| Monorepo | pnpm workspaces | Paquetes `shared`, `server`, `client` |
| Simulación | TS puro en `packages/shared` | Corre en servidor, en tests y en el navegador (modo sandbox local) |
| Servidor | Node.js LTS + **Colyseus** | Salas, código de invitación, reconexión con token |
| Cliente | **Vite + Babylon.js** | Carga nativa de `.glb`, picking, instancing, inspector visual, materiales toon |
| Interfaz | HTML/CSS sobre el canvas con **Preact** | UI simple de mantener, separada del render |
| Validación de datos | **zod** | Cada JSON de `/data` se valida al arrancar |
| Pruebas | **Vitest** (lógica) + **Playwright** (navegador) | Simulación testeable sin gráficos |
| Calidad | ESLint + Prettier + `tsc --noEmit` en CI | Errores atrapados antes de jugar |
| Assets | `gltf-transform` | Compresión meshopt y texturas KTX2 |

> Nota: la especificación anterior proponía Three.js. Este plan fija **Babylon.js** porque trae más piezas de motor de juego listas. Si en la fase 2 Babylon da problemas, el render está aislado en `packages/client/render` y se puede cambiar sin tocar la lógica.

> Nota de red: Colyseus sincroniza estado automáticamente, pero la niebla de guerra exige que cada jugador reciba **solo lo que ve**. Por eso usamos Colyseus para salas, lobby y reconexión, y enviamos **deltas filtrados por jugador** como mensajes propios (ver 5.3). Antes de empezar la fase 5, revisa la versión actual de Colyseus y si su sistema de vistas por cliente simplifica esto.

---

## 3. `CLAUDE.md` (copiar tal cual en la raíz)

```markdown
# Dungeon Master: reglas del proyecto

Juego de gestión de mazmorras multijugador para navegador. Lee docs/PLAN.md antes de cada fase.

## Reglas de arquitectura
- Toda la lógica de juego vive en packages/shared. Es TypeScript puro: sin DOM, sin Babylon, sin Colyseus, sin Date.now(), sin Math.random().
- El servidor es autoritativo. El cliente solo envía comandos y dibuja deltas. El cliente nunca cambia estado de juego por su cuenta.
- Ningún número de juego va en el código. Todo sale de /data/mvp/*.json y se valida con zod al cargar.
- Toda aleatoriedad pasa por el generador con semilla de la partida (mulberry32).
- Simulación a 10 ticks por segundo. Las entidades se recorren siempre en orden ascendente de id.
- Misma semilla + mismo registro de comandos = mismo resultado final. Hay un test que lo comprueba.

## Reglas de trabajo
- Trabaja por fases (docs/PLAN.md sección 8). No empieces una fase sin cumplir la puerta de la anterior.
- Antes de escribir código en una fase nueva, propón la lista de archivos y de pruebas y espera confirmación.
- Cada sistema nuevo lleva pruebas en Vitest. Una tarea no está terminada si pnpm test, pnpm typecheck o pnpm lint fallan.
- Tareas pequeñas y verificables. Un commit por tarea completada, con mensaje en español.
- Si la especificación es ambigua, no inventes: anota la duda en docs/DUDAS.md, elige la opción más simple, márcala como [PROPUESTO] y sigue.

## Reglas de contenido
- No uses nombres, textos ni assets de juegos comerciales existentes. El juego se llama Dungeon Master (nombre de trabajo).
- Los modelos 3D se referencian por modelId en assets/assetManifest.json. Si falta un modelo, usa un placeholder por rol.

## Comandos
- pnpm dev            cliente + servidor en local
- pnpm test           todas las pruebas
- pnpm sim            partida headless de bots (tools/sim)
- pnpm balance        informe de balance (tools/balance-report)
- pnpm validate-data  valida /data contra los esquemas
```

---

## 4. Estructura del repositorio

```text
dungeon-master/
├─ CLAUDE.md
├─ package.json                 scripts raíz (dev, test, sim, balance, validate-data)
├─ pnpm-workspace.yaml
├─ docs/
│  ├─ PLAN.md                   este documento
│  └─ DUDAS.md                  ambigüedades encontradas y decisión tomada
├─ data/
│  └─ mvp/
│     ├─ global.json            parámetros globales (tick, maná, límites)
│     ├─ terrain.json           tipos de terreno
│     ├─ rooms.json             salas
│     ├─ creatures.json         criaturas
│     ├─ spells.json            hechizos
│     ├─ progression.json       XP y niveles
│     ├─ mood.json              necesidades, pesos y bandas de ánimo
│     ├─ economy.json           oro, pagos, comida
│     └─ maps/map-4p-01.json    mapa del MVP
├─ packages/
│  ├─ shared/                   simulación pura
│  │  └─ src/
│  │     ├─ schemas/            esquemas zod + tipos inferidos
│  │     ├─ rng.ts              mulberry32
│  │     ├─ world/              grid, tiles, mapa, versión de mapa
│  │     ├─ systems/            un archivo por sistema (economy, tasks, needs, mood, ai, movement, combat, spells, death, victory, fog)
│  │     ├─ commands/           tipos de comando + validadores
│  │     ├─ pathfinding/        A* con cola por jugador
│  │     ├─ sim.ts              createMatch(), step(), applyCommand()
│  │     └─ formulas.ts         nivel, daño, ánimo, sueldo (funciones puras)
│  ├─ server/                   Colyseus
│  │  └─ src/ (rooms/MatchRoom.ts, lobby, reconnection, rateLimit, deltaEncoder)
│  └─ client/                   Vite + Babylon + Preact
│     └─ src/ (net/, render/, input/, ui/, audio/, sandbox/)
├─ assets/
│  ├─ models/{creatures,rooms,props}/
│  └─ assetManifest.json
└─ tools/
   ├─ validate-data/
   ├─ validate-glb/
   ├─ sim/                      partidas de bots sin gráficos
   └─ balance-report/
```

---

## 5. Arquitectura: simulación, red y cliente

### 5.1 Simulación (packages/shared)

- `createMatch(config, data, seed)` crea el estado inicial a partir del mapa y los JSON.
- `applyCommand(state, playerId, cmd)` valida y encola. Devuelve `ok` o un código de error.
- `step(state)` avanza un tick (100 ms) siguiendo el orden fijo de 6.5.
- El estado es un objeto plano serializable. Entidades en arrays ordenados por id. Nada de clases con estado oculto.
- Se puede ejecutar: en el servidor (partida real), en Vitest (pruebas), en `tools/sim` (bots), y en el navegador (sandbox local de un jugador para probar la diversión antes de tener red).

### 5.2 Servidor (packages/server)

- Una `MatchRoom` de Colyseus por partida. Estados: `LOBBY → COUNTDOWN → PLAYING → ENDED`.
- Bucle a 10 Hz: aplica comandos en cola, llama a `step()`, calcula la visibilidad de cada jugador y envía su delta.
- Registro de comandos (`tick, playerId, comando`) guardado al terminar, para reproducir partidas y depurar.

### 5.3 Red y deltas

- Cliente → servidor: mensajes `cmd` con el comando y un `seq` local.
- Servidor → cliente: respuesta `ack {seq, ok | errorCode}` y, cada tick, `delta {tick, cambios}` con solo lo visible para ese jugador.
- Cada jugador tiene en el servidor una "última vista enviada"; el delta es la diferencia con ella. Así la reconexión es enviar un snapshot completo y seguir con deltas.
- Presupuesto: menos de 20 KB/s por cliente. Codificar con arrays compactos (no objetos con nombres largos) y, si hace falta, msgpack.

### 5.4 Cliente (packages/client)

- `net/` recibe deltas y mantiene un estado local de solo lectura.
- `render/` interpola posiciones entre los dos últimos ticks para dibujar a 60 fps.
- `input/` convierte clics y teclas en comandos. Mientras espera el `ack`, dibuja un fantasma de la acción (sala translúcida, tiles marcados).
- `ui/` (Preact) muestra oro, maná, panel de salas y hechizos, lista de criaturas, minimapa y avisos.
- `sandbox/` corre la simulación dentro del navegador, sin servidor, para pruebas rápidas de diversión.

---

## 6. Especificación de juego del MVP (contrato de lógica)

Todos los números son **[PROPUESTO]**: valores iniciales que se ajustan con partidas de bots y playtests. Viven en `/data/mvp/*.json`, nunca en el código. Si algo de otra fuente contradice esta sección, manda esta.

### 6.1 Parámetros globales

| Parámetro | Valor |
|---|---|
| Tick del servidor | 10 por segundo (100 ms); el cliente interpola a 60 fps |
| Mapa | 64×64 tiles, cuadrícula entera, sin generación procedural |
| Jugadores | 2 a 4. Con 2 se usan esquinas opuestas; con 3, tres esquinas y la libre queda como roca sólida |
| Duración máxima | 45 min; al agotarse se decide por desempate |
| Oro inicial | 5.000 (guardado en la Tesorería inicial) |
| Maná | Máximo 5.000, inicial 2.000, regeneración 4/s + 0,1/s por tile reclamado, tope 25/s |
| Imps | 4 iniciales, máximo 12 por jugador |
| Criaturas | Máximo 20 simultáneas por jugador (sin contar Imps) |
| Corazón | 3×3, 8.000 de vida, sin regeneración, no se repara |
| Aleatoriedad | Un generador mulberry32 por partida, con semilla fijada en COUNTDOWN |

### 6.2 Terreno y propiedad de tiles

- **Tipos:** roca sólida (indestructible), tierra (excavable), muro reforzado, veta de oro, suelo neutral, suelo reclamado (con dueño), agua y lava (intransitables en el MVP), sala (suelo reclamado con sala encima).
- **Excavar** tierra: 2 s por tile, deja suelo neutral.
- **Reclamar** suelo neutral: 1,5 s. Pasa a ser del jugador. Solo se construye en suelo reclamado propio.
- **Puertas** (O básica, I reforzada): se construyen en suelo propio como una trampa; solo su dueño las cruza y los enemigos las rompen a golpes (ver ASSETS.md §6.1).
- **Reforzar** un muro de tierra adyacente a suelo propio (nivel 1, 8 s; tecla F). **Reforzar II** (tecla V) mejora un muro propio de nivel 1 a nivel 2 (8 s) y exige un Taller de nivel 10. Cualquiera puede excavar un muro reforzado ajeno con sus Imps, pero despacio: 12 s el nivel 1 y 30 s el nivel 2 por Imp (el dueño recibe un aviso al caer).
- **Reclamar suelo enemigo** sin sala: 3 s, solo si no hay criaturas del dueño a 3 tiles o menos. Si el tile tiene sala, la sala se destruye en ese tile (el oro de un tile de Tesorería se pierde, no se roba).
- **Vender sala:** devuelve el 50 % del coste de los tiles.
- Cada base tiene por diseño una entrada abierta, para que siempre exista camino al Corazón.

### 6.3 Flujo de partida, victoria y derrota

| Estado | Qué ocurre |
|---|---|
| LOBBY | El anfitrión crea la sala (código de 6 letras). Entran 2 a 4 jugadores con apodo, reciben color y pulsan "listo". El anfitrión inicia con al menos 2 listos. |
| COUNTDOWN | 10 s. Se fija la semilla y se asignan esquinas al azar con ella. No se aceptan comandos de juego. |
| PLAYING | Tick normal. |
| ENDED | Resultado y estadísticas. La sala se cierra a los 60 s. |

- **Eliminación:** el Corazón llega a 0 o el jugador se rinde. Sus criaturas mueren, sus salas pasan a suelo neutral sin dueño y su oro desaparece.
- **Victoria:** gana el último no eliminado. Si los Corazones restantes caen en el mismo tick, empate entre ellos.
- **Desempate por tiempo:** 1) mayor % de vida del Corazón, 2) mayor poder total de criaturas (suma de vida máxima), 3) más oro.
- **Desconexión:** las criaturas siguen con su comportamiento automático. 120 s para reconectar con token; después, rendición. 5 minutos sin comandos también cuentan como rendición.
- **Daño al Corazón:** solo criaturas enemigas adyacentes. Hechizos y trampas no lo dañan.

### 6.4 Mapa del MVP (`map-4p-01.json`)

- Simetría de rotación de 90°: las cuatro esquinas son equivalentes.
- Cada esquina trae excavada una zona de 9×9 con: Corazón 3×3, Tesorería 3×3 ya construida con el oro inicial, Portal 3×3 y 4 Imps.
- Cada base tiene dos vetas de oro cercanas (6 a 10 tiles de veta en total) y hay una **gran mina central disputada**. Un pasillo de tierra une cada base con el centro.
- Veta de oro: 600 de oro por tile.
- **Niebla de guerra:** el terreno visto queda recordado. Las entidades enemigas solo se muestran dentro del radio de visión: criaturas 6 tiles, Corazón 8, tiles propios 2. El servidor no envía lo que el jugador no ve.

### 6.5 Orden del tick (siempre el mismo)

1. Aplicar comandos en cola, validados, en orden de llegada y luego por id de jugador.
2. Maná, pagos y temporizadores de economía.
3. Asignar tareas a los Imps.
4. Necesidades y ánimo (cada 10 ticks, es decir una vez por segundo).
5. Decisión de cada criatura.
6. Movimiento y rutas.
7. Combate.
8. Efectos de hechizos y temporizadores.
9. Muertes, experiencia y eliminaciones.
10. Comprobar victoria.
11. Calcular visibilidad y enviar el delta a cada jugador.

### 6.6 Comandos cliente → servidor

| Comando | Datos | Validación |
|---|---|---|
| `dig` / `cancelDig` | lista de tiles (≤ 64) | tierra o veta, adyacente a suelo visible o propio |
| `claim` | lista de tiles (≤ 64) | suelo neutral conectado a territorio propio |
| `reinforce` | lista de tiles (≤ 64) | muros propios adyacentes a suelo propio |
| `buildRoom` | tipo, rectángulo | todo suelo reclamado propio, libre, oro suficiente, tamaño mínimo |
| `sellRoom` | tile | sala propia |
| `castSpell` | hechizo, objetivo | maná suficiente, enfriamiento listo, objetivo válido y visible |
| `pickUp` / `drop` | id de entidad / tile | la mano lleva hasta 8; solo entidades propias; soltar en tile transitable propio o visible |
| `slap` | id de criatura propia | enfriamiento 1 s; ánimo −3; +25 % velocidad de trabajo 10 s |
| `surrender` | — | el cliente pide confirmación |

Respuestas: `ok` o un código: `NO_GOLD`, `NO_MANA`, `INVALID_TARGET`, `OUT_OF_RANGE`, `COOLDOWN`, `NOT_OWNER`, `RATE_LIMIT`. Límite: 30 comandos por segundo por jugador.

**Regla para soltar en territorio enemigo [PROPUESTO]:** se puede soltar en cualquier tile transitable visible. Es la forma rápida de invadir y uno de los momentos más divertidos del juego.

### 6.7 Economía

| Elemento | Valor |
|---|---|
| Veta de oro | 600 de oro por tile; un Imp carga hasta 300 por viaje |
| Tesorería | 1.000 de capacidad por tile; si no hay espacio, los Imps no minan |
| Día de pago | Cada 120 s; cada criatura cobra su sueldo en la Tesorería; sin oro se enfada |
| Crear Imp | 300 de maná + 50 por cada Imp por encima de 4 |
| Entrenamiento | Cuesta 5 de oro por segundo por criatura entrenando [PROPUESTO] |

**Costes de salas (por tile):**

| Sala | Oro por tile | Tamaño mínimo | Efecto |
|---|---|---|---|
| Guarida | 300 | 2×2 | Camas: 1 tile por criatura (Demonio de bilis ocupa 2) |
| Criadero | 150 | 3×3 | Produce 1 pollo cada 20 s por cada 3 tiles (máximo 2 pollos por tile en espera) |
| Tesorería | 100 | 3×3 | Guarda oro (1.000 por tile) |
| Sala de entrenamiento | 250 | 3×3 | XP hasta nivel 4; 1 criatura por cada 2 tiles |
| Biblioteca | 250 | 3×3 | En MVP-1 solo sirve para atraer Warlocks |

Portal y Corazón vienen construidos en el mapa y no se pueden vender.

### 6.8 Criaturas del MVP

| Criatura | Vida | Daño por golpe | Intervalo | Alcance (tiles) | Velocidad (tiles/s) | Sueldo | Tiles de guarida | Atracción |
|---|---|---|---|---|---|---|---|---|
| Imp | 600 | 15 | 1,0 s | 1 | 2,5 | 0 | 0 (duerme en suelo propio) | hechizo Crear Imp |
| Goblin | 1.500 | 60 | 1,0 s | 1 | 2,0 | 100 | 1 | Guarida |
| Troll | 2.500 | 90 | 1,2 s | 1 | 1,6 | 150 | 1 | Sala de entrenamiento |
| Warlock | 1.000 | 80 | 1,5 s | 5 (a distancia) | 1,8 | 200 | 1 | Biblioteca |
| Demonio de bilis | 4.000 | 120 | 1,5 s | 1 | 1,2 | 300 | 2 | Criadero + Sala de entrenamiento |

**Atracción por el Portal**

- Cada Portal intenta atraer una criatura **cada 60 s** si: hay hueco en la reserva (15 por Portal), no se llegó al máximo de 20 criaturas y hay **guarida libre** para ella.
- Entre las criaturas cuyo requisito se cumple, se elige al azar con el generador de la partida, ponderado por `attractWeight` de cada criatura **por los tiles de la sala que la atrae** (la más pequeña si pide varias): una Guarida de 10 tiles saca más Goblins que una de 4 [PROPUESTO: Goblin 4, Troll 3, Warlock 3, Demonio de bilis 2].
- Si ninguna cumple requisito, no llega nadie y el cliente muestra un aviso ("Construye una Guarida para atraer criaturas").

**Niveles**

- Niveles 1 a 5 en el MVP. Multiplicador: `mult(n) = 1 + 0,35 × (n − 1)`; `valor(n) = floor(base × mult(n))`.
- Escalan con el nivel: vida, daño y sueldo. No escalan: velocidad, apetito, alcance.
- XP para subir: 100, 250, 450, 700 (de 1→2 hasta 4→5).
- Sala de entrenamiento: 4 XP por segundo, solo hasta nivel 4. El nivel 5 solo se alcanza combatiendo.
- Matar a un enemigo: 20 × nivel del enemigo en XP. Un Imp muerto no da XP. Golpear: 1 XP por golpe acertado [PROPUESTO].

### 6.9 Necesidades y ánimo

Ánimo de 0 a 100 calculado solo en el servidor, una vez por segundo.

- `moodObjetivo = clamp(50 + Σ(peso × satisfacción), 0, 100)`, con cada satisfacción entre −1 y +1.
- `mood += (moodObjetivo − mood) × 0,1` por segundo.
- Las bofetadas restan directamente al ánimo (−3) además de su efecto de satisfacción.

**Necesidades del MVP** (pesos 20/15/15 reescalados a 50 puntos de rango):

| Necesidad | Peso | Satisfacción |
|---|---|---|
| Sueldo | 20 | +1 si cobró el último día de pago; −1 si no; tiende a 0 con el tiempo |
| Guarida | 15 | +1 con cama propia; −1 sin cama |
| Comida | 15 | +1 recién comida; baja con el hambre; −1 en inanición |

**Hambre [PROPUESTO]:** contador 0 a 100 que sube 70 puntos en 180 s. Con 70 o más, la criatura va al Criadero y come un pollo (vuelve a 0). En 100, inanición: pierde 1 % de vida máxima por segundo. Los Imps no comen.

**Sueño:** sube 1 punto cada 3 s. Con 80 o más va a su cama y descansa 20 s (vuelve a 0). Allí recupera 1 % de vida por segundo.

**Bandas:**

| Banda | Rango | Daño | Velocidad de trabajo | XP ganada | Conducta |
|---|---|---|---|---|---|
| Radiante | 90–100 | +15 % | +10 % | +10 % | Rinde al máximo |
| Contento | 65–89 | +5 % | +5 % | +5 % | Normal |
| Neutral | 40–64 | 0 | 0 | 0 | Normal |
| Descontento | 20–39 | −10 % | −15 % | −10 % | Se queja (aviso al jugador) |
| Enfadado | 6–19 | −25 % | −35 % | −25 % | Ignora el 30 % de las órdenes y va hacia el Portal |
| Furioso | 0–5 | −40 % | detenido | 0 | Si pasa 30 s así, abandona la mazmorra por el Portal |

La vida máxima no cambia con el ánimo. Imps inmunes al ánimo.

### 6.10 Comportamiento de las criaturas (prioridad de arriba abajo)

1. En la mano: no actúa.
2. **Combate:** enemigo visible a menos de 6 tiles, o la atacan: persigue y ataca. Elige al más cercano, prefiriendo a quien la ataca.
3. **Huida:** con menos del 25 % de vida y guarida accesible, huye a su cama y se cura allí 1 % por segundo. Si no hay salida, sigue luchando.
4. **Llamada a las armas:** va al punto marcado y ataca lo que encuentre.
5. Comer si el hambre pasa de 70.
6. Dormir si el sueño pasa de 80.
7. Cobrar si hay día de pago pendiente.
8. Entrenar si hay hueco en la Sala de entrenamiento y no llegó a nivel 4.
9. Vagar por territorio propio.

Las criaturas no invaden por su cuenta. Para atacar, el jugador usa Llamada a las armas o las suelta con la mano en territorio enemigo. Una criatura adyacente al Corazón o a una sala enemiga, sin enemigos vivos a la vista, ataca esa estructura (tile de sala: 1.000 de vida; al llegar a 0 se vuelve suelo neutral).

### 6.11 Combate

- `daño = dañoBase × mult(nivel) × modAnimo × aleatorio(0,9 a 1,1)`. Sin armadura en MVP-1.
- Cuerpo a cuerpo: el golpe cuenta si el atacante está a menos de 1,2 tiles.
- A distancia: daño instantáneo al cumplirse el intervalo, con línea de visión sin muros; el proyectil es solo visual.
- Al morir: suelta su cama, deja el oro que llevaba y su XP va al asesino.

### 6.12 Hechizos del MVP

| Hechizo | Maná | Enfriamiento | Efecto |
|---|---|---|---|
| Crear Imp | 300 + 50 por Imp extra | 2 s | Un Imp nuevo en un tile reclamado propio |
| Llamada a las armas | 600 | 20 s | Marca un punto 20 s; todas las criaturas disponibles acuden |
| Acelerar | 300 | 10 s | +50 % velocidad de movimiento y ataque a una criatura propia, 20 s |
| Curar | 400 | 8 s | +40 % de vida máxima a una criatura propia, repartido en 3 s |
| Rayo | 500 | 10 s | 600 de daño en 1,5 tiles de radio a criaturas enemigas; no daña el Corazón |

Todos los hechizos están disponibles desde el inicio en MVP-1. Solo se lanzan sobre tiles visibles.

### 6.13 Rutas y trabajo de los Imps

- A* en cuadrícula de 8 direcciones sin cortar esquinas; coste 1 recto y 1,41 diagonal. Se cruza suelo propio, neutral y enemigo; no roca, tierra sin excavar, agua ni lava.
- El mapa tiene un contador de versión que sube con cada cambio de terreno o sala. Una ruta se recalcula si cambia ese contador o el destino. Máximo 8 cálculos por tick y jugador, con cola.
- Sin colisiones entre criaturas en el MVP; se separan solo visualmente.
- Cola de tareas por jugador. Un Imp toma la tarea de mayor prioridad más cercana y la reserva (una tarea por tile). Prioridad: **llevar oro > excavar y minar lo marcado > reclamar > reforzar > reclamar tiles cercanos sin dueño**.
- Los Imps duermen en cualquier suelo propio y no tienen ánimo.

### 6.14 Criterios de aceptación del MVP

- Una partida de 4 bots de 20 minutos termina sin errores.
- Misma semilla y mismo registro de comandos producen el mismo hash de estado final.
- El tick tarda menos de 30 ms con 4 jugadores y unas 800 entidades.
- Cada cliente recibe menos de 20 KB/s.
- Desconectar y reconectar en menos de 120 s restaura la vista sin errores.
- Todo número del juego sale de `/data/mvp/*.json` y pasa `pnpm validate-data`.
- **Prueba de diversión:** en un playtest con 3 o 4 personas, al menos 3 quieren jugar otra partida enseguida.

---

## 7. Esquemas de datos y archivos JSON

Los esquemas viven en `packages/shared/src/schemas/` con zod; los tipos TypeScript se infieren de ellos.

### 7.1 Criatura (versión MVP, ampliable)

```ts
export type JobClass = 'worker' | 'scout' | 'fighter' | 'thinker';
export type FightStyle = 'blitzer' | 'blocker' | 'flanker' | 'support' | 'none';
export type Tier = 'common' | 'elite' | 'unique';

export interface CreatureDef {
  id: string;                    // 'goblin'
  name: string;                  // nombre visible
  modelId: string;               // clave en assetManifest.json
  tier: Tier;
  jobClass: JobClass;
  fightStyle: FightStyle;
  base: {
    hp: number;
    damage: number;
    attackInterval: number;      // segundos
    range: number;               // tiles; >1 = a distancia
    speed: number;               // tiles por segundo
    wage: number;
    lairTiles: number;           // 0 = no necesita cama
  };
  needs: { eats: boolean; sleeps: boolean; paid: boolean; hasMood: boolean };
  attraction: {
    requires: Array<{ room: string; minTiles?: number }>;  // todas deben cumplirse
    attractWeight: number;
  } | null;                      // null = no llega por Portal (Imp)
  enemies: string[];             // enemigos naturales (vacío en MVP-1)
  flags: string[];               // 'worker', 'immuneMood', ...
}
```

### 7.2 Ejemplo `creatures.json`

```json
[
  {
    "id": "goblin",
    "name": "Goblin",
    "modelId": "creature_goblin",
    "tier": "common",
    "jobClass": "fighter",
    "fightStyle": "flanker",
    "base": { "hp": 1500, "damage": 60, "attackInterval": 1.0, "range": 1, "speed": 2.0, "wage": 100, "lairTiles": 1 },
    "needs": { "eats": true, "sleeps": true, "paid": true, "hasMood": true },
    "attraction": { "requires": [{ "room": "lair" }], "attractWeight": 4 },
    "enemies": [],
    "flags": []
  }
]
```

### 7.3 Otros archivos

- `global.json`: tick, tamaño de mapa, oro y maná iniciales, regeneración, límites de Imps y criaturas, vida del Corazón, tiempos de desconexión y rendición, límite de comandos.
- `terrain.json`: por tipo, `diggable`, `reinforceable`, `walkable`, `digSeconds`, `goldPerTile`, `becomesOnDig`, `becomesOnReinforce`.
- `rooms.json`: `id`, `goldPerTile`, `minSize`, `sellRefund`, `capacityPerTile`, `tileHp`, parámetros propios (pollos, XP por segundo).
- `spells.json`: `id`, `mana`, `manaPerExtra`, `cooldown`, `target` (`tile` | `ownCreature` | `area`), `effect` con sus parámetros.
- `progression.json`: multiplicador por nivel, umbrales de XP, XP por golpe y por muerte, tope de entrenamiento.
- `mood.json`: pesos, bandas con modificadores, velocidad de aproximación, tiempo en Furioso para abandonar.
- `economy.json`: ciclo de pago, capacidad de Tesorería, carga de un Imp, hambre y sueño.

---

## 8. Fases de desarrollo con puertas de calidad

Regla de oro: **no se pasa a la siguiente fase sin cumplir la puerta.** Cada fase cabe en una o dos semanas de trabajo con Claude Code.

La fase 2 pone el juego en pantalla **antes** de tener red, para probar si excavar y construir ya se siente bien. Es la mejor protección contra pasar meses en algo que no divierte.

### Fase 0: cimientos

- Monorepo pnpm con `shared`, `server`, `client`, `tools`.
- TypeScript strict, ESLint, Prettier, Vitest, scripts raíz.
- `CLAUDE.md`, `docs/PLAN.md`, `docs/DUDAS.md`.
- Esquemas zod y los JSON de `/data/mvp` completos con los valores de la sección 6.
- `pnpm validate-data` funcionando.
- Integración continua (GitHub Actions): typecheck, lint, test, validate-data.

**Puerta 0:** `pnpm install && pnpm validate-data && pnpm test` pasa en limpio y la CI está en verde.

### Fase 1: núcleo de la simulación (sin gráficos)

- `rng.ts` (mulberry32) con pruebas de reproducibilidad.
- Grid, carga de `map-4p-01.json`, tipos de tile, versión de mapa.
- `createMatch`, `step`, `applyCommand` con el orden de tick de 6.5.
- Comandos `dig`, `cancelDig`, `claim`, `reinforce`, `buildRoom`, `sellRoom` con validación y códigos de error.
- Imps: cola de tareas, reservas, prioridades, minar y llevar oro a la Tesorería.
- A* con cola por jugador y recálculo por versión de mapa.
- Economía: oro, capacidad de Tesorería, maná y regeneración, hechizo Crear Imp.
- Registro de comandos y función `hashState(state)`.

**Puerta 1:** pruebas que demuestran: un Imp excava, reclama y lleva oro; construir sin oro devuelve `NO_GOLD`; la Tesorería llena detiene la minería; misma semilla + mismos comandos = mismo hash tras 6.000 ticks.

### Fase 2: cliente gris jugable en local (sandbox)

- Vite + Babylon: grid con instancing, cámara isométrica ortográfica con rotación en pasos de 90°, zoom y desplazamiento por bordes.
- Placeholders: cubos para terreno, cápsulas de color por rol para criaturas, bloques para salas.
- La simulación corre dentro del navegador (`sandbox/`) para un jugador.
- Selección de tiles por arrastre para excavar, reclamar y reforzar; construcción de salas con fantasma translúcido.
- HUD con oro, maná y paneles de salas y hechizos.
- Primeros efectos de "game feel" (sección 10.3): partículas al excavar, monedas al minar, sonido de clic.

**Puerta 2:** se puede abrir el navegador, excavar una mazmorra, minar y construir las 5 salas a 60 fps. **Playtest de sensaciones:** ¿excavar y construir ya es satisfactorio? Ajustar antes de seguir.

### Fase 3: criaturas vivas

- Portal y atracción ponderada, reserva, máximo de criaturas, avisos al jugador.
- Necesidades: hambre, sueño, sueldo; Criadero con pollos, camas en la Guarida, día de pago.
- Ánimo 0 a 100, bandas y efectos; abandono por Furioso.
- Entrenamiento con coste en oro, XP y niveles 1 a 5.
- Comportamiento por prioridades (6.10) y máquina de estados.
- Mano: `pickUp`, `drop`, `slap`.
- En el cliente: icono de ánimo y barra de vida sobre cada criatura, lista de criaturas, aviso de día de pago.

**Puerta 3:** pruebas de: criatura sin cama baja de banda; sin oro en día de pago se enfada; Furiosa 30 s se va; entrenando sube a nivel 4 y se detiene. En el sandbox se ve una mazmorra con vida propia durante 10 minutos sin intervención.

### Fase 4: combate, victoria y bots

- Combate cuerpo a cuerpo y a distancia con línea de visión, huida, curación en la cama.
- Hechizos restantes: Llamada a las armas, Acelerar, Curar, Rayo.
- Daño a salas y al Corazón, eliminación, victoria, empate, desempate por tiempo, rendición.
- Niebla de guerra en la simulación (qué ve cada jugador).
- `tools/sim`: 4 bots con estrategia simple (sección 9.2) juegan partidas completas sin gráficos.
- `tools/balance-report`: daño por segundo, tiempo para matar, coste por poder de cada criatura, duración media de partida, tasa de victoria por esquina.
- En el sandbox: un bot rival para jugar 1 contra 1 en local.

**Puerta 4:** 100 partidas de bots con semillas distintas terminan sin errores; duración media entre 15 y 35 min; ninguna esquina gana más del 30 % en partidas de 4. Jugar contra el bot local es entretenido al menos una vez.

### Fase 5: multijugador

- `MatchRoom` de Colyseus: lobby con código de 6 letras, apodos, colores, "listo", COUNTDOWN, ENDED.
- Bucle del servidor a 10 Hz, validación, límite de 30 comandos por segundo.
- Deltas filtrados por visibilidad, snapshot al conectar y reconexión con token en 120 s.
- Rendición por inactividad de 5 min.
- Cliente: conexión, interpolación entre ticks, fantasma de acciones pendientes, pantalla de lobby y de resultados.
- Pruebas: Playwright abre 2 navegadores, crea sala, juega 2 minutos y comprueba que ambos ven el mismo resultado.

**Puerta 5:** criterios de aceptación de 6.14 de rendimiento, ancho de banda y reconexión cumplidos. **Playtest #1** con 3 o 4 personas reales en red.

### Fase 6: pulido y lanzamiento del MVP

- Checklist completo de "game feel" (10.3) y audio.
- Tutorial mínimo: 5 avisos contextuales (excava, construye Tesorería, construye Guarida, tu primera criatura, día de pago).
- Pantalla de fin con estadísticas (oro minado, criaturas atraídas y perdidas, daño al Corazón).
- Primeros modelos `.glb` reemplazando placeholders (Imp, Goblin, Corazón).
- Despliegue (sección 12) y página de inicio con "crear sala" y "unirse con código".
- Ajustes de balance según playtests semanales.

**Puerta 6 (MVP terminado):** todos los criterios de 6.14 cumplidos, incluida la prueba de diversión.

---

## 9. Pruebas, bots y balance

### 9.1 Pirámide de pruebas

- **Unitarias (la mayoría):** fórmulas puras, validadores de comandos, sistemas aislados con estados pequeños construidos a mano.
- **Escenarios:** mapas mini (por ejemplo 16×16) con una situación concreta, se corre N ticks y se verifica el resultado.
- **Determinismo:** misma semilla + registro de comandos → mismo `hashState`.
- **Simulación masiva:** `pnpm sim --games 100 --players 4` sin gráficos.
- **Navegador:** Playwright para lobby, conexión y flujo básico.

### 9.2 Bot de prueba (estrategia simple y reproducible)

1. Excavar hacia las vetas cercanas y minar.
2. Construir Tesorería extra si se llena, luego Guarida 3×3, Criadero 3×3, Sala de entrenamiento 3×3, Biblioteca 3×3.
3. Mantener 6 a 8 Imps.
4. Excavar hacia la mina central y reclamarla.
5. Con 8 o más criaturas de nivel 3 o más, Llamada a las armas sobre el enemigo más débil visible; soltar criaturas cerca del Corazón enemigo.
6. Curar criaturas por debajo del 40 % de vida si hay maná.

El bot usa exactamente el mismo protocolo de comandos que un jugador. Más adelante sirve de base para el modo PvE.

### 9.3 Informe de balance

Para cada criatura: DPS, tiempo para matar a cada otra criatura, índice de poder (`vida × DPS`), coste por minuto (sueldo + comida). Para la partida: duración, oro minado por minuto, criaturas por jugador en el minuto 10 y 20, tasa de victoria por esquina. Regla: una criatura no puede superar en índice de poder a otra de su mismo rango por más de 15 % sin pagar proporcionalmente más.

---

## 10. Cliente: render, cámara, interfaz y "game feel"

### 10.1 Render

- Vista 2.5D isométrica con cámara ortográfica; rotación en pasos de 90°, zoom y desplazamiento por bordes y con WASD.
- Terreno con instancing (miles de bloques sin perder FPS). Al excavar, el bloque se oculta y aparece suelo.
- Material toon (cel-shading) compartido, definido una vez en el motor.
- Luz ambiente baja y antorchas con luces puntuales en salas: la mazmorra debe verse oscura y acogedora.
- Interpolación de posiciones entre los dos últimos ticks.

### 10.2 Controles e interfaz

- Clic izquierdo arrastrando: marcar tiles para excavar. Clic sobre criatura propia: recogerla. Clic derecho: soltar. Doble clic sobre criatura: abofetear (o tecla).
- Atajos: 1 a 5 salas, Q W E R T hechizos, Espacio para centrar en el Corazón, Tab para ciclar criaturas.
- Paneles: salas, hechizos, lista de criaturas con nivel, ánimo y tarea, minimapa, barras de oro y maná, temporizador del día de pago.
- Avisos con voz de un "consejero" en texto (sin copiar frases de ningún juego): "Tus criaturas tienen hambre", "La Tesorería está llena", "¡Atacan tu Corazón!".

### 10.3 Checklist de "game feel"

- Bofetada: sonido seco, la criatura se aplasta y estira, salta un número de "+velocidad".
- Recoger y soltar: la criatura cuelga y patalea en la mano; al soltarla cae con un pequeño impacto y polvo.
- Excavar: el bloque se agrieta en dos etapas y se rompe con partículas.
- Oro: monedas que saltan al minar y suben al contador de oro con un tintineo.
- Día de pago: campanilla y las criaturas corren a la Tesorería.
- Corazón atacado: la pantalla tiembla levemente, pulso rojo en el borde y alarma.
- Criatura que sube de nivel: destello y sonido corto.
- Criatura enfadada: nube de tormenta sobre la cabeza; furiosa: la nube relampaguea.
- Muerte: la criatura cae y se desvanece; si es enemiga, sonido de victoria corto.

Estos detalles cuestan poco y son la diferencia entre un prototipo y un juego que da ganas de repetir.

### 10.4 Rendimiento objetivo

60 fps en un portátil medio con 4 jugadores y unas 800 entidades; carga inicial menor a 15 MB.

---

## 11. Assets 3D desde Blender

- Formato glTF 2.0 binario (`.glb`), exportado desde Blender.
- Carpetas: `/assets/models/{creatures,rooms,props}/`, un `.glb` por entidad.
- `assetManifest.json` mapea `modelId` a ruta. Si falta un modelo, el cargador usa el placeholder del rol.
- Convenciones: 1 tile = 1 unidad (metro); origen en la base; eje Y arriba; frente consistente; polígonos bajos.
- Animaciones con nombres estándar: `idle`, `walk`, `work`, `attack`, `hurt`, `die`, `sleep`. Si falta una, se usa `idle`.
- Anclas con nombre: `hand_r`, `head`, `projectile_origin`.
- `tools/validate-glb` revisa nombres de animaciones, escala y peso antes de aceptar un modelo.
- Optimización con `gltf-transform` (meshopt + KTX2) en el pipeline de build.

---

## 12. Despliegue

- **Cliente:** sitio estático (Cloudflare Pages o Vercel), desplegado desde la rama `main`.
- **Servidor:** proceso Node con WebSockets persistentes (Fly.io, Railway o un VPS pequeño). Una instancia basta para el MVP.
- Variables de entorno para la URL del servidor y el modo de depuración.
- Revisa los planes gratuitos al momento de desplegar, porque cambian con frecuencia.
- Dominio y nombre definitivos solo después de revisar que no choquen con marcas existentes.

---

## 13. Prompts listos para Claude Code

**Arranque (fase 0):**

```text
Lee CLAUDE.md y docs/PLAN.md completos. Vamos a construir la fase 0.
Propón la estructura exacta de carpetas, la lista de dependencias con versión
y la lista de pruebas de la fase 0. No escribas código hasta que confirme.
```

**Después de confirmar:**

```text
Implementa la fase 0 tarea por tarea. Al terminar cada tarea corre
pnpm typecheck, pnpm lint y pnpm test, y haz un commit. Cuando todo esté,
muéstrame cómo verificar la Puerta 0.
```

**Cada fase siguiente:**

```text
La Puerta N está cumplida. Lee la fase N+1 de docs/PLAN.md. Divide la fase
en tareas de máximo 1 a 2 horas, propón la lista y las pruebas de cada una,
y espera mi confirmación antes de empezar.
```

**Cuando algo se rompe:**

```text
Este comportamiento no coincide con la sección X.Y de docs/PLAN.md: [describe].
Escribe primero una prueba que reproduzca el problema, luego corrígelo.
```

**Ajuste de balance:**

```text
Corre pnpm sim --games 100 y pnpm balance. Resume los 3 problemas de balance
más graves y propón cambios solo en /data/mvp. No cambies código.
```

---

## 14. Después del MVP

En orden de interés:

1. **MVP-2:** Taller con trampas y puertas, Prisión, Cámara de tortura, investigación en la Biblioteca, más criaturas del roster base, bots jugables como rivales.
2. **Comodidad de uso:** colas de construcción, selección múltiple, más atajos, repetición de partidas desde el registro de comandos.
3. **Cuentas y clasificación:** perfil, historial, ranking.
4. **Equipos y alianzas:** 2 contra 2 y cooperativo.
5. **Salas de 3, 5 y 10 jugadores** con mapas propios.
6. **Modos:** Supervivencia (oleadas de héroes crecientes), PvE contra IA con o sin oleadas, Creativo.
7. **Criaturas nuevas de fantasía**, siempre pasando la regla del 15 % del informe de balance:
   - **Ghost (Fantasma):** flanker incorpóreo de vida media (2.500), velocidad 6/10, sueldo 700, daño cerca de 500. El 30 % de los golpes físicos le fallan; Fase (atraviesa muros 3 s cada 15 s, no puertas mágicas ni el Corazón); Toque helado (−30 % velocidad 4 s); Terror (enemigos de nivel menor a 5 en 3 tiles huyen 3 s, cada 30 s). No come ni duerme. Llega por el Cementerio con un cadáver de nivel 7 o más. Enemigo natural: Fallen Angel. Rango de poder entre el Dark Knight y el Fallen Angel.
   - **Fallen Angel (ángel caído):** combatiente de élite de alto nivel.
   - **Dragón:** criatura Élite única, una por jugador, muy cara y difícil de atraer.
8. **Posesión** de criaturas en tercera persona.

---

## 15. Decisiones abiertas

Claude Code debe elegir la opción más simple, marcarla [PROPUESTO] y anotarla en `docs/DUDAS.md` si las encuentra antes de que se decidan.

- ¿El Corazón debe poder repararse o regenerarse? (MVP: no.)
- ¿Mapa distinto para partidas de 2 jugadores? (MVP: mismo mapa, esquinas opuestas.)
- ¿Investigación en la Biblioteca antes o después de las trampas? (MVP-2.)
- ¿Hace falta una mecánica de remontada para quien va perdiendo? Decidir tras los primeros playtests.
- ¿Nombres propios para las criaturas base antes de publicar? Revisar junto con el nombre del juego.
- Valores finales de balance: se deciden con bots y playtests, nunca a ojo.
