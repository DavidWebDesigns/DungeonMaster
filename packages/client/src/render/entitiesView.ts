/**
 * Dibuja a los Imps (cápsulas de color por jugador) y los accesorios de las salas (bloques placeholder).
 * Las posiciones se interpolan entre los dos últimos ticks para verse fluidas a 60 fps.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { Mesh as BabylonMesh } from '@babylonjs/core/Meshes/mesh';
import { creatureMaxHp, rulesOf, type DataSet, type MatchState, type Room } from '@dm/shared';
import type { GameSource } from '../sandbox/source';
import { mix, playerColor, ROOM_COLORS, type RGB } from './palette';
import { roomLook, treasuryFill } from './roomProps';
import { IMP_HEIGHT, IMP_RADIUS, UNIT_SCALE as S } from './scale';
import { AnimBoard, deathPose } from '../feel/anim';
import {
  hpColor,
  hpFraction,
  lookOf,
  moodCloudOf,
  moodIconOf,
  creatureBarOf,
  ownerMarkOf,
  trapLookOf,
} from './creatureStyle';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';

function material(scene: Scene, color: RGB, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(`m${color.join('')}${emissive}`, scene);
  m.diffuseColor = new Color3(...color);
  m.specularColor = new Color3(0, 0, 0);
  if (emissive > 0)
    m.emissiveColor = new Color3(color[0] * emissive, color[1] * emissive, color[2] * emissive);
  return m;
}

const HOVER_GLOW = new Color3(0.4, 0.4, 0.3);
const NO_GLOW = new Color3(0, 0, 0);

interface ImpMesh {
  body: Mesh;
  gold: Mesh;
  /** Símbolo de enemigo (solo en los Imps rivales). */
  mark?: Mesh;
  /** Burbuja de «no hago nada» sobre un Imp propio que holgazanea. */
  bubble: Mesh;
}

interface CreatureMesh {
  body: Mesh;
  mood: Mesh;
  barBack: Mesh;
  barFill: Mesh;
  fillMat: StandardMaterial;
  moodMat: StandardMaterial;
  /** Símbolo de enemigo (solo en las unidades rivales). */
  mark?: Mesh;
  /** Marco de la barra de vida con el color del dueño (solo en las criaturas rivales). */
  frame?: Mesh;
  /** Estrellitas de aturdimiento sobre una criatura derrotada (suelta, no cuelga del cuerpo aplastado). */
  stars: Mesh;
  height: number;
}

export class EntitiesView {
  private readonly imps = new Map<number, ImpMesh>();
  private readonly creatures = new Map<number, CreatureMesh>();
  /** Animaciones puntuales de las criaturas (bofetada, soltar, subir de nivel, morir). */
  readonly anims = new AnimBoard();
  private readonly dying: Array<{ mesh: CreatureMesh; born: number }> = [];
  private propSignature = '';
  private props: AbstractMesh[] = [];
  private pulsing: Mesh[] = [];
  private spinning: Mesh[] = [];
  private treasuryBlocks: Array<{ mesh: Mesh; tile: number; roomId: number }> = [];
  private readonly goldMat: StandardMaterial;

  constructor(private readonly scene: Scene) {
    this.goldMat = material(scene, [0.95, 0.8, 0.2], 0.4);
  }

  /** Coloca a los Imps y reconstruye los accesorios de las salas si cambiaron. */
  update(
    sandbox: GameSource,
    data: DataSet,
    timeSeconds: number,
    handAt: { x: number; y: number } | null = null,
    /** Niebla de guerra: tiles que el jugador local ve ahora. Si se indica, los enemigos fuera de la vista no se dibujan. */
    visible: Uint8Array | null = null,
    localPlayer = 1,
    hoverUnit: { kind: 'creature' | 'imp'; id: number } | null = null,
  ): void {
    const { state } = sandbox;
    const alive = new Set<number>();
    // Posición de cada cosa en la mano: cuelgan en fila junto al cursor, en el orden en que se recogieron.
    const handIndex = new Map<string, number>();
    const me = state.players.find((p) => p.id === localPlayer);
    me?.hand.forEach((h, n) => handIndex.set(`${h.kind}:${h.id}`, n));
    const hiddenByFog = (owner: number, x: number, y: number) =>
      visible !== null &&
      owner !== localPlayer &&
      visible[Math.floor(y) * state.width + Math.floor(x)] !== 1;
    for (const imp of state.imps) {
      alive.add(imp.id);
      let m = this.imps.get(imp.id);
      if (!m) {
        const body = CreateCapsule(
          `imp${imp.id}`,
          { height: IMP_HEIGHT, radius: IMP_RADIUS },
          this.scene,
        );
        body.material = material(this.scene, playerColor(imp.owner));
        body.isPickable = false;
        // Sombra del color del jugador bajo los pies: ayuda a ver al Imp aunque sea pequeño.
        const shadow = CreateDisc(
          `impShadow${imp.id}`,
          { radius: 0.2 * S, tessellation: 16 },
          this.scene,
        );
        shadow.material = material(this.scene, playerColor(imp.owner), 0.5);
        shadow.parent = body;
        shadow.rotation.x = Math.PI / 2;
        shadow.position.y = -IMP_HEIGHT / 2 - 0.07 * S;
        shadow.isPickable = false;
        const gold = CreateBox(`impGold${imp.id}`, { size: 0.12 * S }, this.scene);
        gold.material = this.goldMat;
        gold.parent = body;
        gold.position.y = IMP_HEIGHT / 2 + 0.08 * S;
        gold.isPickable = false;
        const mark = ownerMarkOf(imp.owner, localPlayer).show
          ? this.makeEnemyMark(`enemyMark${imp.id}i`, imp.owner, body, IMP_HEIGHT / 2 + 0.3 * S)
          : undefined;
        const bubble = CreateSphere(
          `impLoaf${imp.id}`,
          { diameter: 0.16 * S, segments: 6 },
          this.scene,
        );
        const bubbleMat = new StandardMaterial(`impLoafMat${imp.id}`, this.scene);
        bubbleMat.disableLighting = true;
        bubbleMat.emissiveColor = new Color3(0.9, 0.9, 1);
        bubble.material = bubbleMat;
        bubble.parent = body;
        bubble.position.y = IMP_HEIGHT / 2 + 0.22 * S;
        bubble.isPickable = false;
        bubble.setEnabled(false);
        m = { body, gold, mark, bubble };
        this.imps.set(imp.id, m);
      }
      const prev = sandbox.previous.get(imp.id) ?? imp;
      const a = sandbox.alpha;
      if (imp.held) {
        // En la mano: cuelga junto al cursor y se balancea.
        const n = handIndex.get(`imp:${imp.id}`) ?? 0;
        const at = handAt ?? { x: imp.x, y: imp.y };
        m.body.position.set(at.x + n * 0.25, 1.5 + 0.1 * Math.sin(timeSeconds * 6 + n), at.y);
        m.body.setEnabled(handAt !== null);
        m.gold.setEnabled(imp.carry > 0 && handAt !== null);
      } else {
        m.body.position.set(
          prev.x + (imp.x - prev.x) * a,
          0.1 * S + IMP_HEIGHT / 2,
          prev.y + (imp.y - prev.y) * a,
        );
        m.gold.setEnabled(imp.carry > 0 && !hiddenByFog(imp.owner, imp.x, imp.y));
        m.body.setEnabled(!hiddenByFog(imp.owner, imp.x, imp.y));
      }
      // Holgazanea (solo se sabe de los propios): se balancea y lleva una burbuja encima.
      const lazy = imp.owner === localPlayer && imp.loafUntil > state.tick && !imp.held;
      m.bubble.setEnabled(lazy);
      m.bubble.position.y =
        IMP_HEIGHT / 2 + 0.22 * S + (lazy ? 0.04 * S * Math.sin(timeSeconds * 3) : 0);
      m.body.rotation.z = lazy ? 0.25 * Math.sin(timeSeconds * 2.5 + imp.id) : 0;
      // Bajo el cursor: más grande y brillante (los Imps son pequeños: se agrandan más).
      const impHovered = hoverUnit?.kind === 'imp' && hoverUnit.id === imp.id && !imp.held;
      m.body.scaling.setAll(impHovered ? 1.7 : 1);
      const impMat = m.body.material as StandardMaterial | null;
      if (impMat) impMat.emissiveColor = impHovered ? HOVER_GLOW : NO_GLOW;
    }
    for (const [id, m] of this.imps) {
      if (!alive.has(id)) {
        m.body.dispose();
        this.imps.delete(id);
      }
    }

    this.updateCreatures(
      sandbox,
      data,
      timeSeconds,
      handAt,
      hiddenByFog,
      hoverUnit,
      handIndex,
      localPlayer,
    );
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i]!;
      const pose = deathPose(timeSeconds - d.born);
      if (pose.done) {
        d.mesh.body.dispose(false, true);
        d.mesh.stars.dispose();
        this.dying.splice(i, 1);
        continue;
      }
      d.mesh.body.scaling.set(pose.sx, pose.sy, pose.sx);
      d.mesh.body.position.y = 0.1 * S + (d.mesh.height * pose.sy) / 2;
      const mat = d.mesh.body.material as StandardMaterial | null;
      if (mat) mat.alpha = pose.alpha;
    }
    this.updateTraps(state, data, localPlayer, visible);
    this.updateHeartBars(state, data, localPlayer, visible);
    this.updatePiglets(state, localPlayer, timeSeconds);
    this.updateCorpses(state, localPlayer, visible);
    this.updateRally(state, localPlayer, timeSeconds);
    this.syncProps(state, data);
    for (const p of this.pulsing) p.scaling.setAll(1 + 0.06 * Math.sin(timeSeconds * 3));
    for (const s of this.spinning) s.rotation.y = timeSeconds * 0.8;
    for (const b of this.treasuryBlocks) {
      const room = state.rooms.find((r) => r.id === b.roomId);
      if (!room) continue;
      const fill = treasuryFill(state, data, room);
      const h = Math.max(0.02, fill * 0.55);
      b.mesh.scaling.y = h / 0.5;
      b.mesh.position.y = 0.16 + h / 2;
    }
  }

  /**
   * Símbolo de enemigo: un rombo (pirámide doble, distinto de la bolita del ánimo) del color del dueño sobre la barra
   * de vida. Cuelga del cuerpo, así que la niebla, la mano y el cursor lo ocultan o lo escalan con él.
   */
  private makeEnemyMark(name: string, owner: number, parent: Mesh, y: number): Mesh {
    const mark = CreateCylinder(
      name,
      { diameterTop: 0.26 * S, diameterBottom: 0, height: 0.22 * S, tessellation: 4 },
      this.scene,
    );
    const mat = new StandardMaterial(`${name}Mat`, this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(...ownerMarkOf(owner, 0).color);
    mark.material = mat;
    mark.parent = parent;
    mark.position.y = y;
    mark.renderingGroupId = 1;
    mark.isPickable = false;
    return mark;
  }

  private makeCreature(id: number, type: string, owner: number, localPlayer: number): CreatureMesh {
    const look = lookOf(type);
    const body = CreateCapsule(
      `creature${id}`,
      { height: look.height, radius: look.radius },
      this.scene,
    );
    body.material = material(this.scene, look.color);
    body.isPickable = false;
    // Disco del color del jugador bajo los pies: distingue a los tuyos de los del rival.
    const ring = CreateDisc(
      `creatureRing${id}`,
      { radius: look.radius + 0.12 * S, tessellation: 20 },
      this.scene,
    );
    ring.material = material(this.scene, playerColor(owner), 0.6);
    ring.parent = body;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -look.height / 2 - 0.07 * S;
    ring.isPickable = false;
    const moodMat = new StandardMaterial(`mood${id}`, this.scene);
    moodMat.disableLighting = true;
    const mood = CreateSphere(`moodIcon${id}`, { diameter: 0.22 * S, segments: 6 }, this.scene);
    mood.material = moodMat;
    mood.parent = body;
    mood.position.y = look.height / 2 + 0.3 * S;
    mood.isPickable = false;
    const barBack = CreatePlane(`barBack${id}`, { width: 0.7 * S, height: 0.08 * S }, this.scene);
    const backMat = new StandardMaterial(`barBackMat${id}`, this.scene);
    backMat.disableLighting = true;
    backMat.emissiveColor = new Color3(0.08, 0.06, 0.1);
    barBack.material = backMat;
    barBack.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
    barBack.parent = body;
    barBack.position.y = look.height / 2 + 0.12 * S;
    barBack.renderingGroupId = 2;
    barBack.isPickable = false;
    // Las criaturas rivales llevan la barra dentro de un marco del color de su dueño.
    let frame: Mesh | undefined;
    const bar = creatureBarOf(owner, localPlayer, 1);
    if (bar.frame) {
      const pad = 0.05 * S;
      frame = CreatePlane(
        `barFrame${id}`,
        { width: 0.7 * S + pad * 2, height: 0.08 * S + pad * 2 },
        this.scene,
      );
      const frameMat = new StandardMaterial(`barFrameMat${id}`, this.scene);
      frameMat.disableLighting = true;
      frameMat.emissiveColor = new Color3(...bar.frame);
      frame.material = frameMat;
      frame.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
      frame.parent = body;
      frame.position.y = look.height / 2 + 0.12 * S;
      frame.renderingGroupId = 1;
      frame.isPickable = false;
    }
    const fillMat = new StandardMaterial(`barFillMat${id}`, this.scene);
    fillMat.disableLighting = true;
    const barFill = CreatePlane(`barFill${id}`, { width: 0.7 * S, height: 0.08 * S }, this.scene);
    barFill.material = fillMat;
    barFill.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
    barFill.parent = body;
    barFill.position.y = look.height / 2 + 0.12 * S;
    barFill.renderingGroupId = 3;
    barFill.isPickable = false;
    const mark = ownerMarkOf(owner, localPlayer).show
      ? this.makeEnemyMark(`enemyMark${id}`, owner, body, look.height / 2 + 0.55 * S)
      : undefined;
    const stars = CreateTorus(
      `stars${id}`,
      { diameter: 0.34 * S, thickness: 0.05 * S, tessellation: 12 },
      this.scene,
    );
    const starsMat = new StandardMaterial(`starsMat${id}`, this.scene);
    starsMat.disableLighting = true;
    starsMat.emissiveColor = new Color3(1, 0.9, 0.3);
    stars.material = starsMat;
    stars.isPickable = false;
    stars.setEnabled(false);
    return {
      body,
      mood,
      barBack,
      barFill,
      fillMat,
      moodMat,
      mark,
      frame,
      stars,
      height: look.height,
    };
  }

  /** Criaturas: cápsulas de color por tipo con barra de vida (si están heridas) e icono de ánimo. */
  private updateCreatures(
    sandbox: GameSource,
    data: DataSet,
    timeSeconds: number,
    handAt: { x: number; y: number } | null,
    hiddenByFog: (owner: number, x: number, y: number) => boolean,
    hoverUnit: { kind: 'creature' | 'imp'; id: number } | null,
    handIndex: Map<string, number>,
    localPlayer: number,
  ): void {
    const { state } = sandbox;
    const rules = rulesOf(data);
    const alive = new Set<number>();
    for (const c of state.creatures) {
      alive.add(c.id);
      let m = this.creatures.get(c.id);
      if (!m) {
        m = this.makeCreature(c.id, c.type, c.owner, localPlayer);
        this.creatures.set(c.id, m);
      }
      const a = sandbox.alpha;
      const prev = sandbox.previousCreatures.get(c.id) ?? c;
      if (c.held) {
        // En la mano: cuelga junto al cursor y se balancea.
        const at = handAt ?? { x: c.x, y: c.y };
        m.body.setEnabled(handAt !== null);
        const held = handIndex.get(`creature:${c.id}`) ?? 0;
        m.body.position.set(at.x + held * 0.25, 1.5 + 0.1 * Math.sin(timeSeconds * 6 + held), at.y);
      } else {
        m.body.setEnabled(true);
        m.body.position.set(
          prev.x + (c.x - prev.x) * a,
          0.1 * S + m.height / 2,
          prev.y + (c.y - prev.y) * a,
        );
      }
      if (!c.held && hiddenByFog(c.owner, c.x, c.y)) m.body.setEnabled(false);
      // Bajo el cursor: más grande y brillante, para que se vea que se puede recoger.
      const hovered = hoverUnit?.kind === 'creature' && hoverUnit.id === c.id && !c.held;
      const anim = this.anims.sample(c.id, timeSeconds);
      const base = hovered ? 1.3 : 1;
      // Derrotada y aturdida: aplastada en el suelo, con estrellitas encima y sin barras.
      const downed = c.downedUntil > 0 && !c.held;
      if (downed) {
        m.body.scaling.set(1.5, 0.35, 1.5);
        m.body.position.y = 0.1 * S + (m.height * 0.35) / 2;
      } else m.body.scaling.set(base * anim.sx, base * anim.sy, base * anim.sx);
      m.stars.setEnabled(downed && m.body.isEnabled());
      if (downed) {
        m.stars.position.set(
          m.body.position.x,
          0.1 * S + m.height * 0.35 + 0.18 * S,
          m.body.position.z,
        );
        m.stars.rotation.y = timeSeconds * 3;
      }
      const bodyMat = m.body.material as StandardMaterial | null;
      if (bodyMat) {
        const glow = hovered ? HOVER_GLOW : NO_GLOW;
        bodyMat.emissiveColor = new Color3(
          glow.r + anim.glow * 0.8,
          glow.g + anim.glow * 0.7,
          glow.b + anim.glow * 0.2,
        );
      }
      const frac = hpFraction(c, creatureMaxHp(rules, c));
      const bar = creatureBarOf(c.owner, localPlayer, frac);
      const showBar = bar.show && !downed;
      m.barBack.setEnabled(showBar);
      m.barFill.setEnabled(showBar);
      m.frame?.setEnabled(showBar);
      if (showBar) {
        m.barFill.scaling.x = Math.max(0.001, frac);
        m.barFill.position.x = -0.35 * S * (1 - frac);
        const col = hpColor(frac);
        m.fillMat.emissiveColor = new Color3(...col);
      }
      const icon = moodIconOf(c.band);
      m.mood.setEnabled(icon.showOverHead && !downed);
      const cloud = moodCloudOf(c.band, timeSeconds);
      m.moodMat.emissiveColor = new Color3(...cloud.color);
      m.mood.scaling.set(cloud.scale.x, cloud.scale.y, cloud.scale.x);
    }
    for (const [id, m] of this.creatures) {
      if (!alive.has(id)) {
        this.creatures.delete(id);
        this.anims.forget(id);
        if (this.anims.takeKilled(id) && m.body.isEnabled()) {
          // Murió a la vista: cae y se desvanece (los modelos que solo salen de la vista desaparecen sin más).
          m.mood.setEnabled(false);
          m.barBack.setEnabled(false);
          m.barFill.setEnabled(false);
          m.frame?.setEnabled(false);
          m.mark?.setEnabled(false);
          m.stars.setEnabled(false);
          this.dying.push({ mesh: m, born: timeSeconds });
        } else {
          m.body.dispose(false, true);
          m.stars.dispose();
        }
      }
    }
  }

  private readonly corpseMeshes = new Map<number, { mesh: Mesh; buried: boolean }>();

  /**
   * Cadáveres: la criatura tumbada y gris donde cayó, o un montículo con una cruz si está enterrada en un Cementerio. Solo
   * se dibujan los que se ven.
   */
  private updateCorpses(state: MatchState, localPlayer: number, visible: Uint8Array | null): void {
    const alive = new Set<number>();
    for (const b of state.corpses) {
      const tile = Math.floor(b.y) * state.width + Math.floor(b.x);
      if (visible !== null && visible[tile] !== 1 && b.origin !== localPlayer) continue;
      alive.add(b.id);
      const buried = b.buriedIn !== 0;
      let entry = this.corpseMeshes.get(b.id);
      if (entry && entry.buried !== buried) {
        entry.mesh.dispose(false, true);
        entry = undefined;
      }
      if (!entry) {
        let mesh: Mesh;
        if (buried) {
          mesh = CreateCylinder(
            `grave${b.id}`,
            { diameterTop: 0.15, diameterBottom: 0.6, height: 0.22, tessellation: 10 },
            this.scene,
          );
          mesh.material = material(this.scene, [0.3, 0.24, 0.2]);
          const cross = CreateBox(
            `graveCross${b.id}`,
            { width: 0.07, height: 0.42, depth: 0.07 },
            this.scene,
          );
          cross.material = material(this.scene, [0.75, 0.72, 0.66]);
          cross.parent = mesh;
          cross.position.y = 0.3;
          cross.isPickable = false;
          const arm = CreateBox(
            `graveArm${b.id}`,
            { width: 0.26, height: 0.07, depth: 0.07 },
            this.scene,
          );
          arm.material = material(this.scene, [0.75, 0.72, 0.66]);
          arm.parent = mesh;
          arm.position.y = 0.38;
          arm.isPickable = false;
        } else {
          const look = lookOf(b.type);
          mesh = CreateCapsule(
            `corpse${b.id}`,
            { height: look.height, radius: look.radius },
            this.scene,
          );
          mesh.material = material(this.scene, mix(look.color, [0.55, 0.55, 0.58], 0.65));
          mesh.rotation.z = Math.PI / 2;
          // Una marca del color de quien era, para saber de quién fue.
          const tag = CreateDisc(
            `corpseTag${b.id}`,
            { radius: look.radius + 0.1 * S, tessellation: 16 },
            this.scene,
          );
          tag.material = material(this.scene, playerColor(b.origin), 0.5);
          tag.parent = mesh;
          tag.rotation.y = Math.PI / 2;
          tag.position.x = -look.radius - 0.02;
          tag.isPickable = false;
        }
        mesh.isPickable = false;
        entry = { mesh, buried };
        this.corpseMeshes.set(b.id, entry);
      }
      entry.mesh.position.set(b.x, buried ? 0.26 : 0.1 + lookOf(b.type).radius, b.y);
    }
    for (const [id, e] of this.corpseMeshes) {
      if (alive.has(id)) continue;
      e.mesh.dispose(false, true);
      this.corpseMeshes.delete(id);
    }
  }

  private readonly pigMeshes = new Map<number, Mesh[]>();

  /**
   * Cerditos de los Criaderos del jugador: unas bolitas rosas que se pasean por los tiles del Criadero (hasta 3 por tile
   * a la vista; el HUD da la cuenta exacta). Solo se dibujan los propios: del rival no se sabe cuántos hay.
   */
  private updatePiglets(state: MatchState, localPlayer: number, timeSeconds: number): void {
    const alive = new Set<number>();
    for (const room of state.rooms) {
      if (room.type !== 'hatchery' || room.owner !== localPlayer || room.piglets <= 0) continue;
      alive.add(room.id);
      const shown = Math.min(room.piglets, room.tiles.length * 3);
      let pigs = this.pigMeshes.get(room.id);
      if (!pigs) this.pigMeshes.set(room.id, (pigs = []));
      while (pigs.length < shown) {
        const n = pigs.length;
        const pig = CreateSphere(
          `piglet${room.id}_${n}`,
          { diameter: 0.3 * S, segments: 6 },
          this.scene,
        );
        pig.material = material(this.scene, [0.98, 0.66, 0.74], 0.3);
        pig.scaling.set(1.3, 0.95, 1);
        pig.isPickable = false;
        const snout = CreateCylinder(
          `pigletSnout${room.id}_${n}`,
          { diameter: 0.1 * S, height: 0.06 * S, tessellation: 8 },
          this.scene,
        );
        snout.material = material(this.scene, [0.9, 0.45, 0.55]);
        snout.parent = pig;
        snout.rotation.z = Math.PI / 2;
        snout.position.x = 0.15 * S;
        snout.isPickable = false;
        pigs.push(pig);
      }
      while (pigs.length > shown) pigs.pop()?.dispose(false, true);
      pigs.forEach((pig, n) => {
        const tile = room.tiles[n % room.tiles.length] as number;
        const slot = Math.floor(n / room.tiles.length); // 0, 1 o 2 cerditos en el mismo tile
        // Rincones del tile, fuera del nido que ocupa el centro.
        const corner = [
          [-0.3, -0.3],
          [0.3, -0.3],
          [-0.3, 0.3],
        ][slot] as [number, number];
        const baseX = (tile % state.width) + 0.5 + corner[0];
        const baseZ = Math.floor(tile / state.width) + 0.5 + corner[1];
        const t = timeSeconds * 0.9 + n * 1.7;
        pig.position.set(baseX + 0.07 * Math.sin(t), 0.3, baseZ + 0.07 * Math.cos(t * 1.3));
        pig.rotation.y = -t;
      });
    }
    for (const [id, pigs] of this.pigMeshes) {
      if (alive.has(id)) continue;
      for (const pig of pigs) pig.dispose(false, true);
      this.pigMeshes.delete(id);
    }
  }

  private readonly heartBars = new Map<
    number,
    { back: Mesh; fill: Mesh; fillMat: StandardMaterial }
  >();

  /**
   * Barra de vida de cada Corazón: aparece cuando ha recibido daño (propio siempre; el rival, solo si su Corazón está
   * a la vista) y se queda mientras no se cure. Cuelga sobre la esfera, mira siempre a la cámara.
   */
  private updateHeartBars(
    state: MatchState,
    data: DataSet,
    localPlayer: number,
    visible: Uint8Array | null,
  ): void {
    const alive = new Set<number>();
    const maxHp = data.global.heart.hp;
    for (const room of state.rooms) {
      if (room.type !== 'heart') continue;
      const player = state.players.find((p) => p.id === room.owner);
      if (!player) continue;
      const frac = hpFraction({ hp: player.heartHp }, maxHp);
      const seen =
        room.owner === localPlayer || visible === null || room.tiles.some((t) => visible[t] === 1);
      if (frac >= 1 || !seen) continue;
      alive.add(room.id);
      let bar = this.heartBars.get(room.id);
      if (!bar) {
        const width = 1.8;
        const back = CreatePlane(`heartBarBack${room.id}`, { width, height: 0.16 }, this.scene);
        const backMat = new StandardMaterial(`heartBarBackMat${room.id}`, this.scene);
        backMat.disableLighting = true;
        backMat.emissiveColor = new Color3(0.08, 0.06, 0.1);
        back.material = backMat;
        back.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
        back.isPickable = false;
        const fillMat = new StandardMaterial(`heartBarFillMat${room.id}`, this.scene);
        fillMat.disableLighting = true;
        const fill = CreatePlane(`heartBarFill${room.id}`, { width, height: 0.16 }, this.scene);
        fill.material = fillMat;
        fill.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
        fill.renderingGroupId = 1;
        fill.isPickable = false;
        bar = { back, fill, fillMat };
        this.heartBars.set(room.id, bar);
      }
      const cx = room.tiles.reduce((n, t) => n + (t % state.width) + 0.5, 0) / room.tiles.length;
      const cz =
        room.tiles.reduce((n, t) => n + Math.floor(t / state.width) + 0.5, 0) / room.tiles.length;
      bar.back.position.set(cx, 2.3, cz);
      // El relleno se encoge hacia la izquierda (en pantalla, por ser billboard) manteniendo su borde izquierdo.
      bar.fill.scaling.x = Math.max(0.001, frac);
      bar.fill.position.set(cx, 2.3, cz);
      bar.fillMat.emissiveColor = new Color3(...hpColor(frac));
    }
    for (const [id, bar] of this.heartBars) {
      if (!alive.has(id)) {
        bar.back.dispose();
        bar.fill.dispose();
        this.heartBars.delete(id);
      }
    }
  }

  private readonly trapMeshes = new Map<
    number,
    { mesh: Mesh; built: boolean; barBack: Mesh; barFill: Mesh; fillMat: StandardMaterial }
  >();

  /**
   * Trampas: las del jugador local siempre; las del rival solo cuando ya se revelaron (se dispararon) y su tile está
   * a la vista. Una trampa sin terminar se ve pequeña y translúcida; una armada, entera; una dañada lleva barra de vida.
   */
  private updateTraps(
    state: MatchState,
    data: DataSet,
    localPlayer: number,
    visible: Uint8Array | null,
  ): void {
    const alive = new Set<number>();
    for (const t of state.traps) {
      const mine = t.owner === localPlayer;
      if (!mine && !(t.revealed && t.built && (visible === null || visible[t.tile] === 1)))
        continue;
      alive.add(t.id);
      let entry = this.trapMeshes.get(t.id);
      if (!entry) {
        const look = trapLookOf(t.type);
        const mesh =
          look.shape === 'slab'
            ? CreateBox(`trap${t.id}`, { width: 0.92, height: 0.8, depth: 0.22 }, this.scene)
            : look.shape === 'barrel'
              ? CreateCylinder(`trap${t.id}`, { diameter: 0.5, height: 0.45 }, this.scene)
              : CreateCylinder(
                  `trap${t.id}`,
                  { diameterTop: 0, diameterBottom: 0.5, height: 0.5, tessellation: 4 },
                  this.scene,
                );
        if (look.shape === 'slab') {
          // La losa cruza el pasillo: si se camina en horizontal (a izquierda y derecha hay suelo), se gira.
          const w = rulesOf(data).walkable;
          const open = (dx: number, dy: number) => {
            const x = (t.tile % state.width) + dx;
            const y = Math.floor(t.tile / state.width) + dy;
            return x >= 0 && y >= 0 && x < state.width && y < state.height
              ? w[state.terrain[y * state.width + x] as number] === true
              : false;
          };
          if (open(-1, 0) && open(1, 0) && !(open(0, -1) && open(0, 1)))
            mesh.rotation.y = Math.PI / 2;
        }
        // Las del rival llevan un tinte de su color para distinguirlas de las propias.
        const mat = material(
          this.scene,
          mine ? look.color : mix(look.color, playerColor(t.owner), 0.5),
        );
        mesh.material = mat;
        mesh.isPickable = false;
        const barBack = CreatePlane(`trapBarBack${t.id}`, { width: 0.7, height: 0.08 }, this.scene);
        const backMat = new StandardMaterial(`trapBarBackMat${t.id}`, this.scene);
        backMat.disableLighting = true;
        backMat.emissiveColor = new Color3(0.08, 0.06, 0.1);
        barBack.material = backMat;
        barBack.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
        barBack.parent = mesh;
        barBack.position.y = 0.55;
        barBack.isPickable = false;
        const fillMat = new StandardMaterial(`trapBarFillMat${t.id}`, this.scene);
        fillMat.disableLighting = true;
        const barFill = CreatePlane(`trapBarFill${t.id}`, { width: 0.7, height: 0.08 }, this.scene);
        barFill.material = fillMat;
        barFill.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
        barFill.parent = mesh;
        barFill.position.y = 0.55;
        barFill.renderingGroupId = 1;
        barFill.isPickable = false;
        entry = { mesh, built: !t.built, barBack, barFill, fillMat };
        this.trapMeshes.set(t.id, entry);
      }
      // Barra de vida: solo si está dañada.
      const maxHp = data.traps.find((d) => d.id === t.type)?.hp ?? t.hp;
      const frac = hpFraction({ hp: t.hp }, maxHp);
      entry.barBack.setEnabled(frac < 1 && t.built);
      entry.barFill.setEnabled(frac < 1 && t.built);
      if (frac < 1) {
        entry.barFill.scaling.x = Math.max(0.001, frac);
        entry.barFill.position.x = -0.35 * (1 - frac);
        entry.fillMat.emissiveColor = new Color3(...hpColor(frac));
      }
      if (entry.built !== t.built) {
        entry.built = t.built;
        const mat = entry.mesh.material as StandardMaterial;
        mat.alpha = t.built ? 1 : 0.4;
        entry.mesh.scaling.setAll(t.built ? 1 : 0.6);
      }
      entry.mesh.position.set(
        (t.tile % state.width) + 0.5,
        0.35,
        Math.floor(t.tile / state.width) + 0.5,
      );
    }
    for (const [id, e] of this.trapMeshes) {
      if (!alive.has(id)) {
        e.mesh.dispose();
        this.trapMeshes.delete(id);
      }
    }
  }

  private rally: Mesh | null = null;

  /** Marca en el mapa de la Llamada a las armas: un anillo azul que gira mientras dura. */
  private updateRally(state: MatchState, localPlayer: number, timeSeconds: number): void {
    const p = state.players.find((k) => k.id === localPlayer);
    const tile = p && p.rallyTile >= 0 ? p.rallyTile : -1;
    if (tile < 0) {
      this.rally?.setEnabled(false);
      return;
    }
    if (!this.rally) {
      const ring = CreateTorus(
        'rally',
        { diameter: 1.1, thickness: 0.12, tessellation: 24 },
        this.scene,
      );
      ring.material = material(this.scene, [0.4, 0.65, 1], 0.9);
      ring.isPickable = false;
      this.rally = ring;
    }
    this.rally.setEnabled(true);
    this.rally.position.set((tile % state.width) + 0.5, 0.25, Math.floor(tile / state.width) + 0.5);
    this.rally.rotation.y = timeSeconds * 2;
    this.rally.scaling.setAll(1 + 0.1 * Math.sin(timeSeconds * 5));
  }

  private syncProps(state: MatchState, data: DataSet): void {
    const signature = state.rooms.map((r) => `${r.id}:${r.tiles.length}`).join('|');
    if (signature === this.propSignature) return;
    this.propSignature = signature;
    for (const p of this.props) p.dispose();
    this.props = [];
    this.pulsing = [];
    this.spinning = [];
    this.treasuryBlocks = [];
    for (const room of state.rooms) this.buildProps(state, data, room);
  }

  private buildProps(state: MatchState, data: DataSet, room: Room): void {
    const color = ROOM_COLORS[room.type] ?? [1, 1, 1];
    const tileXY = (t: number): [number, number] => [
      (t % state.width) + 0.5,
      Math.floor(t / state.width) + 0.5,
    ];
    const cx = room.tiles.reduce((n, t) => n + tileXY(t)[0], 0) / room.tiles.length;
    const cz = room.tiles.reduce((n, t) => n + tileXY(t)[1], 0) / room.tiles.length;
    const add = (m: Mesh) => {
      m.isPickable = false;
      this.props.push(m);
      return m;
    };

    const first = this.props.length;
    switch (room.type) {
      case 'heart': {
        const m = add(CreateSphere(`heart${room.id}`, { diameter: 1.6, segments: 12 }, this.scene));
        m.material = material(this.scene, [0.95, 0.2, 0.25], 0.7);
        m.position.set(cx, 1, cz);
        this.pulsing.push(m);
        break;
      }
      case 'portal': {
        const m = add(
          CreateTorus(
            `portal${room.id}`,
            { diameter: 1.9, thickness: 0.3, tessellation: 24 },
            this.scene,
          ),
        );
        m.material = material(this.scene, [0.65, 0.35, 0.95], 0.6);
        m.position.set(cx, 1.1, cz);
        m.rotation.x = Math.PI / 2;
        this.spinning.push(m);
        break;
      }
      case 'treasury':
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const m = add(
            CreateBox(`gold${room.id}_${t}`, { width: 0.7, height: 0.5, depth: 0.7 }, this.scene),
          );
          m.material = this.goldMat;
          m.position.set(x, 0.3, z);
          this.treasuryBlocks.push({ mesh: m, tile: t, roomId: room.id });
        }
        break;
      case 'lair':
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const m = add(
            CreateBox(`bed${room.id}_${t}`, { width: 0.6, height: 0.18, depth: 0.8 }, this.scene),
          );
          m.material = material(this.scene, [0.7, 0.5, 0.35]);
          m.position.set(x, 0.25, z);
        }
        break;
      case 'hatchery':
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const m = add(
            CreateSphere(`nest${room.id}_${t}`, { diameter: 0.55, segments: 6 }, this.scene),
          );
          m.material = material(this.scene, color);
          m.position.set(x, 0.35, z);
        }
        break;
      case 'trainingRoom':
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const m = add(
            CreateCylinder(`post${room.id}_${t}`, { diameter: 0.35, height: 0.9 }, this.scene),
          );
          m.material = material(this.scene, [0.75, 0.45, 0.3]);
          m.position.set(x, 0.6, z);
        }
        break;
      case 'tortureChamber':
        // Potros: una tabla con un travesaño por tile.
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const rack = add(
            CreateBox(`rack${room.id}_${t}`, { width: 0.8, height: 0.12, depth: 0.45 }, this.scene),
          );
          rack.material = material(this.scene, [0.35, 0.2, 0.15]);
          rack.position.set(x, 0.3, z);
          const bar = add(
            CreateCylinder(`rackbar${room.id}_${t}`, { diameter: 0.1, height: 0.9 }, this.scene),
          );
          bar.material = material(this.scene, [0.6, 0.6, 0.65]);
          bar.rotation.z = Math.PI / 2;
          bar.position.set(x, 0.42, z);
        }
        break;
      case 'library':
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const m = add(
            CreateBox(`shelf${room.id}_${t}`, { width: 0.8, height: 0.8, depth: 0.3 }, this.scene),
          );
          m.material = material(this.scene, [0.3, 0.45, 0.85]);
          m.position.set(x, 0.55, z);
        }
        break;
      case 'workshop':
        // Yunques: un bloque oscuro con una base por tile.
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const base = add(
            CreateBox(
              `anvilbase${room.id}_${t}`,
              { width: 0.35, height: 0.3, depth: 0.3 },
              this.scene,
            ),
          );
          base.material = material(this.scene, [0.25, 0.22, 0.22]);
          base.position.set(x, 0.2, z);
          const top = add(
            CreateBox(
              `anviltop${room.id}_${t}`,
              { width: 0.7, height: 0.18, depth: 0.32 },
              this.scene,
            ),
          );
          top.material = material(this.scene, [0.5, 0.52, 0.58]);
          top.position.set(x, 0.43, z);
        }
        break;
      case 'graveyard':
        // Lápidas: una losa vertical por tile.
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const m = add(
            CreateBox(`tomb${room.id}_${t}`, { width: 0.45, height: 0.7, depth: 0.14 }, this.scene),
          );
          m.material = material(this.scene, [0.55, 0.58, 0.56]);
          m.position.set(x, 0.45, z);
        }
        break;
      case 'casino':
        // Mesas de juego: un tablero verde plano con una ficha dorada por tile.
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const table = add(
            CreateBox(
              `casinoTable${room.id}_${t}`,
              { width: 0.8, height: 0.14, depth: 0.8 },
              this.scene,
            ),
          );
          table.material = material(this.scene, [0.1, 0.5, 0.28]);
          table.position.set(x, 0.18, z);
          const chip = add(
            CreateCylinder(
              `casinoChip${room.id}_${t}`,
              { diameter: 0.22, height: 0.06 },
              this.scene,
            ),
          );
          chip.material = this.goldMat;
          chip.position.set(x, 0.28, z);
        }
        break;
      case 'temple':
        // Columnas: un cilindro claro por tile.
        for (const t of room.tiles) {
          const [x, z] = tileXY(t);
          const m = add(
            CreateCylinder(`column${room.id}_${t}`, { diameter: 0.4, height: 1.3 }, this.scene),
          );
          m.material = material(this.scene, [0.62, 0.55, 0.7]);
          m.position.set(x, 0.75, z);
        }
        break;
    }
    // La sala crece con su nivel (su número de tiles): accesorios más grandes, torre central, anillo y joya.
    const def = data.rooms.find((r) => r.id === room.type);
    if (def?.buildable)
      this.applyLevelLook(
        room,
        color,
        cx,
        cz,
        first,
        roomLook(room.tiles.length, def.maxTiles ?? 10),
        tileXY,
      );
  }

  /** Engorda los accesorios ya creados de una sala según su nivel y añade la torre, el anillo y la joya. */
  private applyLevelLook(
    room: Room,
    color: RGB,
    cx: number,
    cz: number,
    first: number,
    look: ReturnType<typeof roomLook>,
    tileXY: (t: number) => [number, number],
  ): void {
    for (const m of this.props.slice(first)) {
      // Los montones de la Tesorería suben y bajan con el oro: solo engordan.
      const treasury = m.name.startsWith('gold');
      const sy = treasury ? 1 : look.height;
      m.scaling.set(look.girth, m.scaling.y * sy, look.girth);
      if (!treasury) m.position.y += (sy - 1) * m.getBoundingInfo().boundingBox.extendSize.y;
    }
    if (!look.tower) return;
    // La torre se levanta en el tile de la sala más cercano al centro.
    let best = room.tiles[0] as number;
    let bestD = Infinity;
    for (const t of room.tiles) {
      const [x, z] = tileXY(t);
      const d = Math.hypot(x - cx, z - cz);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    const [x, z] = tileXY(best);
    const tint = mix(color, [1, 1, 1], 0.35);
    const add = (m: Mesh) => {
      m.isPickable = false;
      this.props.push(m);
      return m;
    };
    const tower = add(
      CreateCylinder(
        `tower${room.id}`,
        {
          height: look.tower.height,
          diameterTop: look.tower.topDiameter,
          diameterBottom: look.tower.baseDiameter,
          tessellation: 8,
        },
        this.scene,
      ),
    );
    tower.material = material(this.scene, tint, 0.15);
    tower.position.set(x, look.tower.height / 2, z);
    if (look.ring) {
      const ring = add(
        CreateTorus(
          `towerRing${room.id}`,
          { diameter: look.tower.baseDiameter * 2.4, thickness: 0.07, tessellation: 20 },
          this.scene,
        ),
      );
      ring.material = material(this.scene, [0.95, 0.8, 0.3], 0.5);
      ring.position.set(x, look.tower.height * 0.55, z);
      this.spinning.push(ring);
    }
    if (look.crown) {
      const gem = add(
        CreateSphere(`towerGem${room.id}`, { diameter: 0.34, segments: 8 }, this.scene),
      );
      gem.material = material(this.scene, [1, 0.9, 0.45], 0.9);
      gem.position.set(x, look.tower.height + 0.22, z);
      this.pulsing.push(gem);
    }
  }
}
