/**
 * Dibuja el terreno: un solo cubo con una instancia por tile (thin instances), con altura y color por tile.
 * Solo reescribe los tiles que cambian.
 */
import { Color3 } from '@babylonjs/core/Maths/math.color';
// Efectos laterales: añaden los métodos de instancias ligeras (thinInstance*) a Mesh.
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { TileStyle } from './tileStyle';

export class TerrainView {
  readonly mesh: Mesh;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array;

  constructor(
    scene: Scene,
    private readonly width: number,
    height: number,
  ) {
    const total = width * height;
    this.matrices = new Float32Array(total * 16);
    this.colors = new Float32Array(total * 4);
    const box = CreateBox('terrain', { size: 1 }, scene);
    const mat = new StandardMaterial('terrainMat', scene);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0, 0, 0);
    box.material = mat;
    box.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    box.thinInstanceSetBuffer('color', this.colors, 4, false);
    box.alwaysSelectAsActiveMesh = true;
    box.isPickable = false;
    this.mesh = box;
  }

  /** Aplica el aspecto de los tiles que cambiaron. */
  update(changed: readonly number[], styles: readonly TileStyle[]): void {
    if (changed.length === 0) return;
    for (const i of changed) {
      const s = styles[i];
      if (!s) continue;
      const x = i % this.width;
      const z = Math.floor(i / this.width);
      const m = i * 16;
      const a = this.matrices;
      a.fill(0, m, m + 16);
      a[m] = 1;
      a[m + 5] = s.height;
      a[m + 10] = 1;
      a[m + 12] = x + 0.5;
      a[m + 13] = s.height / 2;
      a[m + 14] = z + 0.5;
      a[m + 15] = 1;
      const c = i * 4;
      this.colors[c] = s.color[0];
      this.colors[c + 1] = s.color[1];
      this.colors[c + 2] = s.color[2];
      this.colors[c + 3] = 1;
    }
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.thinInstanceBufferUpdated('color');
  }
}
