# Guía de playtest

Para jugar y apuntar lo que sientes. Nada de esto sustituye a las pruebas automáticas: busca lo que ellas no ven
(¿es divertido?, ¿se entiende?, ¿qué estorba?).

## Cómo arrancar

```text
pnpm dev                 cliente en http://localhost:5173/ (por defecto: PvE, 3 bots, dificultad Normal)
pnpm server              servidor de partidas (solo para jugar en red, ws://localhost:2567)
```

| Dirección                    | Qué abre                                                      |
| ---------------------------- | ------------------------------------------------------------- |
| `/`                          | PvE contra 3 bots (Normal)                                    |
| `/?rivals=1&difficulty=easy` | PvE más suave (rivales 0 a 3; easy, normal o hard)            |
| `/?seed=7`                   | Misma partida otra vez (la semilla decide el mapa y los bots) |
| `/?mode=solo`                | Tu mazmorra sin rival: para probar construir y criaturas      |
| `/?mode=online`              | Partida en red: crear sala o unirse con el código de 6 letras |
| `/?menus=preview`            | Maqueta de menús (todavía no conectada al juego)              |

Atajos útiles para probar: **Tab** salta a la siguiente criatura, **M** silencia el sonido, **P** pausa, **[** y **]** velocidad (×1, ×2, ×4), **F9** llena maná y oro, **F10** muestra
todo el mapa (solo en partidas locales). El minimapa (arriba a la izquierda) se puede pulsar o arrastrar para mover la cámara. Resto de atajos: línea de ayuda al pie del juego y `docs/PLAN.md` 10.2.

## Qué mirar en cada fase

**Fase 2, excavar y construir (`/?mode=solo`)**

- ¿Excavar arrastrando es satisfactorio? ¿Se ve claro qué está marcado y qué no?
- ¿Se entiende cuánto cuesta cada sala y por qué no se puede construir algo (mensajes)?
- ¿Los muros se agrietan antes de caer? ¿Las monedas saltan al minar?
- ¿El tamaño de los tiles y la cámara (rotar, zoom) son cómodos?

**Fase 3, criaturas**

- Construye Guarida y Criadero: ¿llegan criaturas por el Portal? ¿Cuánto tardas en tener 3 o 4?
- ¿Se entiende por qué una criatura está contenta o enfadada (nube sobre la cabeza, panel)?
- Día de pago (cada 2 minutos): ¿el aviso y la campanilla se notan?
- Bofetada (**B** sobre la criatura): ¿se siente? ¿sale el "+25 % velocidad"?
- **Imps holgazanes:** de vez en cuando uno se queda paseando con una burbuja encima (el chip de Imps dice cuántos). Una bofetada (**B**) lo despierta y lo manda a la tarea más cercana. ¿Se nota demasiado o muy poco? (probabilidad en `global.json` → `imps.loaf`).
- **Escala y encuadre:** los tiles son un 30 % más grandes que los personajes; ¿se ve bien o se pierde demasiado mapa? Al empezar (y con Espacio) la base queda por encima de la botonera.
- **Portal:** llega una criatura por minuto y la especie sale según el tamaño de tus salas (más Guarida = más Goblins). ¿Es demasiado lento ahora? Tampoco olvides mirar la distancia entre el Corazón y el Portal y la barra de vida del Corazón al atacarlo.
- **Casino:** construye Sala de entrenamiento y luego Casino (tecla **0**). Tras el día de pago (ahora cada 3 min) las criaturas con sueldo van a jugar 15 s: sale un "+N oro" sobre ellas y entrenan con +50 % de XP un rato. ¿Se nota el ingreso? ¿Es demasiado o poco? El Portal trae una criatura cada 25 s si hay camas.
- **Maná:** el Templo da 10/s por tile y la Biblioteca de nivel 10 da 50 cada 10 s (la barra de maná lo desglosa al pasar el cursor). ¿Se ve muy fuerte o justo?
- **Coste al construir:** una etiqueta junto al cursor dice el precio del tile que vas a poner, su número dentro de la sala y cuánto sube (+20 % por tile).
- **Niveles de sala:** observa cómo cambia la forma de una sala al crecer (torre en el nivel 4, anillo en el 7, joya en el 10).
- **Lista de criaturas:** clic en una fila la recoge y clic derecho en un tile tuyo ya reclamado la suelta; la mira ⌖ centra la cámara. Las criaturas del rival no se pueden coger.
- **Combate y mano:** una criatura que está peleando (o la acaban de atacar) no se puede recoger: sale bloqueada en la lista y avisa si lo intentas. ¿Se nota demasiado? ¿Debería poder recogerse a una que huye?
- **Cerditos:** el Criadero cría uno por tile cada 20 s (chip "Cerditos N/M" en el HUD) y las criaturas con el 70 % de vida o menos se lo comen y recuperan el 30 %. ¿Basta para sustituir a la Guarida como cura?
- **Unir salas:** construye dos tramos del mismo tipo con un hueco y pon un tile en medio: se unen en una sola sala y ese tile cuesta como el tile n.º (total). Si juntas pasaran de 10, el tile abre una sala nueva de nivel 1. El precio aparece junto al cursor y en el botón de la sala.
- **Barras enemigas:** las criaturas rivales llevan la barra de vida siempre visible, con un marco del color de su jugador.
- **Cancelar la Llamada a las armas:** mientras está activa sale el botón "Cancelar llamada" (o la tecla **Y**): las criaturas dejan de acudir y retoman lo que hacían (entrenar, el Casino, pasear...). No devuelve el maná ni el enfriamiento.
- **Muros:** **F** refuerza (nivel 1) y **V** mejora a nivel 2 (pide un Taller de 10 tiles). Los rivales pueden derribarlos con Imps, despacio; ¿hace falta algo más para defenderlos?
- Recoger criaturas con el ratón (hasta 10) y soltarlas con clic derecho: ¿es natural? ¿Van al objetivo marcado más cercano?

**Fase 4, combate (`/` o `/?rivals=1`)**

- ¿Se entiende quién gana una pelea y por qué? ¿Se ve la vida de las criaturas?
- ¿El Corazón atacado avisa bien (temblor, borde rojo, alarma)?
- ¿La niebla de guerra da tensión o frustra? ¿Los bots atacan demasiado pronto o demasiado tarde?
- ¿Las trampas (necesitan la Cámara de tortura) se descubren solas?

**Fase 5, red (`/?mode=online`, 2 a 4 personas)**

- Lobby: ¿el código y el enlace son fáciles de compartir? ¿Se entiende quién empieza?
- ¿Hay lag al dar órdenes? (el fantasma de la orden debe aparecer al instante)
- Cierra una pestaña a media partida y recarga: ¿vuelves a tu mazmorra?
- Al terminar: ¿la tabla de resultados tiene sentido?

## Cambios recientes que conviene probar

- Las criaturas y los Imps solo se pueden soltar en terreno propio (el cursor se pone rojo en otro sitio); desde ahí las criaturas salen a asaltar al enemigo visible más cercano.
- Con excavar, un clic (o arrastrar) sobre tiles ya marcados los desmarca.
- **B** también abofetea a los Imps (+25 % de velocidad de trabajo).
- Al soltar un Imp o una criatura, elige lo más cercano **andando**, no en línea recta.
- Veta de diamantes (cian) en el centro del mapa: se marca y se mina como el oro, pero no se agota; desmárcala para dejar de minarla.

- **Salas con nivel:** arrastra para construir; el texto superior dice cuántas salas salen ("sala nueva de nivel 10 + sala nueva de nivel 2"). Pasa el cursor por una sala para ver su nivel. Un clic suelto construye 1 tile.
- **Trampas:** tras su primer disparo el rival la ve y la puede atacar (también las elementales); tus Imps las reparan solos.

## Qué apuntar

Una línea por cosa, con el momento ("minuto 6, tras el segundo día de pago"):

- **Confuso:** no supe qué hacer / qué significaba…
- **Aburrido:** esperé sin nada que hacer en…
- **Frustrante:** perdí por algo que no vi venir…
- **Roto:** error, bloqueo o comportamiento raro (anota la semilla: `?seed=` y los pasos).
- **Divertido:** quise repetir cuando…

La prueba de diversión de la Puerta 6 (docs/PLAN.md): en un playtest con 3 o 4 personas, al menos 3 quieren jugar
otra partida enseguida. Pregúntalo al terminar.

## Cosas que se sabe que faltan

- Balance final y dificultad Difícil realmente más difícil que Normal (docs/DUDAS.md #46, #61, #81).
- Modelos 3D reales (hoy son formas simples de color), menús conectados y tutorial (después del MVP).
