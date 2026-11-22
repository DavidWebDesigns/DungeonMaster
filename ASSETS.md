# Dungeon Master: assets, criaturas y prompts de arte

Nov 18, 2026 · @Fractal

## Índice

Haz clic en una sección para saltar a ella y editarla ahí mismo.

- [0. Cómo usar este documento](#mn14gew80bk.71285)
- **Parte A · Datos de juego** (Claude Code los implementa)
  - [1. Roster de criaturas](#mn14gew80bk.72821)
  - [2. Estadísticas base](#mn14gew80bk.50823)
  - [3. Habilidades de combate](#mn14gew80bk.52902)
  - [4. Afinidades y convivencia](#mn14gew80bk.57002)
  - [5. Cámara de tortura](#mn14gew80bk.56836)
  - [6. Trampas: datos de juego](#mn14gew80bk.119105)
  - [7. Cómo llevar la Parte A a /data/mvp](#mn14gew80bk.86082)
- **Parte B · Assets 3D** (contrato con el cargador de modelos)
  - [8. Dirección de arte](#mn14gew80bk.65)
  - [9. Presupuesto técnico para navegador](#mn14gew80bk.1860)
  - [10. Lista de assets](#mn14gew80bk.3278)
  - [11. Salas](#mn14gew80bk.92391)
  - [12. Trampas: assets 3D](#mn14gew80bk.98440)
  - [13. Diseño visual de las criaturas](#mn14gew80bk.7984)
  - [14. De la imagen de referencia al .glb](#mn14gew80bk.28084)
- **Parte C · Prompts de imagen** (solo para el equipo de arte)
  - [15. Prompt maestro de estilo](#mn14gew80bk.10623)
  - [16. Prompts por criatura](#mn14gew80bk.14057): [Imp](#mn14gew80bk.14229) · [Goblin](#mn14gew80bk.15967) · [Troll](#mn14gew80bk.17627) · [Warlock](#mn14gew80bk.19360) · [Demonio de bilis](#mn14gew80bk.21038) · [Luciérnaga](#mn14gew80bk.64288) · [Salamandra](#mn14gew80bk.33969) · [Esqueleto](#mn14gew80bk.35718) · [Pícaro](#mn14gew80bk.67555) · [Torturadora](#mn14gew80bk.62088) · [Verdugo](#mn14gew80bk.39450) · [Elfo oscuro](#mn14gew80bk.65918) · [Bruja](#mn14gew80bk.37620) · [Vampiro](#mn14gew80bk.41233) · [Caballero negro](#mn14gew80bk.42966) · [Doncella](#mn14gew80bk.69179) · [Fantasma](#mn14gew80bk.22785) · [Ángel caído](#mn14gew80bk.24478) · [Dragón](#mn14gew80bk.26298)
  - [17. Prompts de trampas](#mn14gew80bk.102204): [Trampa de picos](#mn14gew80bk.103895) · [Trampa de piedra rodante](#mn14gew80bk.113616) · [Trampa de hielo](#mn14gew80bk.110872) · [Trampa de fuego](#mn14gew80bk.112223) · [Trampa eléctrica](#mn14gew80bk.109494) · [Paredes aplastantes](#mn14gew80bk.125451) · [Campana de alarma](#mn14gew80bk.102462) · [Fumarola venenosa](#mn14gew80bk.105313) · [Ballesta centinela](#mn14gew80bk.106712) · [Cepo de hierro](#mn14gew80bk.108138) · [Tótem del miedo](#mn14gew80bk.115087) · [Cofre trampa](#mn14gew80bk.116531)

## 0. Cómo usar este documento

**Claude Code: implementa la Parte A, respeta el contrato de la Parte B e ignora la Parte C.** Este documento amplía `docs/PLAN.md` para MVP-2 y lo que sigue; para MVP-1 manda el plan.

| Parte | Secciones | Contenido | Qué hace Claude Code |
| --- | --- | --- | --- |
| A. Datos de juego | 1 a 7 | Roster, estadísticas, habilidades, afinidades, Cámara de tortura y trampas | Llevarlo a `/data/mvp` y a la simulación, en la fase de cada criatura |
| B. Assets 3D | 8 a 14 | Dirección de arte, presupuesto técnico, lista de assets, salas, trampas, diseño visual de criaturas y exportación a .glb | Cumplir el contrato del cargador: `modelId`, nombres de animación, material `team` y presupuestos |
| C. Prompts de imagen | 15 a 17 | Prompts para generar referencias con IA y modelar en Blender | Nada: es material para el equipo de arte |

**Convenciones**

- Cada criatura y habilidad se nombra por su `id` en camelCase (`bileDemon`, `torturerBind`), igual que en `/data/mvp`. Los nombres en español son solo para leer.
- En la Parte A los números van con punto decimal y sin separador de miles, listos para JSON. Un porcentaje se guarda como fracción: 25 % = `0.25`.
- Unidades: distancias en tiles (1 tile = 1 m), tiempos en segundos, dinero en oro.
- **\[PROPUESTO\]** = valor inicial que vive en `/data`, nunca en el código, y se ajusta con partidas de bots (fase 4).
- Fases: MVP-1 solo incluye `imp`, `goblin`, `troll`, `warlock` y `bileDemon`, con su ataque básico. Todo lo demás se implementa en la fase que indica la sección 1, no antes.
- Si algo se contradice, los bloques JSON mandan sobre las tablas, y las tablas sobre el texto.

## 1. Roster de criaturas

**19 criaturas: 5 en MVP-1, 6 en MVP-2 y 8 después del MVP.** Van por fase y, dentro de cada fase, de menor a mayor amenaza; las secciones 2 y 3 siguen el mismo orden. Las formas de llegar marcadas **\[PROPUESTO\]** no están en el plan.

| id | Nombre | Fase | Rol | modelId | Cómo llega |
| --- | --- | --- | --- | --- | --- |
| imp | Imp | MVP-1 | Obrero: excava, reclama, mina, refuerza | creature\_imp | Hechizo `createImp` |
| goblin | Goblin | MVP-1 | Combatiente rápido de flanco | creature\_goblin | Portal, con `lair`; cupos por tiles de Guarida |
| troll | Troll | MVP-1 | Bloqueador lento y resistente | creature\_troll | Portal, con `lair`; 1 cupo por cada 10 goblins vivos y Guarida de nivel 10 |
| warlock | Warlock | MVP-1 | Atacante a distancia | creature\_warlock | Portal, con `library`; cupos por tiles de Biblioteca |
| bileDemon | Demonio de bilis | MVP-1 | Tanque pesado | creature\_bile\_demon | Portal, con `hatchery` y `trainingRoom` |
| firefly | Luciérnaga | MVP-2 | Exploradora voladora | creature\_firefly | Portal, con `lair` |
| salamander | Salamandra | Tanda salas | Flanqueadora que escupe fuego | creature\_salamander | Portal, con `workshop`; cupos por tiles de Taller |
| skeleton | Esqueleto | Tanda salas | Soldado no muerto, sin sueldo ni comida | creature\_skeleton | Portal, con `graveyard`; cupos por tiles de Cementerio (sin cama, sueldo ni comida) |
| rogue | Pícaro | MVP-2 | Ladrón y asesino invisible | creature\_rogue | Portal, con `treasury` de 25 tiles o más **\[PROPUESTO\]** |
| torturer | Torturadora | MVP-2 | Duelista de látigo; convierte prisioneros | creature\_torturer | Portal, con `tortureChamber`; cupos por tiles de Cámara |
| executioner | Verdugo | MVP-2 | Rematador; ejecuta a los prisioneros que se resisten | creature\_executioner | Portal, con `tortureChamber`; 1 cupo por cada 10 torturadoras vivas y Cámara de nivel 10 |
| darkElf | Elfo oscuro | Post-MVP | Tirador ágil a distancia | creature\_dark\_elf | Portal, con `trainingRoom` de 25 tiles o más **\[PROPUESTO\]** |
| witch | Bruja | Tanda salas | Apoyo: pociones y maldiciones | creature\_witch | Portal, con `library`; 1 cupo por cada 10 warlocks vivos y Biblioteca de nivel 10 |
| vampire | Vampiro | Tanda salas | Pensador de élite que drena vida | creature\_vampire | Portal, con `graveyard`; 1 cupo por cada 10 esqueletos vivos y Cementerio de nivel 10 |
| darkKnight | Caballero negro | Tanda salas | Bloqueador pesado de élite | creature\_dark\_knight | Portal, con `trainingRoom`; cupos por tiles de Sala de entrenamiento |
| maiden | Doncella | Post-MVP | Controladora con telarañas | creature\_maiden | Portal, con `prison` **\[PROPUESTO\]** |
| ghost | Fantasma | Post-MVP | Hostigador incorpóreo | creature\_ghost | Nace en el `graveyard` con un cadáver de nivel 7 o más |
| fallenAngel | Ángel caído | Tanda salas | Élite de asalto | creature\_fallen\_angel | Portal, con `temple`; cupos por tiles de Templo y **máximo 1** por jugador |
| dragon | Dragón | Post-MVP | Élite única, una por jugador | creature\_dragon | Portal, con cama de 2×2 libre y `treasury` de 50 tiles o más **\[PROPUESTO\]** |

Salas nuevas de la tanda de salas y cupos: `workshop` (Taller), `graveyard` (Cementerio) y `temple` (Templo); `tortureChamber` ya está en `rooms.json`. `prison` y `combatPit` siguen pendientes. Las reglas de cupos y la progresión de salas están en la sección 1.1.

### 1.1 Salas, progresión y cupos

**Cada sala construida habilita al Portal a invocar su criatura, con cupos; las salas fuertes cuestan más y exigen tener antes otras.** Todo vive en `rooms.json` y `creatures.json`; las cifras son **\[PROPUESTO\]**.

**Reglas de cupos y niveles de sala**

- **Nivel de sala:** una sala son tiles conectados del mismo tipo y su nivel es su número de tiles, de 1 a 10 (`maxTiles`, también en la Tesorería). El tile 11 pegado abre una sala nueva de nivel 1. Un rectángulo grande se reparte en salas de hasta 10 tiles; si desconectan una sala (ataque o reclamo), se parte en una sala por trozo. **Coste incremental:** el tile n de una sala cuesta `goldPerTile × 1,2^(n-1)` (`economy.roomCostGrowthPerTile`, +20 % por tile, redondeado por tile). Al ampliar una sala se continúa desde su tamaño y una sala nueva vuelve al precio base; vender devuelve el 50 % de lo que vale la sala hoy. Una sala de nivel 10 cuesta 5,2 veces lo que costaría a precio fijo (Guarida 7.787, Cámara de tortura 10.382, Templo 15.576). Dejar huecos entre salas sale más barato que una sola grande.
- **Cupos:** una especie puede tener tantas criaturas vivas como indique su sala: 1 cupo por cada `tilesPerSlot` tiles de ese tipo (Goblin 2, el resto 3), sumando todas las salas. Las que ya llegaron no se van si baja el cupo.
- **Criatura superior:** hacen falta **10 criaturas vivas de la especie base y una sala de ese tipo en nivel 10** (Troll por goblins y Guarida, Bruja por warlocks y Biblioteca, Vampiro por esqueletos y Cementerio, Verdugo por torturadoras y Cámara). 1 criatura superior por cada 10 de la base.
- **Guarida:** da camas (población neta de toda la mazmorra) y además cupos de Goblin. La criatura sin cama (Esqueleto) no la necesita.
- **Templo:** cupos de Ángel caído y `maxPerPlayer: 1`: nunca más de uno vivo. Además **da maná: 10 por segundo por cada tile** (`manaPerTilePerSecond`), que se suma al maná normal sin pasar por su tope.
- **Biblioteca de nivel 10** (10 tiles conectados): da **50 de maná cada 10 segundos** (`manaPulse*`), por cada Biblioteca de ese nivel.
- **Aspecto por nivel:** a medida que sube el nivel de una sala sus accesorios engordan y se alargan; desde el nivel 4 aparece una torre central, desde el 7 un anillo dorado y en el nivel 10 una joya encima.
- **Descanso en la Guarida:** una criatura que duerme (o se recupera tras huir) en su cama se cura el 3 % de su vida máxima cada 2,5 s.
- **Casino:** tras cobrar, las criaturas con sueldo van al Casino (1 asiento por cada 2 tiles) y se quedan 15 s: gastan el 40 % de su sueldo, que va entero a la Tesorería (`casinoHouseShare` 1; hasta donde quepa), y salen divertidas: 90 s de entrenamiento con +50 % de experiencia. Cupos: Bandido 1 por cada 3 tiles de Casino; el Asesino pide 10 bandidos vivos y un Casino de nivel 10. Todo en `rooms.json` (`casino*`).
- **Tiempos:** el Portal atrae una criatura cada 25 s (si hay cama libre y cupo) y el día de pago es cada 3 minutos.
- **Cerditos (Criadero):** cada tile de Criadero cría un cerdito cada 20 s, hasta 3 por cada criatura de la población máxima actual (el "N/M" del HUD). Una criatura con el 70 % de vida o menos va al Criadero, se come uno y recupera el 30 % de su vida máxima. Los cerditos se dibujan en el Criadero y el HUD lleva la cuenta (`pigletIntervalSeconds`, `pigletCapPerMaxCreature`, `pigletHealFraction`, `pigletEatBelowHpFraction`). Los pollos siguen quitando el hambre.
- **Combate:** una criatura que combate (o la han atacado hace menos de `combat.retaliationSeconds`) no se puede retirar del mapa con la mano (`IN_COMBAT`).
- El Criadero no invoca nada: solo produce pollos. El Demonio de bilis conserva su regla (Criadero + Sala de entrenamiento, sin cupo).

| Sala | Nivel | Coste por tile (mínimo) | Requiere tener antes | Invoca |
| --- | --- | --- | --- | --- |
| Tesorería | 1 | 100 (900) | — | — |
| Criadero | 1 | 150 (1.350) | — | Pollos |
| Guarida | 1 | 300 (1.200) | — | Goblin; Troll (por goblins) |
| Sala de entrenamiento | 2 | 300 (2.700) | — | Caballero negro |
| Biblioteca | 2 | 250 (2.250) | — | Warlock; Bruja (por warlocks) |
| Taller | 2 | 200 (1.800) | Sala de entrenamiento | Salamandra; trampas físicas |
| Cámara de tortura | 3 | 400 (3.600) | — | Torturadora; Verdugo (por torturadoras) |
| Cementerio | 3 | 350 (3.150) | Biblioteca | Esqueleto; Vampiro (por esqueletos) |
| Templo | 4 | 600 (5.400) | Cámara de tortura + Cementerio | Ángel caído (máximo 1) |
| Casino | 3 | 350 (3.150) | Sala de entrenamiento | Bandido; Asesino (por bandidos) |

Solo las salas nuevas llevan requisitos; las seis anteriores no, para que el inicio de la partida no cambie. Vender un requisito no destruye las salas que dependían de él.

Campos nuevos (sección 7): `rooms.json` → `requiresRooms`; `creatures.json` → `attraction.slots` (`{ "fromRoom": "graveyard", "tilesPerSlot": 3 }` o `{ "fromCreature": "skeleton", "unlockEvery": 3 }`), `attraction.maxPerPlayer` y `threat`.

## 2. Estadísticas base (nivel 1)

Las columnas usan los nombres de campo del esquema de `creatures.json`. `imp`, `goblin`, `troll`, `warlock`, `bileDemon` y, como provisionales, `torturer` y `executioner` ya están en `/data/mvp`; el resto es **\[PROPUESTO\]**. `threat` y `appetite` son campos nuevos (sección 7). `dps` es derivado (`damage / attackInterval`) y no se guarda.

| id | Nombre | Estado | threat | base.hp | base.damage | base.attackInterval | dps | base.range | base.speed | base.wage | appetite | base.lairTiles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| imp | Imp | Implementado | 1 | 600 | 15 | 1.0 | 15 | 1 | 2.5 | 0 | 0 | 0 |
| goblin | Goblin | Implementado | 2 | 1500 | 60 | 1.0 | 60 | 1 | 2.0 | 100 | 1 | 1 |
| troll | Troll | Implementado | 2 | 2500 | 90 | 1.2 | 75 | 1 | 1.6 | 150 | 3 | 1 |
| warlock | Warlock | Implementado | 2 | 1000 | 80 | 1.5 | 53.3 | 5 | 1.8 | 200 | 3 | 1 |
| bileDemon | Demonio de bilis | Implementado | 7 | 4000 | 120 | 1.5 | 80 | 1 | 1.2 | 300 | 6 | 2 |
| firefly | Luciérnaga | Después | 1 | 700 | 20 | 1.0 | 20 | 1 | 2.4 | 50 | 1 | 1 |
| salamander | Salamandra | Esta tanda | 3 | 1600 | 70 | 1.2 | 58.3 | 4 | 1.8 | 160 | 2 | 1 |
| skeleton | Esqueleto | Esta tanda | 3 | 1500 | 75 | 1.1 | 68.2 | 1 | 1.8 | 0 | 0 | 0 |
| bandit | Bandido | Implementado | 4 | 1700 | 80 | 0.9 | 88.9 | 1 | 2.0 | 220 | 2 | 1 |
| assassin | Asesino | Implementado | 7 | 2800 | 190 | 1.0 | 190 | 1 | 2.4 | 650 | 2 | 1 |
| rogue | Pícaro | Después | 4 | 1800 | 85 | 0.9 | 94.4 | 1 | 2.0 | 250 | 2 | 1 |
| torturer | Torturadora | Implementado (provisional) | 5 | 1200 | 70 | 1.2 | 58.3 | 1 | 2.0 | 120 | 2 | 1 |
| executioner | Verdugo | Implementado (provisional) | 5 | 3000 | 140 | 1.8 | 77.8 | 1 | 1.4 | 250 | 3 | 1 |
| darkElf | Elfo oscuro | Después | 2 | 1200 | 70 | 1.4 | 50 | 6 | 1.8 | 150 | 2 | 1 |
| witch | Bruja | Esta tanda | 4 | 1400 | 60 | 1.6 | 37.5 | 5 | 1.6 | 220 | 2 | 1 |
| vampire | Vampiro | Esta tanda | 6 | 2800 | 130 | 1.2 | 108.3 | 1 | 2.4 | 500 | 0 | 1 |
| darkKnight | Caballero negro | Esta tanda | 8 | 4200 | 200 | 1.6 | 125 | 1 | 1.6 | 600 | 3 | 1 |
| maiden | Doncella | Después | 8 | 3600 | 154 | 1.4 | 110 | 4 | 1.8 | 550 | 2 | 2 |
| ghost | Fantasma | Después | 8.5 | 2500 | 180 | 1.2 | 150 | 1 | 2.0 | 650 | 0 | 1 |
| fallenAngel | Ángel caído | Esta tanda | 9 | 5000 | 240 | 1.4 | 171.4 | 1.5 | 2.2 | 900 | 3 | 1 |
| dragon | Dragón | Después | 10 | 8000 | 350 | 1.8 | 194.4 | 1 | 1.6 | 1500 | 6 | 4 |

- **Torturadora y Verdugo:** los valores de esta tabla son los **implementados** (provisionales, de antes de este documento). La propuesta original era Torturadora 2200 de vida, 110 de daño, intervalo 1.0, alcance 2, sueldo 350 y Verdugo 160 de daño, velocidad 1.6 y sueldo 300; si se quieren recuperar, es un cambio solo de datos.
- **Estado:** *Implementado* = ya está en `/data/mvp`; *Esta tanda* = entra con la progresión de salas y cupos (sección 1.1); *Después* = fase posterior. El resto de los valores de las criaturas implementadas coinciden con `/data/mvp/creatures.json`.
- **Nivel:** vida, daño y sueldo se multiplican por 1 + 0,35 × (nivel − 1): ×2,4 en nivel 5 y ×4,15 en nivel 10. Velocidad, alcance y comida no cambian.
- **Velocidad:** tiles/s = 0,8 + 0,2 × la velocidad de 1 a 10 de la especificación, la misma regla que siguen las cifras del MVP.
- **Comida:** en MVP-1 toda criatura come un pollo por comida; esta columna entra en MVP-2. Esqueleto, Vampiro y Fantasma no comen pollos.
- **Fantasma:** como esquiva el 30 % de los golpes físicos, su vida efectiva ronda los 3.570.
- **Regla de balance:** entre criaturas de amenaza parecida, el índice de poder (vida × DPS) no puede superar al de otra en más de 15 % sin cobrar más sueldo.

### 2.1 Proyección por nivel (1 a 5)

Tope de nivel actual: 5 (`progression.maxLevel`). Vida, daño y sueldo × (1 + 0,35 × (nivel − 1)), redondeados hacia abajo. **Poder** = vida × DPS.

| id | Nivel 1 (vida / daño / sueldo) | Nivel 3 | Nivel 5 | Poder nivel 1 | Poder nivel 5 |
| --- | --- | --- | --- | --- | --- |
| imp | 600 / 15 / 0 | 1.020 / 25 / 0 | 1.440 / 36 / 0 | 9.000 | 51.840 |
| goblin | 1.500 / 60 / 100 | 2.550 / 102 / 170 | 3.600 / 144 / 240 | 90.000 | 518.400 |
| troll | 2.500 / 90 / 150 | 4.250 / 153 / 255 | 6.000 / 216 / 360 | 187.500 | 1.080.000 |
| warlock | 1.000 / 80 / 200 | 1.700 / 136 / 340 | 2.400 / 192 / 480 | 53.333 | 307.200 |
| bileDemon | 4.000 / 120 / 300 | 6.800 / 204 / 510 | 9.600 / 288 / 720 | 320.000 | 1.843.200 |
| salamander | 1.600 / 70 / 160 | 2.720 / 119 / 272 | 3.840 / 168 / 384 | 93.333 | 537.600 |
| skeleton | 1.500 / 75 / 0 | 2.550 / 127 / 0 | 3.600 / 180 / 0 | 102.272 | 589.090 |
| torturer | 1.200 / 70 / 120 | 2.040 / 119 / 204 | 2.880 / 168 / 288 | 70.000 | 403.200 |
| executioner | 3.000 / 140 / 250 | 5.100 / 238 / 425 | 7.200 / 336 / 600 | 233.333 | 1.344.000 |
| witch | 1.400 / 60 / 220 | 2.380 / 102 / 374 | 3.360 / 144 / 528 | 52.500 | 302.400 |
| vampire | 2.800 / 130 / 500 | 4.760 / 221 / 850 | 6.720 / 312 / 1.200 | 303.333 | 1.747.200 |
| darkKnight | 4.200 / 200 / 600 | 7.140 / 340 / 1.020 | 10.080 / 480 / 1.440 | 525.000 | 3.024.000 |
| fallenAngel | 5.000 / 240 / 900 | 8.500 / 408 / 1.530 | 12.000 / 576 / 2.160 | 857.142 | 4.937.142 |

**Lectura para el balance** (la regla del 15 % compara criaturas de amenaza parecida; el balance final sigue aplazado hasta tener el roster completo):

- **Amenaza 2:** el Troll (poder 187.500) supera al Goblin (90.000) en un 108 % y solo cobra un 50 % más; el Warlock es el más débil del grupo y el más caro (sueldo 200). Incumple la regla.
- **Amenaza 3:** el Esqueleto (102.272) supera a la Salamandra (93.333) en un 10 % y **no cobra sueldo ni come**: es la criatura con mejor relación coste-poder. Lo frenan el cupo (1 por Cementerio) y el coste del Cementerio.
- **Amenaza 5:** el Verdugo (233.333) triplica a la Torturadora implementada (70.000); con los valores originales del documento (2.200 de vida, 110 de daño) el cociente baja a 1,0.
- **Sueldos de élite:** el Ángel caído en nivel 5 cobra 2.160 por día de pago y el Caballero negro 1.440, con una Tesorería de 1.000 por tile. Un solo Ángel (máximo 1) ya pesa en la economía.
- **Ranking de poder en nivel 1:** Ángel caído 857k, Caballero 525k, Demonio de bilis 320k, Vampiro 303k, Verdugo 233k, Troll 188k, Esqueleto 102k, Salamandra 93k, Goblin 90k, Torturadora 70k, Warlock 53k, Bruja 52k.

## 3. Habilidades de combate

Una fila por habilidad, lista para un futuro `abilities.json`. En MVP-1 solo existe el ataque básico de la sección 2; las habilidades entran en MVP-2, y las de nivel 6 a 10 cuando se abra ese tope. `kind`: `active` (la IA de la criatura la lanza cuando no está en enfriamiento), `passive` (siempre activa desde su nivel) o `job` (trabajo fuera de combate). Vacío (—) = no aplica. Todo es **\[PROPUESTO\]**.

| creature | id | Nombre | kind | unlockLevel | cooldownSeconds | rangeTiles | radiusTiles | durationSeconds | Efecto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| imp | impWorker | Obrero | job | 1 | — | — | — | — | Excava, mina, reclama y refuerza |
| imp | impHaste | Prisa | active | 5 | 30 | — | — | 10 | +50 % de velocidad propia |
| imp | impTeleport | Teletransporte | active | 8 | 60 | — | — | — | Vuelve al Corazón al instante |
| goblin | goblinAmbush | Emboscada | passive | 1 | — | — | — | — | +25 % de daño contra un enemigo que ya pelea con otro |
| goblin | goblinDodge | Esquiva | passive | 5 | — | — | — | — | El 15 % de los golpes físicos le fallan |
| troll | trollStoneSkin | Piel de piedra | passive | 1 | — | — | — | — | −15 % de daño físico recibido |
| troll | trollStunBlow | Golpe aturdidor | active | 4 | 8 | 1 | — | 1 | Aturde al objetivo |
| troll | trollCraft | Herrero | job | 1 | — | — | — | — | Fabrica trampas y puertas en el Taller (MVP-2) |
| warlock | warlockSelfHeal | Curarse | active | 3 | 20 | — | — | — | +30 % de su vida máxima |
| warlock | warlockFireBomb | Bomba ígnea | active | 8 | 12 | 5 | 1.5 | — | Daño doble a todos los enemigos del área |
| warlock | warlockResearch | Investigador | job | 1 | — | — | — | — | Investiga en la Biblioteca (MVP-2) |
| bileDemon | bileDemonBellySlam | Barrigazo | passive | 1 | — | 1 | — | — | Cada tercer golpe empuja al objetivo 1 tile |
| bileDemon | bileDemonGasCloud | Nube de gas | active | 4 | 15 | — | 1.5 | 6 | Veneno de 20 por segundo alrededor suyo |
| bileDemon | bileDemonGasMissile | Proyectil de gas | active | 8 | 15 | 4 | 1.5 | 6 | La misma nube, lanzada a distancia |
| firefly | fireflyFlight | Vuelo | passive | 1 | — | — | — | — | Cruza agua y lava |
| firefly | fireflyScout | Exploradora | passive | 1 | — | — | 8 | — | Revela la niebla de guerra a su alrededor |
| firefly | fireflyWhirlwind | Torbellino | active | 8 | 12 | — | 1.5 | — | Empuja a los enemigos 2 tiles, sin daño |
| salamander | salamanderLavaborn | Hija de la lava | passive | 1 | — | — | — | — | Cruza la lava, es inmune al fuego y descansa junto a ella |
| salamander | salamanderFireball | Bola de fuego | active | 8 | 10 | 4 | 1 | — | Daño base a todos los enemigos del área |
| skeleton | skeletonUndead | No muerto | passive | 1 | — | — | — | — | Inmune a miedo, veneno y hambre |
| skeleton | skeletonReassemble | Rearmarse | passive | 1 | — | — | — | — | Una vez por vida, 25 % de volver con 30 % de vida al morir |
| rogue | rogueShadow | Sombra | passive | 1 | — | — | — | — | Invisible fuera de combate |
| rogue | rogueBackstab | Puñalada | passive | 1 | — | — | — | — | El primer golpe desde la invisibilidad hace daño doble |
| rogue | rogueLockpick | Forzar cerradura | active | 5 | — | 1 | — | 5 | Abre una puerta enemiga tras 5 s (MVP-2) |
| torturer | torturerConvert | Conversión | job | 1 | — | — | — | — | Convierte prisioneros en la Cámara de tortura (sección 5) |
| torturer | torturerEnjoysPain | Disfruta el dolor | passive | 1 | — | — | — | — | Cada bofetada le suma 3 de ánimo en vez de restar; recibir daño no le baja el ánimo |
| torturer | torturerBind | Atadura | active | 3 | 12 | 2 | — | 2 | Inmoviliza al objetivo |
| torturer | torturerShock | Descarga | active | 6 | 10 | 2 | 3 | — | Rayo de daño base que salta a 2 enemigos más dentro del radio |
| executioner | executionerExecutePrisoner | Ejecutar prisioneros | job | 1 | — | — | — | — | Ejecuta a los prisioneros que se resisten y da oro (sección 5) |
| executioner | executionerFinisher | Ejecución | passive | 1 | — | — | — | — | +50 % de daño a objetivos con menos del 30 % de vida |
| executioner | executionerIntimidate | Intimidar | passive | 4 | — | — | 2 | — | Los enemigos de nivel 3 o menos cerca de él hacen −15 % de daño |
| darkElf | darkElfKeepDistance | Distancia | passive | 1 | — | — | — | — | Intenta pelear a 4 tiles o más del enemigo |
| darkElf | darkElfGuidedBolt | Saeta guiada | active | 6 | 12 | 6 | — | — | Nunca falla y atraviesa al primer objetivo |
| witch | witchPotions | Boticaria | job | 1 | — | — | — | — | Prepara pociones en la Biblioteca |
| witch | witchSlowPotion | Poción de lentitud | active | 1 | 10 | 5 | 1.5 | 5 | −40 % de velocidad a los enemigos del área |
| witch | witchCurse | Maldición | active | 3 | 15 | 5 | — | 8 | −20 % de daño del objetivo |
| witch | witchBrew | Brebaje | active | 6 | 20 | — | 2 | — | Cura 20 % de la vida máxima a los aliados del área |
| vampire | vampireDrain | Drenar | passive | 1 | — | — | — | — | Se cura el 50 % del daño que hace |
| vampire | vampireUndying | Inmortal | passive | 1 | — | — | — | 60 | Con Cementerio, revive a los 60 s con un nivel menos |
| vampire | vampireSlow | Ralentizar | active | 4 | 10 | 3 | — | 5 | −30 % de velocidad al objetivo |
| vampire | vampireBats | Murciélagos | active | 6 | 20 | 4 | — | 2 | Intocable 2 s y reaparece hasta 4 tiles lejos |
| darkKnight | darkKnightGuard | Guardia | passive | 1 | — | — | — | — | −25 % de daño recibido si lleva 2 s sin moverse |
| darkKnight | darkKnightCharge | Carga | active | 3 | 12 | 5 | — | 1 | Corre hasta el objetivo y lo aturde |
| darkKnight | darkKnightTaunt | Provocar | active | 6 | 20 | — | 3 | 4 | Los enemigos del área solo pueden atacarlo a él |
| maiden | maidenWeb | Telaraña | passive | 1 | — | — | — | 2 | Su ataque básico ralentiza 20 % |
| maiden | maidenCocoon | Capullo | active | 4 | 15 | 4 | — | 3 | Inmoviliza al objetivo |
| maiden | maidenNest | Nido | active | 8 | 25 | 4 | 2 | 6 | −50 % de velocidad a los enemigos del área |
| ghost | ghostIncorporeal | Incorpóreo | passive | 1 | — | — | — | — | El 30 % de los golpes físicos le fallan |
| ghost | ghostChill | Toque helado | passive | 1 | — | — | — | 4 | Cada golpe ralentiza 30 % |
| ghost | ghostPhase | Fase | active | 1 | 15 | — | — | 3 | Atraviesa muros y trampas, pero no puertas mágicas ni el Corazón |
| ghost | ghostTerror | Terror | active | 4 | 30 | — | 3 | 3 | Los enemigos de nivel menor a 5 huyen |
| fallenAngel | fallenAngelFlight | Vuelo | passive | 1 | — | — | — | — | Cruza agua y lava |
| fallenAngel | fallenAngelDive | Picada | active | 1 | 10 | 4 | 1 | — | Salta y hace daño ×1.5 a los enemigos del área |
| fallenAngel | fallenAngelEmberHail | Granizo de brasas | active | 8 | 20 | 5 | 2 | 4 | 60 de daño por segundo en el área |
| fallenAngel | fallenAngelBoneLegion | Legión de huesos | active | 10 | 60 | — | — | 20 | Invoca 3 Esqueletos temporales |
| dragon | dragonScales | Escamas | passive | 1 | — | — | — | — | −30 % de daño de hechizos |
| dragon | dragonFireBreath | Aliento de fuego | active | 1 | 8 | 3 | — | — | Cono de 3 tiles; daño doble a todos dentro |
| dragon | dragonRoar | Rugido | active | 3 | 30 | — | 4 | 3 | Los enemigos de nivel 5 o menos huyen |

**Habilidades que entran en datos con la tanda de salas y cupos** (`abilities.json`; solo nivel de desbloqueo 1 a 5, el tope actual): `torturerEnjoysPain`, `torturerBind`, `executionerFinisher`, `executionerIntimidate`, `darkKnightGuard`, `darkKnightCharge`, `skeletonUndead`, `skeletonReassemble`, `vampireDrain`, `vampireUndying`, `vampireSlow`, `salamanderLavaborn`, `witchSlowPotion`, `witchCurse`, `fallenAngelFlight`, `fallenAngelDive` (16). Quedan en este documento para cuando se abra el tope de nivel: las de nivel 6 a 10 y los trabajos que necesitan Prisión o investigación (`torturerConvert`, `executionerExecutePrisoner`, `witchPotions`). `salamanderLavaborn` se implementa sin "descansa junto a la lava".

## 4. Afinidades y convivencia

**Las criaturas afines suben más rápido de nivel cuando están juntas; las rivales pierden ánimo y pueden pelearse.** El sistema entra en MVP-2 junto con la necesidad Compañía del modelo de ánimo (peso 15). Todas las cifras son **\[PROPUESTO\]**.

**Reglas**

- Cada especie tiene una lista de afines y otra de rivales, y las relaciones son mutuas.
- «Cerca» significa en la misma sala o guarida y a 3 tiles o menos.
- El Imp y el Esqueleto no tienen ánimo: reciben los bonus de afinidad pero las rivalidades no los afectan (sí molestan a sus rivales).

| Situación | Entre afines | Entre rivales |
| --- | --- | --- |
| Entrenar juntas (Sala de entrenamiento o Foso de combate) | +20 % de XP | — |
| Combatir juntas (a 3 tiles o menos) | +10 % de daño y +20 % de XP de combate | — |
| Compartir guarida o sala de trabajo | Compañía +0,5 (unos +7,5 puntos de ánimo objetivo) | Compañía −1 (unos −15 puntos de ánimo objetivo) |
| Vivir en la misma mazmorra, lejos | — | Compañía −0,25 (unos −4 puntos) |
| Ánimo bajo 40 estando cerca | — | Cada 10 s, 20 % de probabilidad de pelea |

- **Sin acumulación:** varios afines cerca dan el mismo bonus que uno; la Compañía se limita entre −1 y +0,5.
- **Peleas:** duran hasta que una de las dos baja al 50 % de su vida (nadie muere); ambas pierden 10 de ánimo. El jugador las separa recogiendo a una con la mano.
- **Gestionar la convivencia es parte del juego:** construir guaridas separadas para rivales cuesta oro y espacio, pero evita peleas.

**Pares de afinidad y rivalidad (todos mutuos)**

| type | a | b | Motivo |
| --- | --- | --- | --- |
| affinity | goblin | troll | Camaradas de fuerza bruta |
| affinity | goblin | salamander | Les gusta entrenar y apostar |
| affinity | troll | executioner | Trabajadores rudos |
| affinity | warlock | witch | Comparten la Biblioteca |
| affinity | bileDemon | salamander | Criaturas del calor |
| affinity | firefly | rogue | Exploradores |
| affinity | salamander | dragon | Aman el fuego |
| affinity | skeleton | vampire | No muertos |
| affinity | skeleton | ghost | No muertos |
| affinity | rogue | darkElf | Sigilo |
| affinity | torturer | executioner | Equipo de la Cámara de tortura |
| affinity | darkElf | maiden | Cazadores de las profundidades |
| affinity | witch | vampire | Magia oscura |
| affinity | vampire | ghost | No muertos |
| affinity | darkKnight | fallenAngel | Guerreros de élite |
| rivalry | goblin | darkElf | Odio ancestral |
| rivalry | troll | rogue | El Pícaro le roba herramientas |
| rivalry | warlock | vampire | El Vampiro codicia sus secretos |
| rivalry | bileDemon | skeleton | Los huesos le parecen comida sin carne |
| rivalry | firefly | witch | La Bruja las atrapa en frascos |
| rivalry | salamander | maiden | El fuego quema las telarañas |
| rivalry | rogue | executioner | El Verdugo persigue ladrones |
| rivalry | torturer | maiden | Compiten por los prisioneros |
| rivalry | darkKnight | dragon | Cazador de dragones |
| rivalry | ghost | fallenAngel | El ángel desprecia a los espíritus atados |

`imp` no tiene afinidades ni rivalidades. Toda otra criatura tiene al menos un rival, como exige la regla de criaturas nuevas del plan.

**Parámetros** (futuro `data/mvp/affinity.json`; si difieren de la tabla de reglas, manda este bloque):

```json
{
  "combatRadiusTiles": 3,
  "sameRoomRadiusTiles": 3,
  "bonusesStack": false,
  "liked": {
    "trainXpBonus": 0.2,
    "combatDamageBonus": 0.1,
    "combatXpBonus": 0.2,
    "companyNear": 0.5
  },
  "rival": {
    "companyInDungeon": -0.25,
    "companyNear": -1,
    "fight": {
      "moodBelow": 40,
      "checkEverySeconds": 10,
      "chance": 0.2,
      "stopAtHpFraction": 0.5,
      "moodPenalty": 10
    }
  },
  "companyNeed": { "weight": 15, "min": -1, "max": 0.5 }
}
```

## 5. Cámara de tortura: conversión y ejecución (MVP-2)

La Torturadora convierte prisioneros y el Verdugo se encarga de los que se resisten; trabajar juntos les da bonus de afinidad.

&#91;embedded content: Cámara de tortura · conversión o ejecución\]

Cada tirada convierte con una probabilidad de 10 % + 5 % × nivel de la Torturadora − 5 % × nivel del prisionero, con un mínimo de 5 % **\[PROPUESTO\]**. Una ejecución da 100 de oro por nivel del prisionero y deja su cadáver para el Cementerio, donde nacen Vampiros y Fantasmas.

**Parámetros** (futuro bloque `tortureChamber` de `rooms.json`):

```json
{
  "attemptEverySeconds": 10,
  "conversionChance": {
    "base": 0.1,
    "perTorturerLevel": 0.05,
    "perPrisonerLevel": -0.05,
    "min": 0.05
  },
  "failsToResist": 3,
  "resetFailsWhenTorturerChanges": true,
  "executionGoldPerPrisonerLevel": 100,
  "executionLeavesCorpse": true,
  "convertedStartMood": 40
}
```

## 6. Trampas: datos de juego (MVP-2)

**Hay dos familias: las físicas se recargan sin límite pero tienen durabilidad y los enemigos pueden romperlas a golpes; las elementales no se pueden atacar, pero solo sirven 5 veces.** Cada trampa tiene su propio coste y su propio tiempo de recarga. Las 6 trampas base entran en MVP-2; las 6 opcionales son propuesta para después. Todas las cifras son **\[PROPUESTO\]**.

**Reglas**

- Toda trampa se encarga en el Taller (`goldCost` y `buildSeconds`) y un Imp la lleva a un tile reclamado propio.
- Tras dispararse queda inactiva durante `cooldownSeconds`.
- **Físicas** (`physical`): tienen `hp` y pierden `wearPerTrigger` en cada disparo. Una vez revelada, los enemigos que pasan a su lado la atacan como a una sala cuando no ven criaturas enemigas cerca. Con `hp` en 0 se destruye; los Imps propios la reparan (50 de vida por segundo).
- **Elementales** (`elemental`): tienen `uses` = 5 y también `hp` (900, 900 y 1.000 en la implementación): una vez reveladas se pueden atacar y reparar igual que las físicas, pero reparar no devuelve usos. Al gastar el quinto uso se consumen y el tile queda libre.
- Los rivales no ven una trampa hasta su primer disparo o hasta que la detecta un Pícaro o un Troll enemigo a 2 tiles.
- Paredes aplastantes solo se colocan en un tile con muro a dos lados opuestos (un pasillo de 1 tile).

| id | Nombre | Fase | family | goldCost | buildSeconds | trigger | cooldownSeconds | uses | hp | damage | Efecto |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| spikeTrap | Trampa de picos | MVP-2 | physical | 300 | 20 | step | 6 | — | 1200 | 350 | Golpe a quien la pisa |
| boulderTrap | Trampa de piedra rodante | MVP-2 | physical | 600 | 40 | lineOfSight 8 | 30 | — | 1800 | 800 | La roca rueda en línea recta y daña a todos hasta chocar con un muro |
| frostTrap | Trampa de hielo | MVP-2 | elemental | 450 | 30 | step | 12 | 5 | — | 150 | Congela 3 s a los enemigos en 1.5 tiles |
| fireTrap | Trampa de fuego | MVP-2 | elemental | 500 | 30 | proximity 3 | 10 | 5 | — | 360 | Cono de fuego de 3 tiles: 120 por segundo durante 3 s |
| lightningTrap | Trampa eléctrica | MVP-2 | elemental | 650 | 35 | proximity 4 | 14 | 5 | — | 300 | Rayo que salta a 3 enemigos; cada salto hace 25 % menos |
| crushingWalls | Paredes aplastantes | MVP-2 | physical | 800 | 50 | step | 15 | — | 2500 | 1200 | Dos muros con púas se cierran sobre el tile |
| alarmTrap | Campana de alarma | Opcional | physical | 150 | 10 | proximity 3 | 20 | — | 600 | 0 | Llama a las criaturas propias que estén a 8 tiles |
| gasTrap | Fumarola venenosa | Opcional | elemental | 400 | 25 | step | 15 | 5 | — | 150 | Veneno de 25 por segundo en 2 tiles durante 6 s |
| sentryTrap | Ballesta centinela | Opcional | physical | 550 | 35 | lineOfSight 5 | 2 | — | 1500 | 90 | Un virote cada 2 s mientras haya objetivo |
| snareTrap | Cepo de hierro | Opcional | physical | 250 | 15 | step | 8 | — | 1000 | 100 | Inmoviliza 3 s |
| fearTrap | Tótem del miedo | Opcional | elemental | 500 | 30 | proximity 3 | 20 | 5 | — | 0 | Los enemigos de nivel 4 o menos huyen 4 s |
| mimicChest | Cofre trampa | Opcional | physical | 400 | 25 | interact | 12 | — | 1400 | 250 | Muerde e inmoviliza 2 s; atrae a los Pícaros enemigos |

`trigger`: `step` = un enemigo pisa el tile; `proximity N` = un enemigo a N tiles o menos; `lineOfSight N` = un enemigo visible en línea recta a N tiles o menos; `interact` = un enemigo intenta abrirla.

**Requisitos de salas (progresión):** las trampas **físicas** (`spikeTrap`, `boulderTrap`, `crushingWalls`) exigen tener un **Taller**; las **elementales** (`frostTrap`, `fireTrap`, `lightningTrap`) exigen Taller, **Cámara de tortura** y **Biblioteca**. Es el campo `requiresRooms` (lista) de `traps.json`, que sustituye al `requiresRoom` único.

**Parámetros comunes** (futuro bloque `rules` de `traps.json`):

```json
{
  "physical": {
    "attackableWhenRevealed": true,
    "repairableByImps": true,
    "impRepairHpPerSecond": 50
  },
  "elemental": {
    "uses": 5,
    "attackable": false,
    "removedWhenDepleted": true
  },
  "hiddenUntilFirstTrigger": true,
  "detectedBy": ["rogue", "troll"],
  "detectionRadiusTiles": 2,
  "sellRefundFraction": 0.5
}
```

### 6.1 Puertas (familia `door`)

Se construyen como una trampa (suelo propio, un Imp las levanta, se venden por la mitad, los Imps las reparan a 50 hp/s) pero **no se disparan**. Una puerta construida deja pasar a su dueño (criaturas e Imps) y **bloquea a todos los demás**; los enemigos la atacan hasta romperla y entonces siguen su camino. Nace revelada: un rival la ve en cuanto ve su tile. Mientras está sin terminar no cierra el paso.

| Puerta | Oro | Construir | Vida | Requiere |
|---|---|---|---|---|
| Puerta básica (`basicDoor`, tecla **O**) | 250 | 15 s | 1.500 | nada |
| Puerta reforzada (`reinforcedDoor`, tecla **I**) | 600 | 30 s | 4.000 | Taller |

## 7. Cómo llevar la Parte A a `/data/mvp`

**Los cambios son aditivos: los datos del MVP-1 siguen validando y lo nuevo entra como campos y archivos opcionales hasta MVP-2.**

1. `creatures.json`: añadir a cada criatura `threat`, `appetite` y `abilities` (ids de la sección 3), más `affinities` (sus afines de la sección 4). El campo `enemies` ya existe y recibe sus rivales.
2. `abilities.json` (nuevo): una entrada por fila de la sección 3, con un `effect` tipado como los hechizos de `spells.json`.
3. `affinity.json` (nuevo): el bloque JSON de la sección 4. Lo mismo para traps.json (nuevo), con la tabla y las reglas de la sección 6.
4. `rooms.json`: salas `prison` y `tortureChamber`, esta última con el bloque JSON de la sección 5.
5. Esquemas zod: los campos nuevos son opcionales en MVP-1 y obligatorios desde MVP-2.
6. `validateDataSet`: afinidades y rivalidades mutuas; ninguna pareja afín y rival a la vez; toda criatura salvo `imp` con al menos un rival; cada habilidad existe y pertenece a su criatura; `unlockLevel` no supera `progression.maxLevel` de la fase activa; toda trampa física lleva hp y toda elemental lleva uses.
7. Pruebas: una por regla, rompiendo una copia de los datos como hace `dataSet.test.ts`.
8. Progresión y cupos (sección 1.1): `rooms.json` → `requiresRooms`; `creatures.json` → `attraction.slots`, `attraction.maxPerPlayer` y `threat`; `traps.json` → `requiresRooms`, `family`, `trigger`, `hp` o `uses`. La validación comprueba que las referencias existen, que no hay ciclos de requisitos y que una criatura sin cama exige una sala que no sea inicial.

Así quedan los campos nuevos de una criatura (el resto no cambia):

```json
{
  "id": "goblin",
  "threat": 2,
  "appetite": 1,
  "abilities": ["goblinAmbush", "goblinDodge"],
  "affinities": ["troll", "salamander"],
  "enemies": ["darkElf"]
}
```

Y una entrada de `abilities.json`:

```json
{
  "id": "torturerBind",
  "creature": "torturer",
  "kind": "active",
  "unlockLevel": 3,
  "cooldownSeconds": 12,
  "rangeTiles": 2,
  "radiusTiles": null,
  "durationSeconds": 2,
  "effect": { "type": "root" }
}
```

**Prompt sugerido** cuando este documento esté en el repositorio como `docs/CRIATURAS.md`:

```text
Lee docs/CRIATURAS.md, Parte A. Estamos empezando MVP-2: propón los cambios de esquema,
los archivos JSON nuevos y las pruebas de validación de la sección 6. Implementa solo las
criaturas de fase MVP-1 y MVP-2. Espera mi confirmación antes de escribir código.
```

## 8. Dirección de arte

Dungeon Master usa **low poly estilizado con texturas pintadas a mano**, en clave dark fantasy con humor negro: mazmorras oscuras iluminadas por antorchas y criaturas grotescas pero simpáticas, con siluetas que se leen desde la cámara isométrica alta.

- **Silueta primero.** En pantalla una criatura mide 40 a 80 píxeles. Cabeza, manos y arma grandes; proporciones caricaturescas (cabeza de 1/3 a 1/4 del cuerpo).
- **Pocas caras, mucho carácter.** Facetas planas visibles, sin suavizado. El detalle va pintado en la textura, no modelado.
- **Antorcha contra sombra fría.** Luz principal ámbar, relleno azul violeta y luz de contorno para separar a la criatura del suelo. Oscuro, pero el jugador siempre ve el suelo.
- **Color que comunica.** Base de tierra y piedra desaturada; los colores saturados se reservan para lo que importa: oro, maná, lava, veneno y el color de equipo.
- **Zona de color de equipo.** Cada criatura, muro reforzado, suelo reclamado y sala tiene una zona gris neutra (tela, estandarte, gema) que el motor tiñe con el color del jugador. El resto del modelo evita rojo, azul, verde o amarillo puros.
- **Humor oscuro, sin gore.** Colmillos, cuernos, harapos y cicatrices sí; sangre y vísceras no.
- **Diseños propios.** Inspirados en el género, no copias. Los prompts no nombran juegos existentes, para que la IA no reproduzca personajes con dueño (regla del CLAUDE.md).

**Paleta base**

| Rol | Color | Hex |
| --- | --- | --- |
| Fondo y sombra profunda | Piedra casi negra | #2B2A30 |
| Tierra | Marrón apagado | #5A4636 |
| Piedra | Gris azulado | #4A5560 |
| Luz de antorcha | Ámbar | #F2A541 |
| Sombra fría y contorno | Azul violeta | #2E3A5C |
| Oro | Amarillo brillante | #F5C542 |
| Maná | Cian | #3FC7E8 |
| Lava y fuego | Naranja | #FF6A1F |
| Veneno y bilis | Verde ácido | #9BD43A |
| Zona de equipo (antes de teñir) | Gris neutro | #9A9A9A |

## 9. Presupuesto técnico para navegador

El objetivo es 60 fps en un portátil medio con 4 jugadores y unas 800 entidades: **menos de 400.000 triángulos y 150 draw calls en pantalla**. La cámara rara vez ve más de un cuarto del mapa, y lo lejano usa LOD1.

| Tipo de asset | Triángulos LOD0 | LOD1 | Textura | Huesos | Peso .glb |
| --- | --- | --- | --- | --- | --- |
| Tile de terreno | 12–150 | — | Atlas compartido 1024² | 0 | < 20 KB |
| Criatura pequeña (Imp, Luciérnaga) | 400–700 | 200–350 | 256² | ≤ 20 | < 150 KB |
| Criatura media (Goblin, Warlock, Troll, Elfo oscuro, Salamandra, Esqueleto, Pícaro, Bruja, Torturadora, Verdugo, Vampiro, Fantasma) | 800–1.500 | 400–700 | 512² | ≤ 30 | < 300 KB |
| Criatura grande (Demonio de bilis, Caballero negro, Doncella, Ángel caído) | 1.500–2.500 | 700–1.200 | 512² | ≤ 35 | < 400 KB |
| Élite única (Dragón) | 3.000–4.500 | 1.500–2.000 | 1024² | ≤ 45 | < 700 KB |
| Corazón y Portal | 1.500–3.000 | — | 512² | 0–8 | < 300 KB |
| Prop de sala (por tile) | 100–500 | — | Atlas compartido | 0 | < 50 KB |
| Mano del Guardián | 800–1.200 | — | 512² | ≤ 20 | < 200 KB |

- **Un material por modelo** (dos si lleva emisivo o zona de equipo). Solo color base y emisivo: sin mapas metálicos ni de rugosidad; el material toon compartido del motor pone la luz.
- **Texturas en KTX2 con mipmaps**, comprimidas con gltf-transform. Terreno y props comparten un atlas de paleta para dibujarse en pocas llamadas.
- **Animaciones a 24–30 fps**, bucles cortos (idle de 2 a 3 s).
- **Luces reales máximo 8 visibles.** Antorchas lejanas, lava y velas brillan solo con emisivo.
- **Escala: 1 tile = 1 metro.** Origen en la base del modelo.

## 10. Lista de assets

El MVP necesita unos 45 assets. **Prioridad 1** es la primera tanda de la fase 6 (reemplaza los placeholders del Imp, el Goblin y el Corazón, además del terreno y la mano); **2** completa el MVP; **3** llega después. Los `modelId` de salas y criaturas ya existen en `/data/mvp`; los de terreno, props y efectos son nuevos y van al `assetManifest.json`.

**Terreno** (bloques de 1×1 m dibujados con instancing)

| modelId | Asset | Prioridad | Triángulos | Estados | Notas |
| --- | --- | --- | --- | --- | --- |
| tile\_rock | Roca sólida | 1 | 40–120 | — | Un poco más alta que la tierra para leerse como indestructible; 3 variantes |
| tile\_earth | Tierra | 1 | 40–120 | Intacta, grieta 1, grieta 2 | Las grietas son cambio de textura, no geometría; 3 variantes |
| tile\_gold\_vein | Veta de oro | 1 | 60–150 | Llena, media, casi agotada | Pepitas con emisivo suave, visibles en la oscuridad |
| tile\_floor\_neutral | Suelo sin reclamar | 1 | 2–12 | — | Tierra apisonada con escombros pintados |
| tile\_floor\_claimed | Suelo reclamado | 1 | 2–12 | Animación de reclamo (shader) | Losas con emblema en color de equipo |
| tile\_wall\_reinforced | Muro reforzado I | 2 | 80–150 | — | Mampostería con franja de color de equipo |
| tile\_wall\_reinforced2 | Muro reforzado II | 2 | 80–150 | — | Igual que el I, más oscuro y alto, con remaches; se ve distinto a simple vista |
| tile\_water | Agua | 2 | 2 | — | Plano con desplazamiento de UV, azul verdoso oscuro |
| tile\_lava | Lava | 2 | 2 | — | Plano emisivo con desplazamiento de UV; brilla sin luz real |

**Props sueltos (las salas están en la sección 11)**

| modelId | Asset | Prioridad | Triángulos | Estados | Notas |
| --- | --- | --- | --- | --- | --- |
| prop\_torch | Antorcha de pared | 1 | 50–100 | Llama animada | Llama con shader o sprite; solo las cercanas llevan luz real |
| prop\_chicken | Pollo | 2 | 150–250 | Caminar, picotear, ser agarrado | Muchas instancias: solo colores por vértice, sin textura |
| prop\_rally\_banner | Estandarte de llamada a las armas | 2 | 100–200 | Ondear | Tela en color de equipo |
| prop\_gold\_drop | Monedas sueltas | 2 | 50–100 | — | Oro que suelta una criatura al morir |

**Mano del Guardián y efectos**

| modelId | Asset | Prioridad | Técnica | Notas |
| --- | --- | --- | --- | --- |
| hand\_keeper | Mano del Guardián | 1 | Modelo con huesos (800–1.200 triángulos) | Guantelete de garras de hierro oscuro con runas en color de equipo. Animaciones: idle, agarrar, sostener, abofetear, soltar, señalar |
| vfx\_dig\_debris | Polvo y piedras al excavar | 1 | Partículas | Dos etapas, al agrietar y al romper |
| vfx\_gold\_sparkle | Monedas y destellos de oro | 1 | Partículas | Al minar y al llegar oro a la Tesorería |
| vfx\_slap | Impacto de bofetada | 1 | Partículas y número flotante | Estrellas cortas y «+velocidad» |
| vfx\_drop\_dust | Polvo al soltar | 2 | Partículas | Al soltar una criatura desde la mano |
| vfx\_lightning | Rayo | 2 | Malla de cinta y partículas | Destello breve y chispas |
| vfx\_heal | Curar | 2 | Partículas | Espirales verdes ascendentes |
| vfx\_haste | Acelerar | 2 | Estela y partículas | Estela cian detrás de la criatura |
| vfx\_levelup | Subida de nivel | 2 | Anillo y partículas | Destello dorado |
| vfx\_mood\_cloud | Nube de enfado | 2 | Sprite animado | Nube gris; relámpagos si está furiosa |
| vfx\_death | Muerte | 2 | Disolución por shader | La criatura se desvanece en humo |
| vfx\_portal\_arrival | Llegada por el Portal | 2 | Partículas | Remolino y destello |
| vfx\_heart\_hit | Golpe al Corazón | 1 | Partículas y vibración de cámara | Pulso rojo en el borde de la pantalla |

Todas las partículas comparten un atlas de sprites de 1024².

**Interfaz y audio**

| ID | Contenido | Prioridad | Formato |
| --- | --- | --- | --- |
| ui\_icons\_rooms | 7 iconos de salas | 1 | SVG o atlas PNG de 64–128 px |
| ui\_icons\_spells | 5 iconos de hechizos | 1 | SVG o atlas PNG de 64–128 px |
| ui\_resources | Oro, maná, temporizador del día de pago | 1 | SVG |
| ui\_mood | 6 iconos de banda de ánimo | 2 | SVG |
| ui\_portraits | Retratos de las 5 criaturas del MVP | 2 | PNG 128², renderizados desde los modelos |
| sfx\_core | Excavar, bofetada, monedas, campanilla de pago, alarma del Corazón, subir nivel, muerte | 1 | .ogg mono, menos de 50 KB cada uno |
| sfx\_voices | 2–3 gruñidos cortos por criatura | 2 | .ogg mono |
| music\_ambient | Pista de calma y pista de combate | 2 | .ogg estéreo en bucle |

## 11. Salas

**Las 16 salas se arman con piezas reutilizables por tile, así una sala de cualquier tamaño se dibuja con pocos modelos.** Las del MVP-1 van primero; el resto llega con su fase.

**Regla de construcción** (contrato con el cargador)

- `room_<sala>_floor`: tile de suelo propio de la sala, 1×1 y 2–12 triángulos, en el atlas compartido. Los tiles del borde usan la variante `_edge`, con una franja en color de equipo.
- `room_<sala>_prop_<nombre>`: props que se reparten a razón de uno cada N tiles, dejando libre un pasillo.
- `room_<sala>_center`: pieza central opcional, centrada, que aparece cuando la sala mide 3×3 o más.
- Los estados cambian por textura, shader o animación del prop, no con modelos distintos (salvo los montones de oro).
- El prefijo es el `modelId` que ya tiene la sala en `rooms.json` (`room_heart`, `room_training`…); las salas nuevas siguen el mismo patrón.

| id | Sala | Fase | Suelo | Props (uno cada N tiles) | Pieza central (3×3 o más) | Estados y animaciones | Triángulos | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| heart | Corazón de la Mazmorra | MVP-1, prioridad 1 | Losas de obsidiana con runas en color de equipo | — | Núcleo pulsante sobre pedestal; siempre 3×3 | Latido, dañado, destruido | 1.500–3.000 | Late más rápido al recibir daño |
| portal | Portal | MVP-1, prioridad 1 | Piedra antigua agrietada | — | Arco de piedra con vórtice (shader); siempre 3×3 | Remolino, llegada de criatura | 1.000–2.000 | El vórtice brilla en color de equipo |
| treasury | Tesorería | MVP-1, prioridad 1 | Losas con borde dorado | Montón de oro, 1 por tile | — | Vacío, 1/3, 2/3, lleno | 200–400 por tile | El montón crece con el oro guardado en ese tile |
| lair | Guarida | MVP-1, prioridad 2 | Tierra cubierta de paja | Cama de paja y pieles, 1 por criatura | — | Vacía, ocupada | 150–300 por cama | Cama de 2 tiles para Demonio de bilis y Doncella; de 2×2 para el Dragón |
| hatchery | Criadero | MVP-1, prioridad 2 | Tierra con paja y plumas | Comedero o gallinero, 1 cada 3 tiles | — | Pollos caminando y picoteando | 100–300 por prop | Los pollos son `prop_chicken`, instancias aparte |
| trainingRoom | Sala de entrenamiento | MVP-1, prioridad 2 | Tablones con marcas de golpes | Maniquí de paja o diana, 1 cada 2 tiles | Armero con armas de práctica | Maniquí golpeado | 200–400 por prop | Un puesto por criatura entrenando |
| library | Biblioteca | MVP-1, prioridad 2 | Alfombra raída sobre piedra | Estantería, 1 cada 2 tiles | Atril con un libro flotante | Velas parpadeando, páginas pasando | 300–500 por prop | Velas emisivas, sin luz real |
| workshop | Taller | MVP-2 | Piedra con hollín | Yunque o banco de trabajo, 1 cada 2 tiles | Forja con fuego | Chispas al martillar, forja encendida | 300–600 por prop | Fabrica trampas y puertas |
| prison | Prisión | MVP-2 | Piedra húmeda con rejillas | Celda con barrotes, 1 por tile | — | Vacía, ocupada, puerta abierta | 150–300 por celda | Barrotes como planos con recorte alfa para ahorrar triángulos |
| tortureChamber | Cámara de tortura | MVP-2 | Losas oscuras con argollas | Potro o cadenas colgantes, 1 cada 3 tiles | Rueda grande con manivela | Rueda girando, brasero encendido | 300–600 por prop | Sin sangre ni víctimas a la vista |
| graveyard | Cementerio | Post-MVP | Tierra removida con niebla baja | Lápida o tumba, 1 por tile | Cripta | Niebla, tumba que se abre al nacer un no muerto | 100–300 por lápida | La cripta también sirve de cama al Fantasma |
| combatPit | Foso de combate | Post-MVP | Arena hundida medio tile | Poste con cadenas o estacas, en el borde | Arena central marcada | Polvo al pelear | 200–400 por prop | — |
| temple | Templo | Post-MVP | Mosaico oscuro con símbolos inventados | Columna o brasero, 1 cada 3 tiles | Altar con estatua demoníaca y pila de sacrificios | La pila brilla al sacrificar | 300–800 por prop | Símbolos propios, ninguno de una religión real |
| casino | Casino | Post-MVP | Alfombra vinotinto con monedas pintadas | Mesa de dados o ruleta, 1 cada 2 tiles | Rueda de la fortuna con calaveras | Ruleta girando, monedas saltando | 300–600 por prop | Recicla oro y sube el ánimo |
| guardRoom | Sala de guardia | Post-MVP | Piedra con marcas de botas | Puesto con lanza, escudo y brasero, 1 cada 2 tiles | Torre de vigía baja | Brasero encendido | 200–400 por prop | Su función de juego aún no está definida en el plan |
| woodenBridge, stoneBridge | Puentes de madera y de piedra | Post-MVP | Tablones o losas, 1 por tile, sobre agua o lava | — | — | La madera arde sobre la lava | 50–150 por tile | La lava quema la madera; la piedra resiste |

Costes, tamaños mínimos, requisitos y cupos de las salas nuevas (Taller, Cementerio y Templo) están en la sección 1.1; los de las demás, en `rooms.json`. Las trampas que fabrica el Taller están en las secciones 6 (datos) y 12 (assets).

## 12. Trampas: assets 3D

**12 trampas de 1×1 tile que el Taller fabrica y los Imps colocan: las 6 base entran en MVP-2 y las 6 opcionales son propuesta para después.** Sus cifras de juego (coste, recarga, usos, durabilidad y daño) están en la sección 6.

**Reglas de los assets** (contrato con el cargador)

- `modelId` = `trap_<nombre>` en snake\_case, como las criaturas (`trap_spike`). Cada trampa cabe en 1 tile, con el origen en el centro de la base y 1,5 m de altura máxima (las torres llegan a 2 m).
- Animaciones estándar: `idle`, `trigger`, `reload` y `destroyed`. Si falta una, el cargador usa `idle`.
- Los rivales no la ven hasta que se dispara o la detecta un Pícaro; su dueño la ve con un shader translúcido al 50 %. El estado oculto no necesita un modelo aparte.
- Zona de equipo: una runa o gema pequeña en gris #9A9A9A, en el material `team`.
- Todas comparten un atlas de 512² (hierro, madera, hueso y piedra); los efectos usan el atlas de partículas de la sección 10.
- Mientras un Imp la transporta, cualquier trampa se muestra como `prop_trap_crate`: una caja de madera con herrajes y la runa de la trampa pintada.

**Estados según la familia.** Las físicas suman `damaged` (textura agrietada por debajo del 50 % de `hp`) y `destroyed`. Las elementales llevan 5 runas de carga que se apagan una por uso, con el emisivo controlado por shader y sin modelos extra, y un estado `depleted` antes de desaparecer.

| id | modelId | Trampa | Fase | family | Modelo | Estados y animaciones | Efectos visuales | Triángulos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| spikeTrap | trap\_spike | Trampa de picos | MVP-2 | physical | Placa de hierro en el suelo con estacas que suben | Oculta, picos arriba, recargando, dañada, destruida | Polvo y chispas | 150–300 |
| boulderTrap | trap\_boulder | Trampa de piedra rodante | MVP-2 | physical | Roca facetada sobre un soporte de madera con palanca; la roca es un modelo aparte que rueda | Lista, rodando, sin roca (recargando), dañada, destruida | Polvo y escombros | 200–350 |
| frostTrap | trap\_frost | Trampa de hielo | MVP-2 | elemental | Cristal de hielo sobre un pedestal con 5 runas de carga | Brillando, estallando, recargando, agotada | Esquirlas de hielo y vaho | 150–300 |
| fireTrap | trap\_fire | Trampa de fuego | MVP-2 | elemental | Cabeza de demonio de piedra que asoma del suelo, con 5 runas de carga alrededor | Cerrada, escupiendo fuego, recargando, agotada | Llamarada naranja | 200–400 |
| lightningTrap | trap\_lightning | Trampa eléctrica | MVP-2 | elemental | Obelisco de piedra negra con cristal cian y 5 runas de carga | Cargada, descargando, recargando, agotada | Rayo cian y chispas | 200–400 (2 m) |
| crushingWalls | trap\_crushing\_walls | Paredes aplastantes | MVP-2 | physical | Dos losas de piedra con púas sobre rieles, empotradas en los muros a ambos lados del tile | Abiertas, cerrándose, reabriéndose, dañadas, destruidas | Polvo y escombros al chocar | 250–450 |
| alarmTrap | trap\_alarm | Campana de alarma | Opcional | physical | Poste de hueso con campana de hierro y una calavera | Quieta, sonando, dañada, destruida | Anillos de sonido | 150–300 |
| gasTrap | trap\_gas | Fumarola venenosa | Opcional | elemental | Rejilla de hierro sobre un pozo de lodo verde, con 5 runas de carga en el borde | Quieta, expulsando gas, agotada | Nube verde | 150–300 |
| sentryTrap | trap\_sentry | Ballesta centinela | Opcional | physical | Ballesta pesada sobre trípode giratorio | Girando, disparando, recargando, dañada, destruida | Estela del virote | 300–500 |
| snareTrap | trap\_snare | Cepo de hierro | Opcional | physical | Mandíbulas de hierro dentadas medio enterradas | Abierto, cerrado, dañado, destruido | Chispas | 100–250 |
| fearTrap | trap\_fear | Tótem del miedo | Opcional | elemental | Tótem de madera con calaveras apiladas y 5 runas de carga | Quieto, aullando, agotado | Niebla violeta y ojos encendidos | 200–350 (2 m) |
| mimicChest | trap\_mimic\_chest | Cofre trampa | Opcional | physical | Cofre con herrajes dorados que por dentro tiene dientes y lengua | Cerrado (parece botín), mordiendo, dañado, destruido | Monedas falsas que saltan | 250–400 |

Las puertas que también fabrica el Taller todavía no tienen tabla de assets.

## 13. Diseño visual de las criaturas

Cada criatura tiene **un color dominante propio y una silueta que no se confunde con ninguna otra** a 40 píxeles de alto. Las cinco primeras son el MVP; las demás llegan en MVP-2 o después, en el mismo orden del roster (sección 1). En la Cámara de tortura, la Torturadora convierte prisioneros y el Verdugo ejecuta a los que se resisten.

| Criatura | Silueta | Color dominante | Rasgos clave | Altura | Triángulos | Animaciones propias |
| --- | --- | --- | --- | --- | --- | --- |
| Imp | Diminuto, encorvado, pico más grande que él | Rojo óxido | Orejas enormes, ojos amarillos, delantal de cuero, bolsa de pepitas | 0,5 m | 400–700 | Picar, reclamar, cargar oro |
| Goblin | Delgado, inclinado hacia adelante, agachado | Verde musgo | Nariz larga, cuero remendado con chapas, espada dentada y escudo redondo | 0,8 m | 800–1.100 | Estocada, esquiva |
| Troll | Hombros enormes, brazos hasta el suelo | Gris piedra | Musgo en la espalda, colmillos inferiores, mandil de herrero, martillo pesado | 1,2 m | 1.000–1.400 | Martillazo, golpe al pecho |
| Warlock | Alto y flaco, capucha en punta, bastón vertical | Morado oscuro con llama verde | Ojos brillantes bajo la capucha, barba larga, bastón con calavera, libros al cinto | 1,0 m | 900–1.300 | Lanzar bola de fuego, leer |
| Demonio de bilis | Esfera enorme sobre piernas cortas | Oliva y púrpura con verde ácido | Panza con venas brillantes, placa de hierro remachada y cadenas, cuernos curvados hacia abajo | 1,4 m | 1.500–2.200 | Barrigazo, eructo de gas |
| Luciérnaga | Insecto volador con abdomen enorme y brillante | Ámbar brillante sobre negro verdoso | Ojos compuestos, antenas plumosas, cuatro alas translúcidas | 0,4 m (vuela a 1 m) | 300–500 | Zumbar, revelar zona |
| Salamandra | Reptil bípedo bajo y encorvado, cola larga y gruesa | Naranja brasa con negro carbón | Escamas facetadas, cresta de llamas en la espalda (emisiva), boca ancha, garras | 0,9 m | 900–1.300 | Escupir fuego, coletazo |
| Esqueleto | Delgado y anguloso, escudo y espada, casco abollado | Hueso amarillento | Huesos gruesos y estilizados (no finos), mandíbula suelta, ojos cian, armadura oxidada a medias | 0,9 m | 700–1.000 | Estocada; al morir se desarma en huesos |
| Pícaro | Pequeño, agachado, dos dagas en guardia invertida | Cuero gastado y azul noche | Capucha y bufanda que tapan la cara, ganzúas, saco de botín a la espalda | 0,9 m | 800–1.100 | Puñalada por la espalda, desvanecerse |
| Torturadora | Alta y esbelta, coleta alta, látigo largo | Negro brillante y rubio platino | Body de látex negro con hebillas y correas, guantes largos, botas altas, cuernos pequeños, chispas magenta en el látigo. Estética de dominatriz sin desnudez ni poses sexuales | 1,1 m | 1.000–1.400 | Latigazo, atar, disfrutar la bofetada |
| Verdugo | Corpulento, capucha negra en punta, hacha enorme al hombro | Negro carbón y cuero rojizo | Capucha con agujeros para los ojos, delantal de cuero, brazaletes con pinchos, llavero de grilletes | 1,2 m | 1.100–1.500 | Hachazo, afilar el hacha, ejecutar |
| Elfo oscuro | Delgado, agachado, ballesta de mano | Gris ceniza y verde botella | Pelo blanco largo, orejas largas, media capa con capucha, bandolera de cuchillos | 1,1 m | 900–1.200 | Disparar ballesta, lanzar cuchillo |
| Bruja | Jorobada, sombrero torcido en punta, bastón largo | Verde azulado de pantano y ocre | Nariz ganchuda, frascos de pociones en bandolera, cuervín en el hombro, harapos en capas | 0,9 m | 900–1.300 | Lanzar poción, maldición |
| Vampiro | Alto y delgado, capa enorme de cuello alto en punta | Carmesí oscuro y negro | Piel pálida azulada, orejas puntiagudas, colmillos, garras, medallón; la capa se abre como alas de murciélago | 1,2 m | 1.000–1.500 | Drenar vida, deshacerse en murciélagos |
| Caballero negro | Armadura voluminosa, hombreras enormes con pinchos, espada a dos manos | Acero ennegrecido con bronce viejo | Yelmo cerrado con visera en T y brillo violeta, capa rota, remaches de bronce | 1,4 m | 1.500–2.200 | Tajo a dos manos, carga |
| Doncella | Torso humanoide de cuatro brazos sobre abdomen de araña de ocho patas | Blanco perla y negro con marcas carmesí | Seis ojos pequeños, corona de púas de quitina, chal de seda | 1,3 m (patas de 2 tiles) | 1.600–2.200 | Lanzar telaraña, envolver en capullo |
| Fantasma | Encapuchado flotante sin piernas, cola de humo | Azul pálido translúcido | Máscara de hueso, garras largas, cadenas rotas | 1,1 m (flota) | 900–1.300 | Atravesar muro, grito de terror |
| Ángel caído | Alas abiertas en V, porte erguido | Negro con brasas naranja | Plumas rotas, halo partido de brasas, armadura agrietada, lanza | 1,3 m | 1.800–2.500 | Vuelo corto, golpe en picada |
| Dragón | Cuadrúpedo compacto, alas plegadas, cuello en S | Negro con vientre de brasa | Cuernos hacia atrás, escamas grandes facetadas, ocupa 2×2 tiles | 2,5 m | 3.000–4.500 | Aliento de fuego, rugido |

**Animaciones comunes a todas:** `idle`, `walk`, `work`, `attack`, `hurt`, `die` y `sleep` (sección 11 del plan), más cuatro recomendadas para el game feel: `carried` (colgando de la mano), `slapped`, `eat` y `angry`. Si falta una, el cargador usa `idle`.

## 14. De la imagen de referencia al .glb

Una criatura está lista para el juego cuando pasa esta lista. Si usas una IA de imagen a 3D, el resultado suele venir con demasiados polígonos: hay que retopologizar o reducir hasta el presupuesto de la sección 9 antes de ponerle huesos.

- [ ] Cargar las vistas frontal y lateral de la hoja de referencia como imágenes de fondo en Blender
- [ ] Modelar a escala: 1 tile = 1 m, altura según la tabla de criaturas, origen en la base
- [ ] Dejar las facetas planas (sombreado plano) y quedar dentro del presupuesto de triángulos
- [ ] Un solo material de color base pintado a mano (256² o 512²) más emisivo si lo necesita
- [ ] Poner la zona de color de equipo en un material aparte llamado `team`, en gris #9A9A9A, para que el motor la tiña
- [ ] Esqueleto dentro del límite de huesos de su tamaño
- [ ] Animaciones con los nombres estándar: `idle`, `walk`, `work`, `attack`, `hurt`, `die`, `sleep` (y si se puede `carried`, `slapped`, `eat`, `angry`)
- [ ] Anclas vacías con nombre: `hand_r`, `head`, `projectile_origin`
- [ ] Exportar .glb: solo lo seleccionado, Y hacia arriba, modificadores aplicados, animaciones incluidas, sin cámaras ni luces
- [ ] Comprimir con gltf-transform (meshopt y texturas KTX2) y revisar el peso
- [ ] Registrar el `modelId` en `assets/assetManifest.json` y pasar `tools/validate-glb` (fase 6)

La convención del material `team` es nueva: conviene añadirla a la sección 11 del plan para que Claude Code la implemente en el cargador.

## 15. Prompt maestro de estilo

Este JSON fija la estética de todas las imágenes de referencia. Va en inglés porque los generadores de imagen lo siguen con más precisión; los valores se pueden ajustar sin tocar la estructura.

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "medium": "3D game character concept render, stylized low poly, real-time game asset look",
  "art_direction": "dark fantasy with grim humor; grotesque but charming dungeon creatures; exaggerated cartoon proportions; the moody torchlit spirit of late-1990s dungeon management games, reimagined as clean modern low poly",
  "geometry": "low poly with visible flat-shaded facets, roughly 500 to 2000 triangles, chunky readable silhouette, oversized head, hands and weapon, no fine modeled detail",
  "texturing": "hand-painted texture look, shadows and highlights painted into the base color, simple color blocks, subtle edge wear, no photoreal materials, no glossy reflections",
  "shading": "soft cel shading with 2 to 3 tone steps",
  "lighting": "warm amber torchlight key from upper left, cold blue-violet fill from the right, strong rim light separating the silhouette, dark moody ambience while the character stays fully readable",
  "palette": {
    "base": "desaturated earth browns #5A4636, stone greys #4A5560, mossy greens",
    "accents": "glowing gold #F5C542, mana cyan #3FC7E8, lava orange #FF6A1F, toxic green #9BD43A, used sparingly",
    "team_color_zone": "one clearly separated flat neutral grey #9A9A9A cloth, banner or gem area, reserved for player color tinting"
  },
  "readability": "must read clearly from a high isometric camera at very small size; strong value contrast between head, body and weapon; one dominant hue per creature",
  "tone": "menacing yet comedic, no gore, no blood, suitable for all ages",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, A-pose, full body, orthographic, evenly spaced, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, no scenery, soft contact shadow under the feet",
  "output": { "aspect_ratio": "16:9", "resolution": "2048x1152" },
  "negative_prompt": "photorealistic, high poly, smooth subdivision surfaces, skin pores, glossy metal reflections, blood, gore, text, letters, watermark, logo, signature, user interface, extra limbs, cropped feet, busy background, copies of existing franchise characters, pure red, blue, green or yellow on the body outside the team color zone"
}
```

**Cómo usarlo**

1. Cada prompt de criatura (sección 16) ya trae una versión corta de este estilo, así que funciona solo. Para máxima consistencia, pega primero este JSON y luego el de la criatura en la misma conversación.
2. La mayoría de generadores aceptan el JSON pegado como texto. Si uno no lo entiende, junta los valores en un solo párrafo.
3. Genera 4 variantes, elige una y vuelve a pedir la hoja de vistas adjuntando la elegida como imagen de referencia, para que las cuatro vistas sean el mismo personaje.
4. Para ver la criatura dentro del juego en lugar de la hoja de vistas, reemplaza estos dos campos:

```json
"composition": "single character standing on torchlit stone floor tiles, high isometric camera looking down at 45 degrees, character small in frame as in a strategy game",
"background": "dark dungeon interior with earth walls, wall torches, glints of gold veins, deep shadows"
```

Las imágenes son referencia para modelar en Blender, no assets finales.

## 16. Prompts por criatura

Cada JSON funciona solo: incluye el estilo resumido, el diseño de la criatura, la hoja de vistas y lo que hay que evitar. Copia el bloque completo.

### Imp (MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Imp digger",
    "role": "tiny tireless dungeon worker that digs tunnels, mines gold and claims floor",
    "body": "very small wiry hunched imp, skinny limbs, oversized clawed hands and feet, thin tail with a spade tip",
    "head": "large head about a third of its height, huge pointed ears, big round yellow eyes, wide toothy grin, tiny nub horns",
    "outfit": "patched leather work apron, belt with a small sack of glowing gold nuggets",
    "props": "iron pickaxe slightly larger than its own head, held in both hands",
    "palette": "rust red skin #8C3B2A, dark brown leather, gold accents from the nuggets",
    "team_color_zone": "neutral grey #9A9A9A bandana tied around the neck",
    "expression": "eager, mischievous, busy",
    "scale": "0.5 m tall, the smallest creature in the game"
  },
  "pose": "A-pose for the turnaround, plus one small inset of the imp mid-swing with the pickaxe",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, chibi mascot"
}
```

### Goblin (MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Goblin skirmisher",
    "role": "fast, cheap frontline fighter that flanks enemies",
    "body": "lean and wiry, crouched forward-leaning stance, long arms, bandy legs, bare clawed feet",
    "head": "long hooked nose, wide bat-like ears, narrow red eyes, underbite with crooked teeth",
    "outfit": "patched leather armor reinforced with mismatched riveted metal plates, a spiked pauldron on one shoulder only",
    "props": "short notched rusty sword in the right hand, small round wooden buckler with an iron rim in the left",
    "palette": "moss green skin #5E7A3A, brown leathers, dull iron",
    "team_color_zone": "neutral grey #9A9A9A ragged hood and scarf",
    "expression": "cocky sneer",
    "scale": "0.8 m tall"
  },
  "pose": "A-pose for the turnaround, plus one small inset of a lunging sword thrust",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, full plate armor"
}
```

### Troll (MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Stone troll smith",
    "role": "slow, tough blocker and workshop laborer",
    "body": "massive hunched torso, enormous shoulders, very long arms with knuckles almost touching the ground, short thick legs",
    "head": "small head sunk between the shoulders, heavy brow, two lower tusks, flat nose, tiny eyes",
    "outfit": "scorched leather blacksmith apron, iron bracers, a chain wrapped around one forearm",
    "props": "huge two-handed forge hammer with a stone and iron head, resting on the shoulder",
    "palette": "stone grey skin #6E7378 with patches of moss and lichen on the back, dark leather, soot black",
    "team_color_zone": "neutral grey #9A9A9A cloth band tied around the waist and the hammer handle",
    "expression": "dim, grumpy, unstoppable",
    "scale": "1.2 m tall, very broad"
  },
  "pose": "A-pose for the turnaround, plus one small inset of an overhead hammer slam",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, slim body"
}
```

### Warlock (MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Warlock",
    "role": "fragile ranged spellcaster who loves research",
    "body": "tall, gaunt and stooped, bony hands with long fingers",
    "head": "deep pointed hood hiding the face except two glowing green eyes and a long scraggly grey beard",
    "outfit": "long tattered dark purple robe with a frayed hem, rope belt with hanging old books and scroll cases, small skull pendant",
    "props": "tall crooked wooden staff topped with a small horned skull holding a flickering green flame, emissive",
    "palette": "dark purple robe #3E2A4F, bone white, toxic green magic glow #9BD43A",
    "team_color_zone": "neutral grey #9A9A9A sash across the chest",
    "expression": "sly, scheming",
    "scale": "1.0 m tall"
  },
  "pose": "A-pose for the turnaround, plus one small inset casting a green fireball from the staff",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, wizard hat, visible face"
}
```

### Demonio de bilis (MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Bile demon",
    "role": "slow, heavy tank that needs a hatchery and a double bed",
    "body": "huge bloated almost spherical body, short stubby legs, short thick arms with three-fingered hands",
    "head": "small head merged into the body, horns curling downward like a ram, wide mouth with tusks",
    "outfit": "riveted iron belly plate held by chains across the gut, iron cuffs on the wrists",
    "props": "none, fights with belly slams and toxic gas",
    "palette": "sickly olive skin #6B6B3A with purple bruise tones #5A3A5E, glowing toxic green #9BD43A veins and pustules on the belly, emissive",
    "team_color_zone": "neutral grey #9A9A9A loincloth under the belly plate",
    "expression": "gluttonous, smug",
    "scale": "1.4 m tall and very wide, occupies two tiles"
  },
  "pose": "A-pose for the turnaround, plus one small inset of a belly slam releasing a green gas puff",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, red skin, bat wings"
}
```

### Luciérnaga (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game creature, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Giant firefly",
    "role": "flying scout that reveals the fog of war",
    "body": "cat-sized flying insect, segmented body, six thin legs tucked under, four translucent faceted wings, oversized glowing abdomen",
    "head": "round head with huge compound eyes, feathery antennae, small mandibles",
    "outfit": "none",
    "props": "none",
    "palette": "black-green carapace #1F2A22, bright amber glow #F5C542 on the abdomen, emissive, pale translucent wings",
    "team_color_zone": "neutral grey #9A9A9A band around the thorax",
    "expression": "curious, jittery",
    "scale": "0.4 m long, hovering 1 m above the floor",
    "technical_note": "wings as flat planes with alpha cutout; the glow is emissive, not a real light"
  },
  "pose": "hovering pose for the turnaround, plus one small inset lighting up a dark area",
  "composition": "creature turnaround sheet: front, three-quarter, side and back views, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, macro insect photo, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra legs, busy background, copies of existing franchise characters"
}
```

### Salamandra (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Salamander",
    "role": "fire-spitting flanker that loves lava",
    "body": "low bipedal lizard, hunched posture, long thick tail dragging behind, short powerful legs, clawed hands",
    "head": "wide flat head, broad grinning mouth, small fierce amber eyes, frill-like cheek scales",
    "outfit": "none except a scorched strap across the chest",
    "props": "none, attacks by spitting fire",
    "palette": "ember orange belly and crest #FF6A1F, charcoal black back scales #1E1E24",
    "team_color_zone": "neutral grey #9A9A9A cloth strap across the chest",
    "expression": "hot-tempered, playful",
    "scale": "0.9 m tall, 1.6 m long including the tail",
    "technical_note": "large faceted scale plates; a crest of stylized flame shapes along the spine, emissive"
  },
  "pose": "A-pose for the turnaround, plus one small inset spitting a fireball",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body including tail, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped tail, busy background, copies of existing franchise characters, realistic reptile skin, tiny scales, wings"
}
```

### Esqueleto (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Skeleton soldier",
    "role": "tireless undead foot soldier risen from starved prisoners; never eats, sleeps or asks for pay",
    "body": "lean angular skeleton with chunky stylized bones thick enough to read at small size, exposed ribcage, slightly hunched",
    "head": "skull with a loose jaw, glowing cyan eye points, dented iron kettle helmet",
    "outfit": "half-rusted mismatched armor pieces: one pauldron, a scrap of chainmail, a frayed belt",
    "props": "rusty straight sword in the right hand, cracked round iron shield in the left",
    "palette": "aged yellowish bone #D9CBA3, rust brown iron, cyan eye glow #3FC7E8",
    "team_color_zone": "neutral grey #9A9A9A tattered tabard hanging from the belt",
    "expression": "grinning, relentless",
    "scale": "0.9 m tall",
    "technical_note": "bones built as simple chunky prisms, never thin realistic bones, so the silhouette survives at low poly"
  },
  "pose": "A-pose for the turnaround, plus one small inset collapsing into a pile of bones",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, realistic anatomy, thin spindly bones, horror movie style"
}
```

### Pícaro (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Rogue",
    "role": "stealthy thief and assassin, invisible outside combat",
    "body": "small wiry humanoid, sneaky crouched stance, light on the toes",
    "head": "deep hood and scarf covering the face, only sly glinting eyes visible",
    "outfit": "patched dark leather jerkin with many pockets, a ring of lockpicks, loot sack on the back with a coin peeking out",
    "props": "two curved daggers held in reverse grip",
    "palette": "worn brown leather #5A4636, night blue cloth #22304A, gold glints from the loot",
    "team_color_zone": "neutral grey #9A9A9A scarf",
    "expression": "sly, mischievous",
    "scale": "0.9 m tall while crouched"
  },
  "pose": "A-pose for the turnaround, plus one small inset fading into shadow mid-step",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, heroic adventurer, bow and arrows, visible face"
}
```

### Torturadora (MVP-2)

Estética de dominatriz sin desnudez ni poses sexuales: el body cubre todo el cuerpo y el brillo del látex va pintado en la textura, no como reflejo real.

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Torturer",
    "role": "whip duelist who runs the torture chamber and converts prisoners to your side",
    "body": "tall slender athletic woman, confident upright stance, long legs",
    "head": "platinum blonde hair in a tight high ponytail, pale skin, sharp features, cold violet eyes, dark lipstick, two small curved black horns",
    "outfit": "full-coverage glossy black latex bodysuit with a high collar, silver buckles and crossed straps, long black gloves, knee-high heeled boots, studded choker",
    "props": "long black leather whip crackling with small magenta sparks, partly coiled in one hand",
    "palette": "glossy black latex #111114 with painted white highlight streaks, platinum blonde hair #E8D9A8, magenta spark glow #C23B9B",
    "team_color_zone": "neutral grey #9A9A9A belt and crossed chest straps",
    "expression": "cruel, confident smirk",
    "scale": "1.1 m tall",
    "technical_note": "latex shine as stylized painted highlight streaks in the texture, not real reflections; the outfit covers the whole body"
  },
  "pose": "A-pose for the turnaround, plus one small inset cracking the whip with sparks",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, real glossy reflections, nudity, exposed skin, cleavage, lingerie, sexualized or suggestive pose, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters"
}
```

### Verdugo (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Executioner",
    "role": "executes prisoners who resist conversion in the torture chamber, earning gold for the dungeon; also a brutal melee finisher",
    "body": "big burly brute with a heavy gut, broad bare arms, thick legs, heavy boots",
    "head": "black pointed hood with two eye holes covering the whole head, only a stubbly chin visible",
    "outfit": "thick leather apron over a bare chest, spiked leather bracers, belt with a large iron key ring and shackles",
    "props": "huge two-handed executioner's axe with a broad dull iron blade, resting on the shoulder",
    "palette": "charcoal black hood #1E1E24, reddish-brown leather #6B3A2A, dark iron",
    "team_color_zone": "neutral grey #9A9A9A cloth sash tied around the waist",
    "expression": "silent, intimidating, deadpan",
    "scale": "1.2 m tall and wide"
  },
  "pose": "A-pose for the turnaround, plus one small inset sharpening the axe on a stone grindstone wheel",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, wounds, severed heads, victims, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters"
}
```

### Elfo oscuro (después del MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Dark elf sharpshooter",
    "role": "agile ranged fighter with throwing knives and a hand crossbow",
    "body": "lean agile humanoid, light-footed crouched stance, long limbs",
    "head": "ash grey skin, long straight white hair, long pointed ears, narrow pale eyes, war paint lines on the cheeks",
    "outfit": "fitted dark leather armor with layered plates, hooded half-cape, bandolier of throwing knives",
    "props": "small hand crossbow in one hand, a throwing knife in the other",
    "palette": "ash grey skin #8A8F94, dark bottle-green leather #1F3A2E, steel",
    "team_color_zone": "neutral grey #9A9A9A half-cape",
    "expression": "aloof, focused",
    "scale": "1.1 m tall"
  },
  "pose": "A-pose for the turnaround, plus one small inset throwing a knife",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, golden armor, longbow"
}
```

### Bruja (después del MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Swamp witch",
    "role": "support caster that throws slowing potions and curses",
    "body": "short hunched old crone, long bony arms, knobby fingers, layered ragged skirts",
    "head": "long hooked nose with a wart, wild grey-green hair, crooked pointed hat with a bent tip, one eye glowing",
    "outfit": "layered tattered shawls and skirts, bandolier of small glass potion bottles glowing in different colors, bundles of herbs tied at the belt",
    "props": "tall gnarled wooden staff with a small bubbling cauldron hanging from its hooked top; a tiny crow perched on her shoulder",
    "palette": "swamp teal #2F5A55 and ochre #A8823A cloth, sallow green-grey skin, potion glows in cyan and toxic green",
    "team_color_zone": "neutral grey #9A9A9A hat band",
    "expression": "cackling, cunning",
    "scale": "0.9 m tall while hunched"
  },
  "pose": "A-pose for the turnaround, plus one small inset throwing a glowing potion",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, young glamorous witch, flying broomstick, purple robes"
}
```

### Vampiro (después del MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Vampire lord",
    "role": "elite thinker that drains life, risen in the graveyard",
    "body": "tall, thin and elegant, long clawed fingers, slightly hunched predatory posture",
    "head": "pale bluish skin, slicked-back dark hair with a widow's peak, pointed ears, small fangs, glowing red eyes",
    "outfit": "dark crimson doublet, huge black cape with a tall pointed collar whose inner lining opens like bat wings, ornate medallion",
    "props": "none, attacks with claws and life drain",
    "palette": "dark crimson #5C1A24 and black, pale blue-grey skin, small gold trims",
    "team_color_zone": "neutral grey #9A9A9A gem in the medallion",
    "expression": "aristocratic, predatory smirk",
    "scale": "1.2 m tall"
  },
  "pose": "A-pose for the turnaround, plus one small inset with the cape spread open, dissolving into a few bats",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, dripping blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, sparkling skin, modern clothes"
}
```

### Caballero negro (después del MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Dark knight",
    "role": "elite heavy blocker forged in the combat pit",
    "body": "towering bulky plate armor, broad chest, huge spiked pauldrons, heavy gauntlets and boots, no skin visible",
    "head": "closed great helm with a T-shaped visor, faint violet glow inside the visor, short swept-back horns",
    "outfit": "blackened plate armor with old bronze rivets and trims, chainmail skirt, torn cape",
    "props": "massive two-handed greatsword with a notched blade, held point-down in front",
    "palette": "blackened steel #2A2D36, aged bronze #8A6A3A, violet visor glow #8E5BD9",
    "team_color_zone": "neutral grey #9A9A9A torn cape",
    "expression": "stoic, unstoppable",
    "scale": "1.4 m tall and broad",
    "technical_note": "large flat armor plates with bevelled edges; details painted, not modeled"
  },
  "pose": "A-pose for the turnaround, plus one small inset of a two-handed overhead cleave",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, shiny chrome, blood, gore, text, watermark, logo, extra limbs, cropped feet, busy background, copies of existing franchise characters, visible face, horse"
}
```

### Doncella (después del MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game creature, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Nest maiden",
    "role": "web-spinning controller that immobilizes enemies from range",
    "body": "humanoid upper body with four slender arms, covered by chitin armor plates, joined to a large black spider abdomen with eight jointed legs",
    "head": "pale face with six small dark eyes in pairs, long black hair, a crown of chitin spikes",
    "outfit": "chitin plates on the torso, shoulders and forearms, strands of silk wrapped like a shawl",
    "props": "a ball of glowing silk spun between two hands",
    "palette": "pearl white skin and silk #E6E1D6, black chitin #141418 with dull crimson hourglass marks #5C1A24",
    "team_color_zone": "neutral grey #9A9A9A silk shawl",
    "expression": "calm, patient, unsettling",
    "scale": "1.3 m tall, legs spanning 2 tiles",
    "technical_note": "legs as simple chunky faceted segments that read at small size"
  },
  "pose": "neutral standing pose for the turnaround, plus one small inset shooting a web",
  "composition": "creature turnaround sheet: front, three-quarter, side and back views, full body including legs, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, macro spider photo, high poly, smooth surfaces, glossy reflections, horror, nudity, blood, gore, text, watermark, logo, cropped legs, busy background, copies of existing franchise characters"
}
```

### Fantasma (después del MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Ghost",
    "role": "incorporeal harasser that phases through walls and spreads terror",
    "body": "floating hooded wraith with no legs, lower body dissolving into a trail of mist, long thin arms with elongated claws",
    "head": "cracked bone mask with hollow glowing eye sockets under a tattered hood",
    "outfit": "torn shroud-like robes, broken shackles and chains hanging from the wrists",
    "props": "none",
    "palette": "pale ghostly blue #9FC3D9, bone white mask, cyan eye glow #3FC7E8",
    "team_color_zone": "neutral grey #9A9A9A spectral ribbon wrapped around one arm",
    "expression": "eerie, hungry",
    "scale": "1.1 m, floating 0.2 m above the floor",
    "technical_note": "translucency as a stylized fresnel edge glow, not realistic glass"
  },
  "pose": "hovering A-pose for the turnaround, plus one small inset half-passing through a stone wall",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, realistic glass, blood, gore, text, watermark, logo, extra limbs, busy background, copies of existing franchise characters, bedsheet ghost"
}
```

### Ángel caído (después del MVP)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated cartoon proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Fallen angel",
    "role": "elite high-level warrior",
    "body": "tall athletic humanoid with a proud upright stance, large black feathered wings open in a V shape with broken and missing feathers",
    "head": "stern pale face, long dark hair, cracked halo of smoldering embers floating behind the head",
    "outfit": "dark cracked plate armor with ember-orange light glowing through the cracks, tattered battle skirt",
    "props": "long black spear with a jagged ember-glowing blade",
    "palette": "charcoal black #1E1E24, ember orange glow #FF6A1F, pale skin",
    "team_color_zone": "neutral grey #9A9A9A cloth tabard on the chest",
    "expression": "cold, wrathful",
    "scale": "1.3 m tall without wings",
    "technical_note": "wings built from a few large flat faceted feather planes with a clear silhouette"
  },
  "pose": "A-pose with wings spread for the turnaround, plus one small inset of a diving spear strike",
  "composition": "character turnaround sheet: front, three-quarter, side and back views, full body, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped feet, cropped wings, busy background, copies of existing franchise characters, white wings, religious symbols"
}
```

### Dragón (después del MVP, élite única)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game character, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy with grim humor, exaggerated proportions, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Dungeon dragon",
    "role": "unique elite creature, one per player, rare and very expensive",
    "body": "compact four-legged dragon, hunched powerful shoulders, S-shaped neck, wings folded tight against the body, thick tail with a spiked tip",
    "head": "angular wedge-shaped head, swept-back horns, glowing ember eyes, smoke curling from the nostrils",
    "outfit": "heavy iron chain collar",
    "props": "none",
    "palette": "obsidian black scales #1E1E24 as large faceted plates, glowing ember orange #FF6A1F belly and throat",
    "team_color_zone": "neutral grey #9A9A9A gem set in the iron collar",
    "expression": "ancient, proud, dangerous",
    "scale": "2.5 m tall at the shoulders, occupies 2x2 tiles",
    "technical_note": "large faceted scale plates instead of small scale detail"
  },
  "pose": "neutral standing pose for the turnaround, plus one small inset breathing fire",
  "composition": "creature turnaround sheet: front, three-quarter, side and back views, full body including tail, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, watermark, logo, extra limbs, cropped tail, busy background, copies of existing franchise characters, tiny scales, feathered dragon"
}
```

## 17. Prompts de trampas

Cada JSON genera una hoja con tres vistas: la trampa armada, la misma trampa disparándose y una vista desde arriba para encajarla en el tile. Usa el estilo del prompt maestro (sección 15), adaptado a objetos. Las 6 trampas base van primero. Para ver sus estados, añade a composition una vista dañada (físicas) o las 5 runas de carga encendidas (elementales). Copia el bloque completo.

### Trampa de picos (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Spike pit trap",
    "function": "impales whoever steps on it",
    "design": "square iron floor plate with a grid of holes, set into the stone floor, rusty sharpened stakes hidden below",
    "mechanism": "stakes shoot up through the holes",
    "palette": "rusted iron #6B4A3A, dark stone #4A5560",
    "team_color_zone": "small neutral grey #9A9A9A rune engraved on one corner of the plate",
    "triggered_state": "a cluster of tall sharp stakes thrust up through the plate with dust and sparks, nobody on it",
    "scale": "fits a 1x1 m tile, stakes 0.8 m high when triggered"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, impaled bodies, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets"
}
```

### Trampa de piedra rodante (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Rolling boulder trap",
    "function": "releases a heavy boulder that rolls in a straight line",
    "design": "large faceted stone boulder resting on a tilted wooden cradle with a lever and a rope",
    "mechanism": "the lever pulls, the cradle tips and the boulder rolls away",
    "palette": "grey stone #6E7378 with patches of moss, worn brown wood",
    "team_color_zone": "neutral grey #9A9A9A painted mark on the cradle",
    "triggered_state": "boulder rolling off the cradle with a dust trail",
    "scale": "fits a 1x1 m tile, boulder 1 m wide",
    "technical_note": "the boulder is a separate model from the cradle"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets, perfect sphere"
}
```

### Trampa de hielo (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Frost crystal trap",
    "function": "freezes enemies in place",
    "design": "jagged pale blue ice crystal cluster on a low carved stone pedestal, frost spreading over the floor around it",
    "mechanism": "the crystal glows and bursts into a freezing wave",
    "palette": "pale ice blue #9FC3D9, white frost, grey stone",
    "team_color_zone": "small neutral grey #9A9A9A gem in the pedestal",
    "triggered_state": "radial burst of faceted ice shards and cold mist",
    "scale": "fits a 1x1 m tile, 0.9 m tall"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, realistic glass, blood, gore, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets"
}
```

### Trampa de fuego (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Fire maw trap",
    "function": "breathes a cone of fire at enemies in front of it",
    "design": "carved stone demon head emerging from the floor with an open fanged mouth, soot stains around it",
    "mechanism": "the mouth opens wide and spits flames forward",
    "palette": "dark stone, soot black, ember orange glow #FF6A1F inside the mouth",
    "team_color_zone": "small neutral grey #9A9A9A gem on the forehead",
    "triggered_state": "stylized cone of orange flame 3 m long",
    "scale": "fits a 1x1 m tile, 0.8 m tall"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, burning bodies, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets, realistic fire"
}
```

### Trampa eléctrica (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Lightning obelisk trap",
    "function": "zaps nearby enemies with chain lightning",
    "design": "tall narrow black stone obelisk with carved runes, a floating cyan crystal above the tip",
    "mechanism": "the crystal charges up and releases forked lightning",
    "palette": "black stone #1E1E24, cyan glow #3FC7E8, emissive",
    "team_color_zone": "neutral grey #9A9A9A rune band around the base",
    "triggered_state": "forked stylized cyan lightning arcing out from the crystal",
    "scale": "fits a 1x1 m tile, 2 m tall"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets, sci-fi tower"
}
```

### Paredes aplastantes (MVP-2)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Crushing walls trap",
    "function": "two spiked stone walls slam together and crush whoever stands between them",
    "design": "two thick stone slabs covered in iron spikes, sliding on rusty iron rails set into the corridor walls on opposite sides of a single floor tile, heavy chains and counterweights above",
    "mechanism": "both slabs slam toward the center of the tile, then slowly slide back",
    "palette": "grey stone #6E7378, dark iron spikes, rust",
    "team_color_zone": "neutral grey #9A9A9A rune plate on top of each slab",
    "triggered_state": "slabs meeting in the middle with dust and debris bursting out, nobody caught",
    "scale": "fits a 1x1 m corridor tile between two walls, slabs 1.5 m tall",
    "technical_note": "show a short section of the corridor walls so the rails read clearly; each slab is a separate moving part"
  },
  "composition": "prop sheet: three-quarter view with the walls open, the same trap mid-slam, a damaged cracked version, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, crushed bodies, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets"
}
```

### Campana de alarma (opcional)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Alarm bell trap",
    "function": "rings when an enemy comes close and calls nearby defenders",
    "design": "short crooked bone post topped with a cracked iron bell, a small horned skull hanging under the bell, chains wrapped around the post",
    "mechanism": "the bell swings and its clapper strikes when triggered",
    "palette": "aged bone #D9CBA3, dark iron, amber highlights from torchlight",
    "team_color_zone": "small neutral grey #9A9A9A rune plate nailed to the post",
    "triggered_state": "bell swinging hard with stylized sound rings around it",
    "scale": "fits a 1x1 m tile, 1.2 m tall"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets"
}
```

### Fumarola venenosa (opcional)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Poison vent trap",
    "function": "releases a toxic cloud when stepped on",
    "design": "round iron grate over a small pit full of bubbling green sludge, cracked stone rim with a few old bones",
    "mechanism": "the grate rattles and pushes out a cloud of gas",
    "palette": "dark iron, cracked grey stone, toxic green glow #9BD43A, emissive",
    "team_color_zone": "small neutral grey #9A9A9A gem set in the stone rim",
    "triggered_state": "thick billowing stylized green gas cloud rising 1.5 m",
    "scale": "fits a 1x1 m tile, low to the ground"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets, realistic smoke"
}
```

### Ballesta centinela (opcional)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Sentry crossbow trap",
    "function": "automatic turret that shoots bolts at enemies in sight",
    "design": "heavy wooden crossbow mounted on a rotating iron tripod, a drum magazine of bolts on top, a small glowing eye lens at the front",
    "mechanism": "rotates toward the target and fires",
    "palette": "dark wood #4A3426, black iron, amber eye glow",
    "team_color_zone": "small neutral grey #9A9A9A pennant tied to the tripod",
    "triggered_state": "crossbow string snapping forward, a bolt in flight with a short motion streak",
    "scale": "fits a 1x1 m tile, 1.1 m tall"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets, modern gun"
}
```

### Cepo de hierro (opcional)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Iron snare trap",
    "function": "clamps an enemy's legs and holds it in place",
    "design": "large jagged iron jaws half buried in the floor, a round central pressure pad, a thick chain anchored to a floor ring",
    "mechanism": "the jaws snap shut",
    "palette": "dark iron with rusty edges, grey stone",
    "team_color_zone": "neutral grey #9A9A9A paint mark on the pressure pad",
    "triggered_state": "jaws snapped shut with sparks flying, nothing caught",
    "scale": "fits a 1x1 m tile, low to the ground"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, injured limbs, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets"
}
```

### Tótem del miedo (opcional)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Fear totem trap",
    "function": "makes weak enemies flee in terror",
    "design": "tall carved wooden totem with stacked horned skulls and a wide screaming face at the top, feathers and small bones hanging from it",
    "mechanism": "its eyes light up and it lets out a howl",
    "palette": "dark weathered wood, bone white, violet eye glow #8E5BD9, emissive",
    "team_color_zone": "neutral grey #9A9A9A cloth strip tied around the totem",
    "triggered_state": "violet mist pouring out, glowing eyes and a stylized howl ring",
    "scale": "fits a 1x1 m tile, 2 m tall"
  },
  "composition": "prop sheet: three-quarter view of the armed trap, the same trap mid-trigger, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, letters, watermark, logo, characters, creatures, busy background, copies of existing game assets, real cultural or religious symbols"
}
```

### Cofre trampa (opcional)

```json
{
  "style_preset": "DM_LOWPOLY_DARK_FANTASY_v1",
  "style": "stylized low poly 3D game prop, visible flat-shaded facets, hand-painted textures, soft cel shading, dark fantasy dungeon with grim humor, warm amber torchlight key, cold blue-violet rim light, readable from a high isometric camera",
  "subject": {
    "name": "Mimic chest trap",
    "function": "decoy that looks like treasure and bites whoever tries to open it",
    "design": "sturdy wooden treasure chest with gold trims and a few coins on the lid; inside, rows of teeth, a long tongue and one eye",
    "mechanism": "the lid snaps open and bites",
    "palette": "warm brown wood #6B4A2E, gold trims #F5C542, dark purple mouth interior",
    "team_color_zone": "neutral grey #9A9A9A lock plate",
    "triggered_state": "lid wide open showing teeth and tongue, fake coins flying out",
    "scale": "fits a 1x1 m tile, 0.6 m tall",
    "technical_note": "the closed state must look like ordinary loot"
  },
  "composition": "prop sheet: three-quarter view of the closed chest, the same chest mid-bite, and a top-down view, orthographic, identical scale",
  "background": "plain flat dark grey-blue #2B2A30, soft contact shadow",
  "output": { "aspect_ratio": "16:9" },
  "negative_prompt": "photorealistic, high poly, smooth surfaces, glossy reflections, blood, gore, text, letters, watermark, logo, characters, busy background, copies of existing game assets"
}
```
