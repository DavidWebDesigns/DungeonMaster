/**
 * Une el sandbox (simulación), el motor gráfico y la cámara en un bucle de dibujo a la frecuencia de la pantalla.
 */
import type { DataSet } from '@dm/shared';
import { applyRotateKey, applyWheel, updateCamera } from './render/cameraController';
import {
  centerOn,
  defaultCamera,
  pickTile,
  worldToScreen,
  type CameraState,
} from './render/cameraMath';
import { DomInput } from './input/domInput';
import { InputModel } from './input/inputModel';
import { keyAction } from './input/keymap';
import { errorMessage } from './input/messages';
import { render as renderUi } from 'preact';
import { Hud } from './ui/Hud';
import { buildHudModel } from './ui/hudModel';
import { treasuryCapacity, rulesOf } from '@dm/shared';
import { Renderer } from './render/renderer';
import { LOCAL_PLAYER, Sandbox } from './sandbox/sandbox';

export class Game {
  readonly sandbox: Sandbox;
  readonly renderer: Renderer;
  camera: CameraState;
  readonly input: InputModel;
  /** Último aviso para el jugador (texto del consejero) y el tick en que salió. */
  notice: { text: string; tick: number } | null = null;
  /** FPS medidos en el último segundo. */
  fps = 0;
  private readonly dom: DomInput;
  private readonly hudHost: HTMLElement;
  private hudKey = '';
  private wasFull = false;
  private readonly heartTile: { x: number; y: number };
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
    this.heartTile = { x: heart.x + Math.floor(heart.w / 2), y: heart.y + Math.floor(heart.h / 2) };

    this.input = new InputModel(
      {
        state: this.sandbox.state,
        data,
        player: LOCAL_PLAYER,
        send: (cmd) => this.sandbox.send(cmd),
      },
      (_cmd, res) => {
        if (!res.ok) this.notice = { text: errorMessage(res.error), tick: this.sandbox.state.tick };
      },
    );
    const map = data.map;
    this.dom = new DomInput(canvas, {
      pick: (nx, ny) =>
        pickTile(this.camera, nx, ny, (t) => (this.renderer.tileHeight(t.x, t.y) ?? 0) > 0.9, map),
      move: (t) => this.input.pointerMove(t),
      down: (t, button, shift) => this.input.pointerDown(t, button, shift),
      up: (t) => this.input.pointerUp(t),
      wheel: (dy) => (this.camera = applyWheel(this.camera, dy)),
      key: (k) => this.onKey(k),
    });
    this.hudHost = document.createElement('div');
    host.appendChild(this.hudHost);
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
      this.camera = updateCamera(
        { ...this.camera, aspect: this.renderer.aspect },
        this.dom.cameraInput(),
        dt / 1000,
        this.data.map,
      );
      this.input.pump();
      this.updateHud();
      this.renderer.render(this.sandbox, this.camera, nowMs / 1000, this.input.preview());
      this.countFps(nowMs);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Repinta el HUD solo cuando algo que se ve ha cambiado (cada tick, o al cambiar de herramienta). */
  private updateHud(): void {
    const { state } = this.sandbox;
    this.checkTreasury();
    const key = `${state.tick}|${JSON.stringify(this.input.tool)}|${this.notice?.tick ?? ''}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const model = buildHudModel(state, this.data, LOCAL_PLAYER, this.input.tool, this.notice);
    renderUi(
      Hud({
        model,
        onTool: (tool) => {
          this.input.setTool(tool);
          this.hudKey = '';
        },
      }),
      this.hudHost,
    );
  }

  /** Aviso del consejero cuando la Tesorería se llena. */
  private checkTreasury(): void {
    const { state } = this.sandbox;
    const player = state.players[0];
    if (!player) return;
    const cap = treasuryCapacity(state, rulesOf(this.data), LOCAL_PLAYER);
    const full = cap > 0 && player.gold >= cap - 0.5;
    if (full && !this.wasFull)
      this.notice = {
        text: 'La Tesorería está llena: gasta oro o construye otra.',
        tick: state.tick,
      };
    this.wasFull = full;
  }

  /** Posición en píxeles de la ventana del centro de un tile (para pruebas de navegador y avisos en pantalla).
   * `height` es la altura a la que se mira: 1 para la cara superior de un muro, ~0,1 para un suelo. */
  tileToScreen(x: number, y: number, height = 0.05): { x: number; y: number } {
    const r = this.renderer.canvas.getBoundingClientRect();
    const s = worldToScreen(this.camera, x + 0.5, height, y + 0.5);
    return { x: r.left + ((s.nx + 1) / 2) * r.width, y: r.top + ((1 - s.ny) / 2) * r.height };
  }

  private onKey(key: string): void {
    const action = keyAction(key, this.data);
    this.camera = applyRotateKey(this.camera, key);
    if (!action) return;
    if (action.type === 'tool') this.input.setTool(action.tool);
    else if (action.type === 'cancel') this.input.setTool({ kind: 'dig' });
    else if (action.type === 'center') this.camera = centerOn(this.camera, this.heartTile);
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
