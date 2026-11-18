/**
 * Proporciones del dibujo. Un tile mide 1 unidad; el Imp debe verse unas 4 o 5 veces más estrecho que un tile
 * (decisión de diseño tras el primer vistazo: con 2,6 veces los tiles se veían pequeños).
 */
export const IMP_RADIUS = 0.11;
export const IMP_HEIGHT = 0.5;
/** Cuántas veces cabe el ancho de un Imp en el lado de un tile. */
export const TILE_TO_IMP_WIDTH = 1 / (2 * IMP_RADIUS);
