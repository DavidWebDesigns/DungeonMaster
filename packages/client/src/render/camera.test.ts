import { describe, expect, it } from 'vitest';
import {
  ISO,
  cameraBasis,
  centerOn,
  defaultCamera,
  orthoBounds,
  panCamera,
  pickTile,
  rayAt,
  rotateCamera,
  worldToScreen,
  zoomCamera,
  type CameraState,
} from './cameraMath';
import {
  CAMERA_CONTROLS,
  applyRotateKey,
  applyWheel,
  panDirection,
  updateCamera,
} from './cameraController';

const map = { width: 64, height: 64 };
const noWalls = () => false;
const cam = (over: Partial<CameraState> = {}): CameraState => ({
  ...defaultCamera({ x: 30, y: 30 }),
  ...over,
});

describe('ejes de la cámara', () => {
  it.each([0, 1, 2, 3])('con rotación %i los ejes son unitarios y perpendiculares', (r) => {
    const { forward, right, up } = cameraBasis(r);
    const dot = (a: readonly number[], b: readonly number[]) =>
      a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(dot(forward, forward)).toBeCloseTo(1);
    expect(dot(right, right)).toBeCloseTo(1);
    expect(dot(up, up)).toBeCloseTo(1);
    expect(dot(forward, right)).toBeCloseTo(0);
    expect(dot(forward, up)).toBeCloseTo(0);
    expect(dot(right, up)).toBeCloseTo(0);
    expect(forward[1]).toBeLessThan(0); // mira hacia el suelo
    expect(up[1]).toBeGreaterThan(0); // "arriba" en pantalla sube
  });
});

describe('seleccionar el tile bajo el ratón', () => {
  it.each([0, 1, 2, 3])('el centro de la pantalla es el tile de mira (rotación %i)', (r) => {
    const c = cam({ rotation: r });
    expect(pickTile(c, 0, 0, noWalls, map)).toEqual({ x: 30, y: 30 });
  });

  it.each([0, 1, 2, 3])(
    'ida y vuelta: el centro de cualquier tile se proyecta y se recupera (rotación %i)',
    (r) => {
      const c = cam({ rotation: r, zoom: 10 });
      for (const t of [
        { x: 27, y: 28 },
        { x: 33, y: 31 },
        { x: 30, y: 25 },
        { x: 24, y: 33 },
      ]) {
        const s = worldToScreen(c, t.x + 0.5, 0, t.y + 0.5);
        expect(Math.abs(s.nx) <= 1 && Math.abs(s.ny) <= 1, `${t.x},${t.y} fuera de pantalla`).toBe(
          true,
        );
        expect(pickTile(c, s.nx, s.ny, noWalls, map)).toEqual(t);
      }
    },
  );

  it('un muro tapa el suelo de detrás: al apuntar a su cara superior se elige el muro', () => {
    const c = cam({ zoom: 10 });
    const wall = { x: 30, y: 30 };
    const s = worldToScreen(c, wall.x + 0.5, ISO.wallHeight, wall.y + 0.5);
    const isWall = (t: { x: number; y: number }) => t.x === wall.x && t.y === wall.y;
    expect(pickTile(c, s.nx, s.ny, isWall, map)).toEqual(wall);
    // Sin ese muro, el mismo punto de pantalla cae en otro tile del suelo.
    expect(pickTile(c, s.nx, s.ny, noWalls, map)).not.toEqual(wall);
  });

  it('fuera del mapa no hay tile', () => {
    const c = cam({ targetX: 0.5, targetZ: 0.5, zoom: 6 });
    expect(pickTile(c, -0.95, 0, noWalls, map)).toBeNull();
  });

  it('los rayos son paralelos (cámara ortográfica)', () => {
    const c = cam();
    expect(rayAt(c, -0.5, 0.3).direction).toEqual(rayAt(c, 0.7, -0.2).direction);
  });

  it('la pantalla ancha ve más ancho que alto', () => {
    const b = orthoBounds(cam({ aspect: 2, zoom: 10 }));
    expect(b.right - b.left).toBeCloseTo(40);
    expect(b.top - b.bottom).toBeCloseTo(20);
  });
});

describe('rotación', () => {
  it('da la vuelta en 4 pasos y vuelve atrás', () => {
    let c = cam();
    for (let i = 0; i < 4; i++) c = rotateCamera(c, 1);
    expect(c.rotation).toBe(0);
    expect(rotateCamera(cam(), -1).rotation).toBe(3);
  });

  it('girar no mueve el punto de mira', () => {
    const c = rotateCamera(cam(), 1);
    expect(pickTile(c, 0, 0, noWalls, map)).toEqual({ x: 30, y: 30 });
  });

  it('Z y X giran en sentidos opuestos y otras teclas no hacen nada', () => {
    expect(applyRotateKey(cam(), 'x').rotation).toBe(1);
    expect(applyRotateKey(cam(), 'z').rotation).toBe(3);
    expect(applyRotateKey(cam(), 'q')).toEqual(cam());
  });
});

describe('zoom', () => {
  it('respeta los límites', () => {
    expect(zoomCamera(cam(), 0.0001).zoom).toBe(ISO.minZoom);
    expect(zoomCamera(cam(), 1000).zoom).toBe(ISO.maxZoom);
  });

  it('la rueda hacia arriba acerca y hacia abajo aleja', () => {
    expect(applyWheel(cam(), -100).zoom).toBeLessThan(cam().zoom);
    expect(applyWheel(cam(), 100).zoom).toBeGreaterThan(cam().zoom);
    expect(applyWheel(cam(), 0)).toEqual(cam());
  });

  it('acercar mantiene el tile del centro', () => {
    expect(pickTile(zoomCamera(cam(), 0.5), 0, 0, noWalls, map)).toEqual({ x: 30, y: 30 });
  });
});

describe('desplazamiento', () => {
  it.each([0, 1, 2, 3])(
    '"hacia arriba" en pantalla acerca el punto de mira a lo que se ve arriba (rotación %i)',
    (r) => {
      const c = cam({ rotation: r });
      const moved = panCamera(c, 0, 5, map);
      const before = worldToScreen(c, moved.targetX, 0, moved.targetZ);
      expect(before.ny).toBeGreaterThan(0);
      expect(Math.abs(before.nx)).toBeLessThan(1e-9);
    },
  );

  it('"derecha" mueve hacia la derecha de la pantalla', () => {
    const c = cam({ rotation: 1 });
    const moved = panCamera(c, 4, 0, map);
    const s = worldToScreen(c, moved.targetX, 0, moved.targetZ);
    expect(s.nx).toBeGreaterThan(0);
    expect(Math.abs(s.ny)).toBeLessThan(1e-9);
  });

  it('no sale del mapa', () => {
    const c = panCamera(cam(), -1000, -1000, map);
    expect(c.targetX).toBeGreaterThanOrEqual(0);
    expect(c.targetZ).toBeGreaterThanOrEqual(0);
    const d = panCamera(cam(), 1000, 1000, map);
    expect(d.targetX).toBeLessThanOrEqual(64);
    expect(d.targetZ).toBeLessThanOrEqual(64);
  });

  it('centerOn pone la mira en un tile', () => {
    expect(pickTile(centerOn(cam(), { x: 10, y: 12 }), 0, 0, noWalls, map)).toEqual({
      x: 10,
      y: 12,
    });
  });
});

describe('controles', () => {
  const idle = { up: false, down: false, left: false, right: false, mouse: null };

  it('sin entrada no hay movimiento', () => {
    expect(panDirection(idle)).toEqual({ x: 0, y: 0 });
    const c = cam();
    expect(updateCamera(c, idle, 0.016, map)).toBe(c);
  });

  it('el borde de la pantalla desplaza la cámara hacia ese lado', () => {
    expect(panDirection({ ...idle, mouse: { x: 0.001, y: 0.5 } })).toEqual({ x: -1, y: 0 });
    expect(panDirection({ ...idle, mouse: { x: 0.999, y: 0.5 } })).toEqual({ x: 1, y: 0 });
    expect(panDirection({ ...idle, mouse: { x: 0.5, y: 0.001 } })).toEqual({ x: 0, y: 1 });
    expect(panDirection({ ...idle, mouse: { x: 0.5, y: 0.999 } })).toEqual({ x: 0, y: -1 });
    expect(panDirection({ ...idle, mouse: { x: 0.5, y: 0.5 } })).toEqual({ x: 0, y: 0 });
  });

  it('en diagonal no es más rápido, y teclas opuestas se anulan', () => {
    const d = panDirection({ ...idle, up: true, right: true });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(panDirection({ ...idle, left: true, right: true })).toEqual({ x: 0, y: 0 });
  });

  it('el ratón fuera de la ventana no cuenta', () => {
    expect(panDirection({ ...idle, mouse: { x: -0.1, y: 0.5 } })).toEqual({ x: 0, y: 0 });
  });

  it('la velocidad es proporcional al zoom: se recorre la misma fracción de pantalla', () => {
    const near = updateCamera(cam({ zoom: 6 }), { ...idle, up: true }, 0.5, map);
    const far = updateCamera(cam({ zoom: 24 }), { ...idle, up: true }, 0.5, map);
    const dist = (c: CameraState) => Math.hypot(c.targetX - 30.5, c.targetZ - 30.5);
    expect(dist(far) / dist(near)).toBeCloseTo(4);
    expect(dist(near)).toBeCloseTo(6 * 2 * CAMERA_CONTROLS.panScreensPerSecond * 0.5);
  });
});
