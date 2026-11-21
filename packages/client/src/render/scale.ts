/**
 * Proporciones del dibujo. Un tile mide 1 unidad. Los tiles se veían pequeños junto a los personajes, así que los
 * personajes (Imps y criaturas, con sus barras, iconos y sombras) se dibujan a `UNIT_SCALE` de su tamaño base y la
 * cámara se acerca esa misma proporción (ver `ISO` en cameraMath): en pantalla los personajes miden lo mismo que antes
 * y los tiles un 30 % más.
 */

/** Cuántas veces más grande se ve un tile respecto a los personajes (1,3 = un 30 % más). */
export const TILE_GROWTH = 1.3;
/** Escala de todo lo que es un personaje (no un tile). */
export const UNIT_SCALE = 1 / TILE_GROWTH;

export const IMP_RADIUS = 0.11 * UNIT_SCALE;
export const IMP_HEIGHT = 0.5 * UNIT_SCALE;
/** Cuántas veces cabe el ancho de un Imp en el lado de un tile. */
export const TILE_TO_IMP_WIDTH = 1 / (2 * IMP_RADIUS);
