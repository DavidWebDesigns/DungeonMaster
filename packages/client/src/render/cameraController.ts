/**
 * Convierte teclas, borde de pantalla y rueda en movimiento de cámara. Sin DOM: recibe un resumen de la entrada.
 */
import { panCamera, rotateCamera, zoomCamera, type CameraState } from './cameraMath';

export interface CameraInput {
  /** Teclas de dirección pulsadas (WASD y flechas ya normalizadas). */
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Posición del ratón en la pantalla, en [0, 1], o null si está fuera. */
  mouse: { x: number; y: number } | null;
}

export const CAMERA_CONTROLS = {
  /** Velocidad de desplazamiento en pantallas por segundo (así se siente igual con cualquier zoom). */
  panScreensPerSecond: 0.9,
  /** Fracción de la pantalla, en cada borde, que desplaza la cámara con el ratón. */
  edgeFraction: 0.02,
  /** Cuánto cambia el zoom por cada "clic" de rueda. */
  wheelZoomFactor: 1.12,
} as const;

/** Dirección de desplazamiento, cada eje en [-1, 1]: x derecha, y hacia arriba en pantalla. */
export function panDirection(input: CameraInput): { x: number; y: number } {
  let x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let y = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const m = input.mouse;
  if (m && m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1) {
    const e = CAMERA_CONTROLS.edgeFraction;
    if (m.x < e) x -= 1;
    if (m.x > 1 - e) x += 1;
    if (m.y < e) y += 1;
    if (m.y > 1 - e) y -= 1;
  }
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));
  const len = Math.hypot(x, y);
  return len > 1 ? { x: x / len, y: y / len } : { x, y };
}

export function updateCamera(
  cam: CameraState,
  input: CameraInput,
  dtSeconds: number,
  map: { width: number; height: number },
): CameraState {
  const d = panDirection(input);
  if (d.x === 0 && d.y === 0) return cam;
  const reach = cam.zoom * 2 * CAMERA_CONTROLS.panScreensPerSecond * dtSeconds;
  return panCamera(cam, d.x * reach * cam.aspect, d.y * reach, map);
}

/** Rueda: `deltaY` negativo acerca. */
export function applyWheel(cam: CameraState, deltaY: number): CameraState {
  if (deltaY === 0) return cam;
  return zoomCamera(
    cam,
    deltaY < 0 ? 1 / CAMERA_CONTROLS.wheelZoomFactor : CAMERA_CONTROLS.wheelZoomFactor,
  );
}

/** Q y E giran la cámara en pasos de 90°. */
export function applyRotateKey(cam: CameraState, key: string): CameraState {
  if (key === 'q' || key === 'Q') return rotateCamera(cam, -1);
  if (key === 'e' || key === 'E') return rotateCamera(cam, 1);
  return cam;
}
