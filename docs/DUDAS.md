# Dudas y decisiones tomadas

Cuando la especificación (docs/PLAN.md) no alcanza, se anota aquí la duda, la opción elegida y su estado.
Todo lo marcado [PROPUESTO] se puede cambiar en /data/mvp sin tocar código.

## Fase 0

| #   | Duda                                                                     | Decisión                                                                                                                                 | Dónde                                 |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | ¿A qué ritmo mina un Imp?                                                | [PROPUESTO] 100 de oro por segundo (llena su carga de 300 en 3 s).                                                                       | economy.json → miningGoldPerSecond    |
| 2   | ¿Cuánto tarda en excavarse un muro reforzado (por su dueño)?             | [PROPUESTO] 4 s, el doble que la tierra.                                                                                                 | terrain.json → reinforcedWall         |
| 3   | La satisfacción por sueldo "tiende a 0 con el tiempo": ¿a qué ritmo?     | [PROPUESTO] 0,005 por segundo: de +1 a +0,4 en un ciclo de pago de 120 s.                                                                | mood.json → needs.wage.decayPerSecond |
| 4   | ¿Con qué ánimo llega una criatura?                                       | [PROPUESTO] 60 (Neutral alto).                                                                                                           | mood.json → start                     |
| 5   | El plan dice "hambre sube 70 puntos en 180 s" y "sueño 1 punto cada 3 s" | Convertido a 0,3889/s y 0,3333/s.                                                                                                        | economy.json                          |
| 6   | ¿Cuánto se alejan las criaturas al vagar?                                | [PROPUESTO] 6 tiles alrededor de su posición en territorio propio.                                                                       | economy.json → wanderRadius           |
| 7   | Furioso tiene XP "0"                                                     | Se modela como xpMod = −1 (−100 %).                                                                                                      | mood.json                             |
| 8   | Diseño exacto del mapa                                                   | 10 tiles de veta por base (6 + 4), una veta de 8 tiles compartida entre cada par de bases vecinas, mina central 6×6, rocas, lava y agua. | tools/gen-map/generate.ts             |
| 9   | ¿Dónde aparece el Portal en la base?                                     | Esquina de la base que mira al centro del mapa; Tesorería en la esquina opuesta.                                                         | tools/gen-map/generate.ts             |
| 10  | ¿El Rayo daña salas?                                                     | [PROPUESTO] No: solo criaturas enemigas.                                                                                                 | spells.json → lightning               |
