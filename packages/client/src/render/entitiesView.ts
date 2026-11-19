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
import type { Sandbox } from '../sandbox/sandbox';
import { playerColor, ROOM_COLORS, type RGB } from './palette';
import { treasuryFill } from './roomProps';
import { IMP_HEIGHT, IMP_RADIUS } from './scale';
import { hpColor, hpFraction, lookOf, moodIconOf } from './creatureStyle';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';

function material(scene: Scene, color: RGB, emissive = 0): StandardMaterial {
  const m = new StandardMaterial(`m${color.join('')}${emissive}`, scene);
  m.diffuseColor = new Color3(...color);
  m.specularColor = new Color3(0, 0, 0);
  if (emissive > 0)
    m.emissiveColor = new Color3(color[0] * emissive, color[1] * emissive, color[2] * emissive);
  return m;
}

interface ImpMesh {
  body: Mesh;
  gold: Mesh;
}

interface CreatureMesh {
  body: Mesh;
  mood: Mesh;
  barBack: Mesh;
  barFill: Mesh;
  fillMat: StandardMaterial;
  moodMat: StandardMaterial;
  height: number;
}

export class EntitiesView {
  private readonly imps = new Map<number, ImpMesh>();
  private readonly creatures = new Map<number, CreatureMesh>();
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
    sandbox: Sandbox,
    data: DataSet,
    timeSeconds: number,
    handAt: { x: number; y: number } | null = null,
    /** Niebla de guerra: tiles que el jugador local ve ahora. Si se indica, los enemigos fuera de la vista no se dibujan. */
    visible: Uint8Array | null = null,
    localPlayer = 1,
  ): void {
    const { state } = sandbox;
    const alive = new Set<number>();
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
          { radius: 0.2, tessellation: 16 },
          this.scene,
        );
        shadow.material = material(this.scene, playerColor(imp.owner), 0.5);
        shadow.parent = body;
        shadow.rotation.x = Math.PI / 2;
        shadow.position.y = -IMP_HEIGHT / 2 - 0.07;
        shadow.isPickable = false;
        const gold = CreateBox(`impGold${imp.id}`, { size: 0.12 }, this.scene);
        gold.material = this.goldMat;
        gold.parent = body;
        gold.position.y = IMP_HEIGHT / 2 + 0.08;
        gold.isPickable = false;
        m = { body, gold };
        this.imps.set(imp.id, m);
      }
      const prev = sandbox.previous.get(imp.id) ?? imp;
      const a = sandbox.alpha;
      m.body.position.set(
        prev.x + (imp.x - prev.x) * a,
        0.1 + IMP_HEIGHT / 2,
        prev.y + (imp.y - prev.y) * a,
      );
      m.gold.setEnabled(imp.carry > 0 && !hiddenByFog(imp.owner, imp.x, imp.y));
      m.body.setEnabled(!hiddenByFog(imp.owner, imp.x, imp.y));
    }
    for (const [id, m] of this.imps) {
      if (!alive.has(id)) {
        m.body.dispose();
        this.imps.delete(id);
      }
    }

    this.updateCreatures(sandbox, data, timeSeconds, handAt, hiddenByFog);
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

  private makeCreature(id: number, type: string, owner: number): CreatureMesh {
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
      { radius: look.radius + 0.12, tessellation: 20 },
      this.scene,
    );
    ring.material = material(this.scene, playerColor(owner), 0.6);
    ring.parent = body;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -look.height / 2 - 0.07;
    ring.isPickable = false;
    const moodMat = new StandardMaterial(`mood${id}`, this.scene);
    moodMat.disableLighting = true;
    const mood = CreateSphere(`moodIcon${id}`, { diameter: 0.22, segments: 6 }, this.scene);
    mood.material = moodMat;
    mood.parent = body;
    mood.position.y = look.height / 2 + 0.3;
    mood.isPickable = false;
    const barBack = CreatePlane(`barBack${id}`, { width: 0.7, height: 0.08 }, this.scene);
    const backMat = new StandardMaterial(`barBackMat${id}`, this.scene);
    backMat.disableLighting = true;
    backMat.emissiveColor = new Color3(0.08, 0.06, 0.1);
    barBack.material = backMat;
    barBack.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
    barBack.parent = body;
    barBack.position.y = look.height / 2 + 0.12;
    barBack.isPickable = false;
    const fillMat = new StandardMaterial(`barFillMat${id}`, this.scene);
    fillMat.disableLighting = true;
    const barFill = CreatePlane(`barFill${id}`, { width: 0.7, height: 0.08 }, this.scene);
    barFill.material = fillMat;
    barFill.billboardMode = BabylonMesh.BILLBOARDMODE_ALL;
    barFill.parent = body;
    barFill.position.y = look.height / 2 + 0.12;
    barFill.renderingGroupId = 1;
    barFill.isPickable = false;
    return { body, mood, barBack, barFill, fillMat, moodMat, height: look.height };
  }

  /** Criaturas: cápsulas de color por tipo con barra de vida (si están heridas) e icono de ánimo. */
  private updateCreatures(
    sandbox: Sandbox,
    data: DataSet,
    timeSeconds: number,
    handAt: { x: number; y: number } | null,
    hiddenByFog: (owner: number, x: number, y: number) => boolean,
  ): void {
    const { state } = sandbox;
    const rules = rulesOf(data);
    const alive = new Set<number>();
    let held = 0;
    for (const c of state.creatures) {
      alive.add(c.id);
      let m = this.creatures.get(c.id);
      if (!m) {
        m = this.makeCreature(c.id, c.type, c.owner);
        this.creatures.set(c.id, m);
      }
      const a = sandbox.alpha;
      const prev = sandbox.previousCreatures.get(c.id) ?? c;
      if (c.held) {
        // En la mano: cuelga junto al cursor y se balancea.
        const at = handAt ?? { x: c.x, y: c.y };
        m.body.setEnabled(handAt !== null);
        m.body.position.set(at.x + held * 0.25, 1.5 + 0.1 * Math.sin(timeSeconds * 6 + held), at.y);
        held++;
      } else {
        m.body.setEnabled(true);
        m.body.position.set(
          prev.x + (c.x - prev.x) * a,
          0.1 + m.height / 2,
          prev.y + (c.y - prev.y) * a,
        );
      }
      if (!c.held && hiddenByFog(c.owner, c.x, c.y)) m.body.setEnabled(false);
      const frac = hpFraction(c, creatureMaxHp(rules, c));
      m.barBack.setEnabled(frac < 1);
      m.barFill.setEnabled(frac < 1);
      if (frac < 1) {
        m.barFill.scaling.x = Math.max(0.001, frac);
        m.barFill.position.x = -0.35 * (1 - frac);
        const col = hpColor(frac);
        m.fillMat.emissiveColor = new Color3(...col);
      }
      const icon = moodIconOf(c.band);
      m.mood.setEnabled(icon.showOverHead);
      m.moodMat.emissiveColor = new Color3(...icon.color);
    }
    for (const [id, m] of this.creatures) {
      if (!alive.has(id)) {
        m.body.dispose();
        this.creatures.delete(id);
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
    }
    void data;
  }
}
