/**
 * Une el sandbox (simulación), el motor gráfico y la cámara en un bucle de dibujo a la frecuencia de la pantalla.
 */
import type { DataSet } from '@dm/shared';
import { centerOn, defaultCamera, type CameraState } from './render/cameraMath';
import { Renderer } from './render/renderer';
import { LOCAL_PLAYER, Sandbox } from './sandbox/sandbox';

export class Game {
  readonly sandbox: Sandbox;
  readonly renderer: Renderer;
  camera: CameraState;
  /** FPS medidos en el último segundo. */
  fps = 0;
  private lastMs = 0;
  private frames = 0;
  private fpsSince = 0;
  private running = false;

  constructor(
    private readonly host: HTMLElement,
    readonly data: DataSet,
    seed: number,
  ) {
    this.sandbox = new Sandbox(data, seed);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none';
    host.appendChild(canvas);
    this.renderer = new Renderer(canvas, data, LOCAL_PLAYER);

    const base = data.map.bases.find((b) => b.slot === this.sandbox.state.players[0]?.slot);
    const heart = base?.heart ?? { x: 32, y: 32, w: 3, h: 3 };
    this.camera = centerOn(defaultCamera({ x: 0, y: 0 }, this.renderer.aspect), {
      x: heart.x + Math.floor(heart.w / 2),
      y: heart.y + Math.floor(heart.h / 2),
    });
    window.addEventListener('resize', () => this.renderer.resize());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const frame = (nowMs: number) => {
      if (!this.running) return;
      const dt = this.lastMs === 0 ? 0 : nowMs - this.lastMs;
      this.lastMs = nowMs;
      this.sandbox.advance(dt);
      this.camera = { ...this.camera, aspect: this.renderer.aspect };
      this.renderer.render(this.sandbox, this.camera, nowMs / 1000);
      this.countFps(nowMs);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
  }

  private countFps(nowMs: number): void {
    this.frames++;
    if (nowMs - this.fpsSince >= 1000) {
      this.fps = (this.frames * 1000) / (nowMs - this.fpsSince);
      this.frames = 0;
      this.fpsSince = nowMs;
    }
  }
}
