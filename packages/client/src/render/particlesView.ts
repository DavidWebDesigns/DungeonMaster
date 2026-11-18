/** Dibuja las partículas como cubitos con instancias ligeras. */
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import { PARTICLES, type ParticleSim } from '../feel/particleSim';

export class ParticlesView {
  private readonly mesh: Mesh;
  private readonly matrices = new Float32Array(PARTICLES.max * 16);
  private readonly colors = new Float32Array(PARTICLES.max * 4);
  private lastCount = 0;

  constructor(scene: Scene) {
    const box = CreateBox('particles', { size: 1 }, scene);
    const mat = new StandardMaterial('particlesMat', scene);
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.emissiveColor = new Color3(0.35, 0.35, 0.35);
    mat.specularColor = new Color3(0, 0, 0);
    box.material = mat;
    box.isPickable = false;
    box.alwaysSelectAsActiveMesh = true;
    // Siempre se declaran todas las instancias (las libres van a escala 0); ver OverlayView.
    box.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    box.thinInstanceSetBuffer('color', this.colors, 4, false);
    this.mesh = box;
  }

  update(sim: ParticleSim): void {
    const ps = sim.particles;
    const n = Math.min(ps.length, PARTICLES.max);
    if (n === 0 && this.lastCount === 0) return;
    this.matrices.fill(0, n * 16, Math.max(n, this.lastCount) * 16);
    for (let k = 0; k < n; k++) {
      const p = ps[k]!;
      // Se encogen al final de su vida.
      const s = p.size * Math.min(1, (p.life / p.maxLife) * 2.5);
      const m = k * 16;
      this.matrices.fill(0, m, m + 16);
      this.matrices[m] = s;
      this.matrices[m + 5] = s;
      this.matrices[m + 10] = s;
      this.matrices[m + 12] = p.x;
      this.matrices[m + 13] = p.y;
      this.matrices[m + 14] = p.z;
      this.matrices[m + 15] = 1;
      this.colors[k * 4] = p.color[0];
      this.colors[k * 4 + 1] = p.color[1];
      this.colors[k * 4 + 2] = p.color[2];
      this.colors[k * 4 + 3] = 1;
    }
    this.lastCount = n;
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.thinInstanceBufferUpdated('color');
  }
}
