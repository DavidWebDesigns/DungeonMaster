/**
 * Efectos de pantalla de "game feel": temblor y pulso rojo del borde cuando atacan tu Corazón.
 * Lógica pura (solo números que decaen con el tiempo); `game.ts` la aplica al DOM. No toca el estado de la partida.
 */
export interface ScreenFxState {
  /** 0 a 1: cuánto tiembla la pantalla. */
  shake: number;
  /** 0 a 1: intensidad del pulso rojo del borde. */
  alert: number;
}

export const initialScreenFx = (): ScreenFxState => ({ shake: 0, alert: 0 });

/** Segundos que tarda el temblor en apagarse del todo y el pulso rojo (que dura más, como una alarma). */
const SHAKE_SECONDS = 0.35;
const ALERT_SECONDS = 1.6;
/** Píxeles máximos de desplazamiento con el temblor al máximo. */
export const MAX_SHAKE_PX = 5;

/** Un golpe al Corazón: sube el temblor un poco (varios golpes seguidos no pasan de 1) y enciende el pulso. */
export function heartHit(s: ScreenFxState, strength: number): ScreenFxState {
  return {
    shake: Math.min(1, Math.max(s.shake, 0) + strength),
    alert: 1,
  };
}

export function decay(s: ScreenFxState, dtSeconds: number): ScreenFxState {
  return {
    shake: Math.max(0, s.shake - dtSeconds / SHAKE_SECONDS),
    alert: Math.max(0, s.alert - dtSeconds / ALERT_SECONDS),
  };
}

/** Desplazamiento en píxeles; `rand` devuelve valores de 0 a 1 (es decoración, no usa el azar de la partida). */
export function shakeOffset(s: ScreenFxState, rand: () => number): { x: number; y: number } {
  if (s.shake <= 0) return { x: 0, y: 0 };
  const m = s.shake * MAX_SHAKE_PX;
  return { x: (rand() * 2 - 1) * m, y: (rand() * 2 - 1) * m };
}
