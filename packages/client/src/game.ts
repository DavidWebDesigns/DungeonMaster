/**
 * Une el sandbox (simulación), el motor gráfico, la entrada y el HUD en un bucle de dibujo
 * a la frecuencia de la pantalla. El cliente nunca cambia el estado por su cuenta: solo envía comandos.
 */
import { render as renderUi } from 'preact';
import {
  canSee,
  isInCombat,
  rulesOf,
  treasuryCapacity,
  type DataSet,
  type SimEvent,
} from '@dm/shared';
import { deriveEffects, takeSnapshot, type FeelSnapshot, type SoundName } from './feel/effects';
import { ParticleSim } from './feel/particleSim';
import { AudioEngine } from './feel/sounds';
import { DomInput } from './input/domInput';
import { InputModel, type HoverUnit } from './input/inputModel';
import { localStatsRows, type EndStatsRow } from './ui/endStats';
import { keyAction } from './input/keymap';
import { decay, heartHit, initialScreenFx, shakeOffset } from './feel/screenFx';
import { FloaterList, floaterPose } from './feel/anim';
import { speedLabel } from './ui/speedLabel';
import { roomCostTag, roomHoverText, roomPreviewText } from './input/roomInfo';
import { impActivityLabel } from './render/creatureStyle';
import { minimapPixels } from './ui/minimap';
import { MinimapView } from './ui/minimapView';
import { errorMessage } from './input/messages';
import { applyRotateKey, applyWheel, updateCamera } from './render/cameraController';
import {
  centerOn,
  centerOnAboveHud,
  defaultCamera,
  groundFootprint,
  pickTile,
  worldToScreen,
  type CameraState,
} from './render/cameraMath';
import { Renderer } from './render/renderer';
import type { GameSource } from './sandbox/source';
import { ghostPreview } from './net/ghosts';
import type { Command, EndedMsg } from '@dm/shared';
import { adviceFor } from './ui/advisor';
import { Hud } from './ui/Hud';
import { buildHudModel, NOTICE_SECONDS, NOTICES_VISIBLE } from './ui/hudModel';
import { NoticeLog } from './ui/notices';

/** Radio (en alturas de pantalla) dentro del cual un clic coge a una criatura. */
const CREATURE_PICK_RADIUS = 0.09;
/** Clave del almacenamiento local donde se recuerda si el sonido está silenciado. */
const MUTE_KEY = 'dm.muted';

export class Game {
  /** La fuente del estado: el sandbox local o la conexión con el servidor. */
  readonly sandbox: GameSource;
  /** Jugador local. */
  readonly me: number;
  readonly renderer: Renderer;
  camera: CameraState;
  readonly input: InputModel;
  readonly notices: NoticeLog;
  /** Estadísticas de fin de partida (en red). */
  endStats: EndedMsg['stats'] | null = null;
  /** FPS medidos en el último segundo. */
  fps = 0;
  readonly particles = new ParticleSim();
  readonly audio = new AudioEngine();
  private screenFx = initialScreenFx();
  /** Reloj de dibujo en segundos (el mismo que usa el renderer para las animaciones). */
  private nowSeconds = 0;
  private readonly floaters = new FloaterList();
  private readonly floaterLayer: HTMLDivElement;
  private readonly minimap: MinimapView;
  private minimapTick = -1;
  private lastCycledId = 0;
  private readonly alertEl: HTMLDivElement;
  private readonly dom: DomInput;
  private feelSnapshot: FeelSnapshot;
  private readonly hudHost: HTMLElement;
  private readonly hoverCard: HTMLElement;
  /** Etiqueta con el coste en vivo de lo que se va a construir (sigue al cursor). */
  private readonly buildTag: HTMLElement;
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

  /** Partida contra un bot rival (con niebla de guerra). */
  readonly versus: boolean;
  private surrenderArmedUntil = -1;

  constructor(
    host: HTMLElement,
    readonly data: DataSet,
    source: GameSource,
  ) {
    this.sandbox = source;
    this.me = source.localPlayer;
    this.versus = source.versus;
    this.feelSnapshot = takeSnapshot(this.sandbox.state);
    this.notices = new NoticeLog({
      lifeTicks: NOTICE_SECONDS * data.global.tickRate,
      visible: NOTICES_VISIBLE,
    });
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block;outline:none';
    host.appendChild(canvas);
    this.floaterLayer = document.createElement('div');
    this.floaterLayer.className = 'floaters';
    host.appendChild(this.floaterLayer);
    try {
      this.audio.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Sin almacenamiento: sonido activado por defecto.
    }
    this.minimap = new MinimapView(host, data.map, (t) => {
      this.camera = centerOn(this.camera, t);
    });
    this.alertEl = document.createElement('div');
    this.alertEl.className = 'heart-alert';
    host.appendChild(this.alertEl);
    this.renderer = new Renderer(canvas, data, this.me);

    const base = data.map.bases.find(
      (b) => b.slot === this.sandbox.state.players.find((p) => p.id === this.me)?.slot,
    );
    const heart = base?.heart ?? { x: 32, y: 32, w: 3, h: 3 };
    this.heartTile = {
      x: heart.x + Math.floor(heart.w / 2),
      y: heart.y + Math.floor(heart.h / 2),
    };
    this.camera = centerOnAboveHud(
      defaultCamera({ x: 0, y: 0 }, this.renderer.aspect),
      this.heartTile,
    );

    this.input = new InputModel(
      {
        state: this.sandbox.state,
        data,
        player: this.me,
        send: (cmd) => this.sandbox.send(cmd),
      },
      (cmd, res) => {
        if (!res.ok) {
          this.say(
            errorMessage(res.error, {
              cmd,
              data,
              state: this.sandbox.state,
              player: this.me,
            }),
          );
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
      unitAt: (nx, ny) => this.unitAt(nx, ny),
      move: (t, unit) => this.input.pointerMove(t, unit),
      down: (t, button, shift, unit) => {
        this.audio.unlock();
        this.playSound('click', 1);
        this.input.pointerDown(t, button, shift, unit);
      },
      up: (t) => this.input.pointerUp(t),
      wheel: (dy) => (this.camera = applyWheel(this.camera, dy)),
      key: (k) => this.onKey(k),
    });

    this.hudHost = document.createElement('div');
    host.appendChild(this.hudHost);
    this.hoverCard = document.createElement('div');
    this.hoverCard.className = 'hovercard';
    this.hoverCard.style.display = 'none';
    host.appendChild(this.hoverCard);
    this.buildTag = document.createElement('div');
    this.buildTag.className = 'buildtag';
    this.buildTag.style.display = 'none';
    host.appendChild(this.buildTag);
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
      this.nowSeconds = nowMs / 1000;
      this.feel(this.sandbox.advance(dt), dt / 1000);
      this.camera = updateCamera(
        { ...this.camera, aspect: this.renderer.aspect },
        this.dom.cameraInput(),
        dt / 1000,
        this.data.map,
      );
      this.input.pump();
      this.updateHud();
      this.updateMinimap();
      const hover = this.input.hover;
      this.renderer.render(
        this.sandbox,
        this.camera,
        nowMs / 1000,
        this.previewWithGhosts(),
        this.particles,
        hover ? { x: hover.x + 0.5, y: hover.y + 0.5 } : null,
        this.versus && !this.sandbox.debug?.revealMap,
        this.input.hoverUnit,
      );
      this.updateHover();
      this.updateBuildTag();
      this.countFps(nowMs);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
  }

  /** Muestra un aviso al jugador (por ejemplo, un error que devuelve el servidor). */
  notify(text: string): void {
    this.say(text);
    this.playSound('error', 0.8);
  }

  /** Guarda las estadísticas de la partida terminada para la pantalla de resultados. */
  setEndStats(msg: EndedMsg): void {
    this.endStats = msg.stats;
    this.hudKey = '';
  }

  /** Filas de la pantalla de fin: las del servidor en red, o las del sandbox en local. */
  private endStatsRows(): EndStatsRow[] | undefined {
    if (this.endStats) return this.endStats;
    const stats = this.sandbox.stats;
    return stats && this.sandbox.state.status !== 'playing'
      ? localStatsRows(stats, this.me)
      : undefined;
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
      const rules = rulesOf(this.data);
      const effects = deriveEffects(
        this.feelSnapshot,
        state,
        this.data,
        events,
        this.me,
        this.versus && !this.sandbox.debug?.revealMap
          ? (x, y) => canSee(state, rules, this.me, x, y)
          : undefined,
      );
      for (const e of effects) {
        if (e.type === 'burst') this.particles.burst(e);
        else if (e.type === 'heartAlert') this.screenFx = heartHit(this.screenFx, e.strength);
        else if (e.type === 'creatureAnim')
          this.renderer.anims.trigger(e.creatureId, e.anim, this.nowSeconds);
        else if (e.type === 'creatureKilled') this.renderer.anims.markKilled(e.creatureId);
        else if (e.type === 'floater')
          this.floaters.add({
            x: e.x,
            y: e.y,
            text: e.text,
            color: e.color,
            born: this.nowSeconds,
          });
        else this.playSound(e.sound, e.volume);
      }
      for (const a of adviceFor(events, state, this.data, this.me, (id) =>
        this.creatureTypes.get(id),
      )) {
        this.say(a.text, a.key, a.cooldownTicks);
      }
      this.feelSnapshot = takeSnapshot(state);
      this.lastFeelTick = state.tick;
    }
    this.particles.step(dtSeconds);
    this.applyScreenFx(dtSeconds);
    this.drawFloaters();
  }

  /** Números flotantes: pequeños textos HTML que suben desde un punto del mapa y se desvanecen. */
  private drawFloaters(): void {
    this.floaters.prune(this.nowSeconds);
    const layer = this.floaterLayer;
    while (layer.childElementCount > this.floaters.items.length) layer.lastElementChild?.remove();
    const r = this.renderer.canvas.getBoundingClientRect();
    this.floaters.items.forEach((f, i) => {
      let el = layer.children[i] as HTMLDivElement | undefined;
      if (!el) {
        el = document.createElement('div');
        el.className = 'floater';
        layer.appendChild(el);
      }
      const pose = floaterPose(this.nowSeconds - f.born);
      const s = worldToScreen(this.camera, f.x, 1.1, f.y);
      const x = ((s.nx + 1) / 2) * r.width;
      const y = ((1 - s.ny) / 2) * r.height - pose.rise;
      el.textContent = f.text;
      el.style.color = f.color;
      el.style.opacity = String(pose.opacity);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
  }

  /** Temblor del lienzo y pulso rojo del borde (decoración: no cambia nada de la partida). */
  private applyScreenFx(dtSeconds: number): void {
    this.screenFx = decay(this.screenFx, dtSeconds);
    const o = shakeOffset(this.screenFx, Math.random);
    this.renderer.canvas.style.transform =
      o.x === 0 && o.y === 0 ? '' : `translate(${o.x}px, ${o.y}px)`;
    this.alertEl.style.opacity = String(this.screenFx.alert);
  }

  private playSound(sound: SoundName, volume: number): void {
    this.audio.play(sound, volume);
  }

  /** Repinta el HUD solo cuando algo que se ve ha cambiado (cada tick, o al cambiar de herramienta). */
  private updateHud(): void {
    const { state } = this.sandbox;
    this.checkTreasury();
    const armed = state.tick < this.surrenderArmedUntil;
    const speed = speedLabel(this.sandbox.paused, this.sandbox.speed);
    const info = this.roomInfoLine();
    const key = `${speed}|${info}|${state.tick}|${JSON.stringify(this.input.tool)}|${this.notices.latest()?.tick ?? ''}|${armed}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    const model = buildHudModel(
      state,
      this.data,
      this.me,
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
        endStats: this.endStatsRows(),
        surrenderArmed: armed,
        speedLabel: speed,
        infoLine: info,
        onSurrender: () => this.surrender(),
        onRestart: () => window.location.reload(),
        // Clic en la lista: la recoge (solo las propias; la simulación también lo exige).
        onPickCreature: (id) => this.input.pickUpCreature(id),
        onLocateCreature: (id) => {
          const c = state.creatures.find((k) => k.id === id && k.owner === this.me);
          if (c) this.camera = centerOn(this.camera, { x: Math.floor(c.x), y: Math.floor(c.y) });
        },
      }),
      this.hudHost,
    );
  }

  /** Lo que se dibuja bajo el cursor; si no hay nada, los fantasmas de las órdenes en red que aún no se reflejan. */
  private previewWithGhosts() {
    const p = this.input.preview();
    const ghosts = (this.sandbox as { ghosts?: readonly Command[] }).ghosts;
    return p.kind === 'none' && ghosts && ghosts.length > 0 ? ghostPreview(ghosts) : p;
  }

  /** Cursor y tarjeta sobre la criatura o el Imp propio bajo el ratón: dice qué es y qué se puede hacer con él. */
  private updateHover(): void {
    const canvas = this.renderer.canvas;
    const { state } = this.sandbox;
    const hand = this.input.handSize;
    const u = this.input.hoverUnit;
    const c = u?.kind === 'creature' ? state.creatures.find((k) => k.id === u.id) : undefined;
    const imp = u?.kind === 'imp' ? state.imps.find((k) => k.id === u.id) : undefined;
    const rulesNow = rulesOf(this.data);
    const locked = c !== undefined && isInCombat(state, rulesNow, c);
    canvas.style.cursor =
      hand > 0 ? 'copy' : locked ? 'not-allowed' : c || imp ? 'grab' : 'default';
    const mouse = this.dom.cameraInput().mouse;
    if ((!c && !imp) || !mouse) {
      this.hoverCard.style.display = 'none';
      return;
    }
    const rules = rulesOf(this.data);
    const spellTarget = this.input.tool.kind === 'spell' && !!c;
    const full = hand >= this.data.global.hand.capacity;
    const action = spellTarget
      ? 'Clic: lanzar el hechizo'
      : locked
        ? 'En combate: no se puede retirar'
        : full
          ? 'Mano llena'
          : 'Clic: recoger';
    if (c) {
      const name = rules.creatureDefs[c.type]?.name ?? c.type;
      const band = rules.bands.find((b) => b.id === c.band)?.name ?? '';
      this.hoverCard.textContent = `${name} nv ${c.level} · ${band} · ${action} · B: bofetada`;
    } else {
      const what = impActivityLabel(imp!, state.tick);
      this.hoverCard.textContent =
        imp!.loafUntil > state.tick
          ? `Imp · ${what} · B: bofetada para que vuelva al trabajo · ${action}`
          : `Imp · ${what} · ${action} · al soltarlo va a la tarea marcada más cercana`;
    }
    const r = canvas.getBoundingClientRect();
    this.hoverCard.style.display = 'block';
    this.hoverCard.style.left = `${r.left + mouse.x * r.width + 14}px`;
    this.hoverCard.style.top = `${r.top + mouse.y * r.height + 14}px`;
  }

  /** Rendirse pide confirmación: hay que pulsar dos veces en menos de 4 segundos de juego. */
  surrender(): void {
    const { state } = this.sandbox;
    if (state.tick < this.surrenderArmedUntil) {
      this.sandbox.send({ type: 'surrender' });
      this.surrenderArmedUntil = -1;
    } else {
      this.surrenderArmedUntil = state.tick + 4 * this.data.global.tickRate;
    }
    this.hudKey = '';
  }

  /** Aviso del consejero cuando la Tesorería se llena. */
  private checkTreasury(): void {
    const { state } = this.sandbox;
    const player = state.players.find((p) => p.id === this.me);
    if (!player) return;
    const cap = treasuryCapacity(state, rulesOf(this.data), this.me);
    const full = cap > 0 && player.gold >= cap - 0.5;
    if (full && !this.wasFull) this.say('La Tesorería está llena: gasta oro o construye otra.');
    this.wasFull = full;
  }

  /** Criatura o Imp propio (no recogido) que se ve bajo un punto de la pantalla, el más cercano; a igual distancia, la criatura. */
  private unitAt(nx: number, ny: number): HoverUnit | null {
    let best: HoverUnit | null = null;
    let bestD = CREATURE_PICK_RADIUS;
    const test = (kind: HoverUnit['kind'], id: number, x: number, y: number, height: number) => {
      const s = worldToScreen(this.camera, x, height, y);
      const d = Math.hypot((nx - s.nx) * this.camera.aspect, ny - s.ny);
      // Los Imps están casi siempre donde se arrastra para excavar: se les pide más precisión que a las criaturas
      // para no recoger uno sin querer al empezar a marcar una pared.
      const reach = kind === 'imp' ? d * 1.35 : d;
      if (reach < bestD) {
        bestD = reach;
        best = { kind, id };
      }
    };
    const { state } = this.sandbox;
    for (const c of state.creatures)
      if (c.owner === this.me && !c.held) test('creature', c.id, c.x, c.y, 0.35);
    for (const i of state.imps)
      if (i.owner === this.me && !i.held) test('imp', i.id, i.x, i.y, 0.3);
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

  /** Posición en píxeles de la ventana de un Imp (para pruebas de navegador). */
  impToScreen(id: number): { x: number; y: number } | null {
    const i = this.sandbox.state.imps.find((k) => k.id === id);
    if (!i) return null;
    const r = this.renderer.canvas.getBoundingClientRect();
    const s = worldToScreen(this.camera, i.x, 0.3, i.y);
    return { x: r.left + ((s.nx + 1) / 2) * r.width, y: r.top + ((1 - s.ny) / 2) * r.height };
  }

  private onKey(key: string): void {
    this.audio.unlock();
    const action = keyAction(key, this.data);
    this.camera = applyRotateKey(this.camera, key);
    if (!action) return;
    if (action.type === 'tool') this.input.setTool(action.tool);
    else if (action.type === 'cancel') this.input.setTool({ kind: 'dig' });
    else if (action.type === 'center') this.camera = centerOnAboveHud(this.camera, this.heartTile);
    else if (action.type === 'slap') this.input.slapHovered();
    else if (action.type === 'pause') this.togglePause();
    else if (action.type === 'mute') this.toggleMute();
    else if (action.type === 'cycleCreature') this.cycleCreature(action.step);
    else if (action.type === 'debug') this.debugAction(action.what);
    else if (action.type === 'speed') this.changeSpeed(action.step);
  }

  /** Tab: la cámara salta a la siguiente criatura propia (por orden de id) y la nombra. */
  private cycleCreature(step: 1 | -1): void {
    const mine = this.sandbox.state.creatures
      .filter((c) => c.owner === this.me && !c.held)
      .sort((a, b) => a.id - b.id);
    if (mine.length === 0) return this.say('Aún no tienes criaturas.');
    const at = mine.findIndex((c) => c.id === this.lastCycledId);
    const next = mine[(at + step + mine.length * 2) % mine.length] ?? mine[0]!;
    this.lastCycledId = next.id;
    this.camera = centerOn(this.camera, { x: Math.floor(next.x), y: Math.floor(next.y) });
    const def = this.data.creatures.find((d) => d.id === next.type);
    this.say(`${def?.name ?? next.type}, nivel ${next.level}.`);
  }

  /** M: silencia o activa el sonido (se recuerda entre partidas). */
  private toggleMute(): void {
    this.audio.muted = !this.audio.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.audio.muted ? '1' : '0');
    } catch {
      // Sin almacenamiento (modo privado): solo vale para esta partida.
    }
    this.say(this.audio.muted ? 'Sonido desactivado (M para activarlo).' : 'Sonido activado.');
  }

  /** Coste en vivo junto al cursor mientras se elige dónde construir una sala (también donde no se puede). */
  private updateBuildTag(): void {
    const tool = this.input.tool;
    const mouse = this.dom.cameraInput().mouse;
    const preview = tool.kind === 'build' ? this.input.preview() : null;
    if (!preview || preview.kind !== 'room' || !mouse) {
      this.buildTag.style.display = 'none';
      return;
    }
    const me = this.sandbox.state.players.find((p) => p.id === this.me);
    const tag = roomCostTag(
      this.data,
      preview.room,
      (tool as { room: string }).room,
      me?.gold ?? 0,
      errorMessage(preview.room.error ?? 'INVALID_TARGET'),
    );
    const r = this.renderer.canvas.getBoundingClientRect();
    this.buildTag.textContent = tag.text;
    this.buildTag.className = `buildtag ${tag.tone}`;
    this.buildTag.style.display = 'block';
    this.buildTag.style.left = `${r.left + mouse.x * r.width + 18}px`;
    this.buildTag.style.top = `${r.top + mouse.y * r.height - 34}px`;
  }

  /** Qué se va a construir (con niveles y coste) o, con el cursor sobre una sala, su nivel. */
  private roomInfoLine(): string {
    const preview = this.input.preview();
    if (preview.kind === 'room') {
      const name =
        this.data.rooms.find((r) => r.id === (this.input.tool as { room?: string }).room)?.name ??
        '';
      return roomPreviewText(preview.room, name);
    }
    const inHand = this.input.handSize;
    if (inHand > 0)
      return `En la mano: ${inHand} · clic derecho en un tile tuyo ya reclamado para soltarlas`;
    const hover = this.input.hover;
    if (!hover) return '';
    return roomHoverText(
      this.sandbox.state,
      this.data,
      hover.y * this.sandbox.state.width + hover.x,
    );
  }

  /** Minimapa: la imagen se rehace cada tick; el recuadro de lo que se ve, cada fotograma. */
  private updateMinimap(): void {
    const { state } = this.sandbox;
    if (state.tick !== this.minimapTick) {
      this.minimapTick = state.tick;
      this.minimap.setPixels(
        minimapPixels({
          state,
          tiles: this.renderer.tileStyles,
          me: this.me,
          visible: this.renderer.visibleMask,
        }),
      );
    }
    this.minimap.draw(groundFootprint({ ...this.camera, aspect: this.renderer.aspect }));
  }

  /** Trampas de pruebas: F9 llena maná y suma oro; F10 muestra u oculta la niebla. Solo en partidas locales. */
  private debugAction(what: 'resources' | 'reveal'): void {
    const dbg = this.sandbox.debug;
    if (!dbg) return;
    if (what === 'resources') {
      dbg.giveResources();
      this.say('[Pruebas] Maná lleno y +5000 de oro (si caben).');
    } else {
      dbg.revealMap = !dbg.revealMap;
      this.say(
        dbg.revealMap ? '[Pruebas] Todo el mapa visible.' : '[Pruebas] Niebla de guerra activa.',
      );
    }
  }

  /** Pausa y velocidad existen solo en partidas locales: en red las manda el servidor. */
  private togglePause(): void {
    if (this.sandbox.speed === undefined) return;
    this.sandbox.paused = !this.sandbox.paused;
    this.say(this.sandbox.paused ? 'Partida en pausa (P para seguir).' : 'Partida reanudada.');
  }

  private changeSpeed(step: 1 | -1): void {
    const src = this.sandbox;
    if (src.speed === undefined) return;
    const speeds = this.data.pve.speeds;
    const at = Math.max(0, speeds.indexOf(src.speed));
    src.speed = speeds[Math.min(speeds.length - 1, Math.max(0, at + step))] ?? 1;
    this.say(`Velocidad ×${src.speed}.`);
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
