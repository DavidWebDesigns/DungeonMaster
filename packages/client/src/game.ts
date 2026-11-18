/**
 * Une el sandbox (simulación), el motor gráfico, la entrada y el HUD en un bucle de dibujo
 * a la frecuencia de la pantalla. El cliente nunca cambia el estado por su cuenta: solo envía comandos.
 */
import { render as renderUi } from 'preact';
import { rulesOf, treasuryCapacity, type DataSet, type SimEvent } from '@dm/shared';
import { deriveEffects, takeSnapshot, type FeelSnapshot, type SoundName } from './feel/effects';
import { ParticleSim } from './feel/particleSim';
import { AudioEngine } from './feel/sounds';
import { DomInput } from './input/domInput';
import { InputModel } from './input/inputModel';
import { keyAction } from './input/keymap';
import { errorMessage } from './input/messages';
import { applyRotateKey, applyWheel, updateCamera } from './render/cameraController';
import {
  centerOn,
  defaultCamera,
  pickTile,
  worldToScreen,
  type CameraState,
} from './render/cameraMath';
import { Renderer } from './render/renderer';
import { LOCAL_PLAYER, Sandbox } from './sandbox/sandbox';
import { adviceFor } from './ui/advisor';
import { Hud } from './ui/Hud';
import { buildHudModel, NOTICE_SECONDS, NOTICES_VISIBLE } from './ui/hudModel';
import { NoticeLog } from './ui/notices';

/** Radio (en alturas de pantalla) dentro del cual un clic coge a una criatura. */
const CREATURE_PICK_RADIUS = 0.07;

export class Game {
  readonly sandbox: Sandbox;
  readonly renderer: Renderer;
  camera: CameraState;
  readonly input: InputModel;
  readonly notices: NoticeLog;
  /** FPS medidos en el último segundo. */
  fps = 0;
  readonly particles = new ParticleSim();
  readonly audio = new AudioEngine();
  private readonly dom: DomInput;
  private feelSnapshot: FeelSnapshot;
  private readonly hudHost: HTMLElement;
  private hudKey = '';
  private wasFull = false;
  private lastFeelTick = -1;
  /** Tipo de cada criatura por id (para nombrar a las que ya no existen cuando llega su aviso). */
  private readonly creatureTypes = new Map<number, string>();
  private readonly heartTile: { x: number; y: number };
  private lastMs = 0;
  private frames = 0;
  private fpsSince = 0;
  private running = false;

  constructor(
    host: HTMLElement,
    readonly data: DataSet,
    seed: number,
  ) {
    this.sandbox = new Sandbox(data, seed);
    this.feelSnapshot = takeSnapshot(this.sandbox.state);
    this.notices = new NoticeLog({
      lifeTicks: NOTICE_SECONDS * data.global.tickRate,
      visible: NOTICES_VISIBLE,
    });
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none';
    host.appendChild(canvas);
    this.renderer = new Renderer(canvas, data, LOCAL_PLAYER);

    const base = data.map.bases.find((b) => b.slot === this.sandbox.state.players[0]?.slot);
    const heart = base?.heart ?? { x: 32, y: 32, w: 3, h: 3 };
    this.heartTile = {
      x: heart.x + Math.floor(heart.w / 2),
      y: heart.y + Math.floor(heart.h / 2),
    };
    this.camera = centerOn(defaultCamera({ x: 0, y: 0 }, this.renderer.aspect), this.heartTile);

    this.input = new InputModel(
      {
        state: this.sandbox.state,
        data,
        player: LOCAL_PLAYER,
        send: (cmd) => this.sandbox.send(cmd),
      },
      (cmd, res) => {
        if (!res.ok) {
          this.say(errorMessage(res.error));
          this.playSound('error', 0.8);
        } else if (cmd.type === 'pickUp') {
          this.playSound('pickup', 1);
        }
      },
    );

    const map = data.map;
    this.dom = new DomInput(canvas, {
      pick: (nx, ny) =>
        pickTile(this.camera, nx, ny, (t) => (this.renderer.tileHeight(t.x, t.y) ?? 0) > 0.9, map),
      creatureAt: (nx, ny) => this.creatureAt(nx, ny),
      move: (t, creature) => this.input.pointerMove(t, creature),
      down: (t, button, shift, creature) => {
        this.audio.unlock();
        this.playSound('click', 1);
        this.input.pointerDown(t, button, shift, creature);
      },
      up: (t) => this.input.pointerUp(t),
      wheel: (dy) => (this.camera = applyWheel(this.camera, dy)),
      key: (k) => this.onKey(k),
    });

    this.hudHost = document.createElement('div');
    host.appendChild(this.hudHost);
    window.addEventListener('resize', () => this.renderer.resize());
  }

  /**
   * Avanza `seconds` segundos de juego de golpe (para pruebas y depuración). A diferencia de llamar a
   * `sandbox.advance` a mano, los eventos pasan por los efectos y por el consejero como en el juego normal.
   */
  fastForward(seconds: number): void {
    for (let i = 0; i < seconds; i++) this.feel(this.sandbox.advance(1000), 1);
  }

  /** Último aviso para el jugador (para pruebas y depuración). */
  get notice(): { text: string; tick: number } | null {
    return this.notices.latest();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const frame = (nowMs: number) => {
      if (!this.running) return;
      const dt = this.lastMs === 0 ? 0 : nowMs - this.lastMs;
      this.lastMs = nowMs;
      this.feel(this.sandbox.advance(dt), dt / 1000);
      this.camera = updateCamera(
        { ...this.camera, aspect: this.renderer.aspect },
        this.dom.cameraInput(),
        dt / 1000,
        this.data.map,
      );
      this.input.pump();
      this.updateHud();
      const hover = this.input.hover;
      this.renderer.render(
        this.sandbox,
        this.camera,
        nowMs / 1000,
        this.input.preview(),
        this.particles,
        hover ? { x: hover.x + 0.5, y: hover.y + 0.5 } : null,
      );
      this.countFps(nowMs);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
  }

  /** Aviso del consejero en pantalla. */
  private say(text: string, key = text, cooldownTicks = 0): void {
    this.notices.add(text, this.sandbox.state.tick, key, cooldownTicks);
  }

  /** Efectos y avisos de lo que pasó en la simulación, y avance de las partículas. */
  private feel(events: SimEvent[], dtSeconds: number): void {
    const { state } = this.sandbox;
    for (const c of state.creatures) this.creatureTypes.set(c.id, c.type);
    if (state.tick !== this.lastFeelTick) {
      const effects = deriveEffects(this.feelSnapshot, state, this.data, events, LOCAL_PLAYER);
      for (const e of effects) {
        if (e.type === 'burst') this.particles.burst(e);
        else this.playSound(e.sound, e.volume);
      }
      for (const a of adviceFor(events, state, this.data, LOCAL_PLAYER, (id) =>
        this.creatureTypes.get(id),
      )) {
        this.say(a.text, a.key, a.cooldownTicks);
      }
      this.feelSnapshot = takeSnapshot(state);
      this.lastFeelTick = state.tick;
    }
    this.particles.step(dtSeconds);
  }

  private playSound(sound: SoundName, volume: number): void {
    this.audio.play(sound, volume);
  }

  /** Repinta el HUD solo cuando algo que se ve ha cambiado (cada tick, o al cambiar de herramienta). */
  private updateHud(): void {
    const { state } = this.sandbox;
    this.checkTreasury();
    const key = `${state.tick}|${JSON.stringify(this.input.tool)}|${this.notices.latest()?.tick ?? ''}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const model = buildHudModel(
      state,
      this.data,
      LOCAL_PLAYER,
      this.input.tool,
      this.notices.active(state.tick),
    );
    renderUi(
      Hud({
        model,
        onTool: (tool) => {
          this.input.setTool(tool);
          this.hudKey = '';
        },
        onSelectCreature: (id) => {
          const c = state.creatures.find((k) => k.id === id);
          if (c) this.camera = centerOn(this.camera, { x: Math.floor(c.x), y: Math.floor(c.y) });
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
    if (full && !this.wasFull) this.say('La Tesorería está llena: gasta oro o construye otra.');
    this.wasFull = full;
  }

  /** Criatura propia (no recogida) que se ve bajo un punto de la pantalla, la más cercana. */
  private creatureAt(nx: number, ny: number): number | null {
    let best: number | null = null;
    let bestD = CREATURE_PICK_RADIUS;
    for (const c of this.sandbox.state.creatures) {
      if (c.owner !== LOCAL_PLAYER || c.held) continue;
      const s = worldToScreen(this.camera, c.x, 0.35, c.y);
      const d = Math.hypot((nx - s.nx) * this.camera.aspect, ny - s.ny);
      if (d < bestD) {
        bestD = d;
        best = c.id;
      }
    }
    return best;
  }

  /** Posición en píxeles de la ventana del centro de un tile (para pruebas de navegador y avisos en pantalla).
   * `height` es la altura a la que se mira: 1 para la cara superior de un muro, ~0,1 para un suelo. */
  tileToScreen(x: number, y: number, height = 0.05): { x: number; y: number } {
    const r = this.renderer.canvas.getBoundingClientRect();
    const s = worldToScreen(this.camera, x + 0.5, height, y + 0.5);
    return { x: r.left + ((s.nx + 1) / 2) * r.width, y: r.top + ((1 - s.ny) / 2) * r.height };
  }

  /** Posición en píxeles de la ventana de una criatura (para pruebas de navegador). */
  creatureToScreen(id: number): { x: number; y: number } | null {
    const c = this.sandbox.state.creatures.find((k) => k.id === id);
    if (!c) return null;
    const r = this.renderer.canvas.getBoundingClientRect();
    const s = worldToScreen(this.camera, c.x, 0.35, c.y);
    return { x: r.left + ((s.nx + 1) / 2) * r.width, y: r.top + ((1 - s.ny) / 2) * r.height };
  }

  private onKey(key: string): void {
    this.audio.unlock();
    const action = keyAction(key, this.data);
    this.camera = applyRotateKey(this.camera, key);
    if (!action) return;
    if (action.type === 'tool') this.input.setTool(action.tool);
    else if (action.type === 'cancel') this.input.setTool({ kind: 'dig' });
    else if (action.type === 'center') this.camera = centerOn(this.camera, this.heartTile);
    else if (action.type === 'slap') this.input.slapHovered();
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
