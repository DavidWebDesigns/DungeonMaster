/**
 * Cámara isométrica ortográfica: matemática pura (sin Babylon), para poder probarla.
 *
 * Mundo de dibujo (sistema de mano derecha): x = columna del tile, z = fila del tile, y = altura.
 * El tile (tx, ty) ocupa x en [tx, tx+1] y z en [ty, ty+1]; el suelo está en y = 0 y los muros miden `wallHeight`.
 */
import type { Point } from '@dm/shared';

/** Constantes visuales de la cámara (no son números de juego). */
export const ISO = {
  /** Ángulo de elevación sobre el suelo (isométrico verdadero ≈ 35,264°). */
  elevationDeg: 35.264,
  /** Giro base: la cámara mira en diagonal, y cada paso de rotación suma 90°. */
  baseYawDeg: 45,
  /** Semialtura visible, en tiles: menos = más cerca. */
  minZoom: 4,
  maxZoom: 40,
  defaultZoom: 11,
  /** Distancia de la cámara al punto de mira; en ortográfica solo evita recortes. */
  distance: 120,
  /** Altura de un muro de tierra o roca. */
  wallHeight: 1,
} as const;

export interface CameraState {
  /** Punto de mira sobre el suelo, en coordenadas de mundo. */
  targetX: number;
  targetZ: number;
  /** Pasos de 90° (0 a 3). */
  rotation: number;
  /** Semialtura visible en tiles. */
  zoom: number;
  /** Ancho / alto de la pantalla. */
  aspect: number;
}

export type Vec3 = readonly [number, number, number];

const rad = (deg: number) => (deg * Math.PI) / 180;
const norm = (v: Vec3): Vec3 => {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function yawOf(rotation: number): number {
  return rad(ISO.baseYawDeg + 90 * rotation);
}

/** Ejes de la cámara: hacia dónde mira, qué es "derecha" y qué es "arriba" en pantalla. */
export function cameraBasis(rotation: number): { forward: Vec3; right: Vec3; up: Vec3 } {
  const a = yawOf(rotation);
  const e = rad(ISO.elevationDeg);
  const offset: Vec3 = [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
  const forward = norm([-offset[0], -offset[1], -offset[2]]);
  const right: Vec3 = [Math.cos(a), 0, -Math.sin(a)];
  const up = cross(right, forward);
  return { forward, right, up };
}

/** Posición de la cámara y su punto de mira (para colocar la cámara real del motor). */
export function cameraPose(cam: CameraState): { position: Vec3; target: Vec3 } {
  const { forward } = cameraBasis(cam.rotation);
  const target: Vec3 = [cam.targetX, 0, cam.targetZ];
  return {
    target,
    position: [
      target[0] - forward[0] * ISO.distance,
      target[1] - forward[1] * ISO.distance,
      target[2] - forward[2] * ISO.distance,
    ],
  };
}

/** Límites del volumen ortográfico (para fijar orthoLeft/Right/Top/Bottom en el motor). */
export function orthoBounds(cam: CameraState): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const h = cam.zoom;
  const w = cam.zoom * cam.aspect;
  return { left: -w, right: w, top: h, bottom: -h };
}

/** Rayo paralelo que atraviesa la pantalla en la posición normalizada (nx, ny), cada una en [-1, 1], con y hacia arriba. */
export function rayAt(cam: CameraState, nx: number, ny: number): { origin: Vec3; direction: Vec3 } {
  const { forward, right, up } = cameraBasis(cam.rotation);
  const { position } = cameraPose(cam);
  const sx = nx * cam.zoom * cam.aspect;
  const sy = ny * cam.zoom;
  return {
    direction: forward,
    origin: [
      position[0] + right[0] * sx + up[0] * sy,
      position[1] + right[1] * sx + up[1] * sy,
      position[2] + right[2] * sx + up[2] * sy,
    ],
  };
}

function hitPlane(origin: Vec3, dir: Vec3, y: number): { x: number; z: number } | null {
  if (Math.abs(dir[1]) < 1e-9) return null;
  const t = (y - origin[1]) / dir[1];
  return { x: origin[0] + dir[0] * t, z: origin[2] + dir[2] * t };
}

/**
 * Tile bajo un punto de la pantalla. Un muro tapa lo que tiene detrás, así que primero se mira si el rayo
 * toca la cara superior de un muro (a su altura) y, si no, el suelo.
 */
export function pickTile(
  cam: CameraState,
  nx: number,
  ny: number,
  isWall: (tile: Point) => boolean,
  map: { width: number; height: number },
): Point | null {
  const { origin, direction } = rayAt(cam, nx, ny);
  const inMap = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
  const top = hitPlane(origin, direction, ISO.wallHeight);
  if (top) {
    const t = { x: Math.floor(top.x), y: Math.floor(top.z) };
    if (inMap(t) && isWall(t)) return t;
  }
  const ground = hitPlane(origin, direction, 0);
  if (!ground) return null;
  const t = { x: Math.floor(ground.x), y: Math.floor(ground.z) };
  return inMap(t) ? t : null;
}

/** Los cuatro puntos del suelo (x, z en tiles) que delimitan lo que se ve en pantalla, para dibujarlo en el minimapa. */
export function groundFootprint(cam: CameraState): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  for (const [nx, ny] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ] as const) {
    const { origin, direction } = rayAt(cam, nx, ny);
    const hit = hitPlane(origin, direction, 0);
    if (hit) out.push(hit);
  }
  return out;
}

/** Inversa de `rayAt` para un punto del suelo (o de una altura): posición en pantalla normalizada. */
export function worldToScreen(
  cam: CameraState,
  x: number,
  y: number,
  z: number,
): { nx: number; ny: number } {
  const { right, up } = cameraBasis(cam.rotation);
  const dx = x - cam.targetX;
  const dy = y;
  const dz = z - cam.targetZ;
  return {
    nx: (dx * right[0] + dy * right[1] + dz * right[2]) / (cam.zoom * cam.aspect),
    ny: (dx * up[0] + dy * up[1] + dz * up[2]) / cam.zoom,
  };
}

export function defaultCamera(target: Point, aspect = 16 / 9): CameraState {
  return {
    targetX: target.x + 0.5,
    targetZ: target.y + 0.5,
    rotation: 0,
    zoom: ISO.defaultZoom,
    aspect,
  };
}

/** Gira la cámara un paso de 90° alrededor del punto de mira. */
export function rotateCamera(cam: CameraState, step: 1 | -1): CameraState {
  return { ...cam, rotation: (cam.rotation + step + 4) % 4 };
}

/** Acerca o aleja multiplicando el zoom (factor < 1 acerca), dentro de los límites. */
export function zoomCamera(cam: CameraState, factor: number): CameraState {
  return { ...cam, zoom: Math.max(ISO.minZoom, Math.min(ISO.maxZoom, cam.zoom * factor)) };
}

/** Mueve el punto de mira sobre el suelo: `right` hacia la derecha de la pantalla y `forward` hacia "arriba" en pantalla, en tiles. */
export function panCamera(
  cam: CameraState,
  right: number,
  forward: number,
  map: { width: number; height: number },
): CameraState {
  const b = cameraBasis(cam.rotation);
  const fh = norm([b.forward[0], 0, b.forward[2]]);
  const x = cam.targetX + b.right[0] * right + fh[0] * forward;
  const z = cam.targetZ + b.right[2] * right + fh[2] * forward;
  return {
    ...cam,
    targetX: Math.max(0, Math.min(map.width, x)),
    targetZ: Math.max(0, Math.min(map.height, z)),
  };
}

/** Centra la cámara en un tile (por ejemplo el Corazón). */
export function centerOn(cam: CameraState, tile: Point): CameraState {
  return { ...cam, targetX: tile.x + 0.5, targetZ: tile.y + 0.5 };
}
