/**
 * Motor gráfico: crea Babylon (motor, escena, luces, cámara ortográfica) y dibuja un frame del sandbox.
 */
import { Engine } from '@babylonjs/core/Engines/engine';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import { rulesOf, visibleMask, type DataSet } from '@dm/shared';
import type { GameSource } from '../sandbox/source';
import { cameraPose, orthoBounds, type CameraState } from './cameraMath';
import { EntitiesView } from './entitiesView';
import { crackTiles } from './cracks';
import { OverlayView } from './overlayView';
import { ParticlesView } from './particlesView';
import type { ParticleSim } from '../feel/particleSim';
import type { Preview } from '../input/inputModel';
import { TerrainView } from './terrainView';
import { TerrainStyles } from './terrainStyles';

export class Renderer {
  readonly engine: Engine;
  readonly scene: Scene;
  private readonly camera: FreeCamera;
  private readonly terrain: TerrainView;
  private readonly styles = new TerrainStyles();
  private readonly entities: EntitiesView;
  private readonly overlay: OverlayView;
  /** Grietas de los muros que los Imps propios están excavando. */
  private readonly cracks: OverlayView;
  private readonly particles: ParticlesView;
  private lastTick = -1;
  private visible: Uint8Array | null = null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly data: DataSet,
    private readonly localPlayer: number,
  ) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false });
    this.scene = new Scene(this.engine);
    // El mundo de dibujo es de mano derecha (x = columna, z = fila, y = altura).
    this.scene.useRightHandedSystem = true;
    this.scene.clearColor = new Color4(0.05, 0.04, 0.07, 1);
    this.scene.autoClear = true;

    // Mazmorra oscura y acogedora: ambiente bajo y una luz direccional para dar volumen a los bloques.
    const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
    ambient.intensity = 0.55;
    ambient.groundColor = new Color3(0.25, 0.22, 0.3);
    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.3), this.scene);
    sun.intensity = 0.8;

    this.camera = new FreeCamera('cam', new Vector3(0, 50, 0), this.scene);
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 0.1;
    this.camera.maxZ = 400;

    this.terrain = new TerrainView(this.scene, data.map.width, data.map.height);
    this.entities = new EntitiesView(this.scene);
    this.overlay = new OverlayView(this.scene, data.map.width, data.map.height);
    this.cracks = new OverlayView(this.scene, data.map.width, data.map.height, 'cracks');
    this.particles = new ParticlesView(this.scene);
  }

  /** Animaciones puntuales de las criaturas. */
  get anims() {
    return this.entities.anims;
  }

  /** Aspecto de cada tile (con la niebla ya aplicada), para el minimapa. */
  get tileStyles() {
    return this.styles.styles;
  }

  /** Tiles que se ven ahora (null sin niebla). */
  get visibleMask() {
    return this.visible;
  }

  /** Altura del bloque dibujado en un tile (para saber si es un muro al apuntar con el ratón). */
  tileHeight(x: number, y: number): number | undefined {
    return this.styles.styles[y * this.data.map.width + x]?.height;
  }

  /** Aspecto actual de la ventana (ancho / alto). */
  get aspect(): number {
    return this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
  }

  resize(): void {
    this.engine.resize();
  }

  render(
    sandbox: GameSource,
    cam: CameraState,
    timeSeconds: number,
    preview: Preview,
    particles: ParticleSim,
    handAt: { x: number; y: number } | null = null,
    /** Niebla de guerra activa (partida contra un rival). */
    fog = false,
    /** Criatura propia bajo el cursor: se dibuja resaltada. */
    hoverUnit: { kind: 'creature' | 'imp'; id: number } | null = null,
  ): void {
    const pose = cameraPose(cam);
    this.camera.position.set(...pose.position);
    this.camera.setTarget(new Vector3(...pose.target));
    const b = orthoBounds(cam);
    this.camera.orthoLeft = b.left;
    this.camera.orthoRight = b.right;
    this.camera.orthoTop = b.top;
    this.camera.orthoBottom = b.bottom;

    if (sandbox.state.tick !== this.lastTick) {
      this.lastTick = sandbox.state.tick;
      const player = sandbox.state.players.find((p) => p.id === this.localPlayer);
      const mask =
        fog && player
          ? {
              visible: visibleMask(sandbox.state, rulesOf(this.data), this.localPlayer),
              seen: player.seen,
            }
          : null;
      this.visible = mask ? mask.visible : null;
      this.terrain.update(
        this.styles.sync(sandbox.state, this.data, this.localPlayer, mask),
        this.styles.styles,
      );
    }
    this.entities.update(
      sandbox,
      this.data,
      timeSeconds,
      handAt,
      this.visible,
      this.localPlayer,
      hoverUnit,
    );
    this.overlay.set(preview, this.styles.styles);
    this.cracks.setTiles(
      crackTiles(sandbox.state, this.data, this.localPlayer),
      this.styles.styles,
    );
    this.particles.update(particles);
    this.scene.render();
  }

  dispose(): void {
    this.scene.dispose();
    this.engine.dispose();
  }
}
