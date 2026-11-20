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

Atajos útiles para probar: **M** silencia el sonido, **P** pausa, **[** y **]** velocidad (×1, ×2, ×4), **F9** llena maná y oro, **F10** muestra
todo el mapa (solo en partidas locales). El minimapa (arriba a la derecha) se puede pulsar o arrastrar para mover la cámara. Resto de atajos: línea de ayuda al pie del juego y `docs/PLAN.md` 10.2.

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
