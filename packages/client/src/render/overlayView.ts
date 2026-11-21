/**
 * Resaltado translúcido sobre los tiles: selección al arrastrar, fantasma de sala y cursor de objetivo.
 */
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { Point } from '@dm/shared';
import type { Preview } from '../input/inputModel';
import type { RGB } from './palette';
import type { TileStyle } from './tileStyle';

const COLORS = {
  valid: [0.35, 1, 0.45] as RGB,
  invalid: [1, 0.25, 0.25] as RGB,
  noGold: [1, 0.65, 0.15] as RGB,
  mark: [1, 0.95, 0.5] as RGB,
  /** Tono alterno para distinguir salas contiguas en la previsión. */
  validAlt: [0.25, 0.85, 0.95] as RGB,
};

export interface OverlayTile {
  tile: Point;
  color: RGB;
  /** Opacidad de 0 a 1 (por defecto 0,55). */
  alpha?: number;
}

/** Convierte lo que prevé el modelo de entrada en tiles coloreados. */
export function overlayTiles(preview: Preview): OverlayTile[] {
  switch (preview.kind) {
    case 'none':
      return [];
    case 'tiles':
      return [
        ...preview.valid.map((tile) => ({ tile, color: COLORS.valid })),
        ...preview.invalid.map((tile) => ({ tile, color: COLORS.invalid })),
      ];
    case 'target':
      return [{ tile: preview.tile, color: preview.ok ? COLORS.valid : COLORS.invalid }];
    case 'room': {
      const { rect, valid, error, pieces } = preview.room;
      const color = valid ? COLORS.valid : error === 'NO_GOLD' ? COLORS.noGold : COLORS.invalid;
      // Válida: cada sala resultante lleva un tono distinto, para ver dónde acaba una y empieza la siguiente.
      if (valid && pieces.length > 1) {
        const w = preview.width;
        return pieces.flatMap((p, i) =>
          p.tiles.map((t) => ({
            tile: { x: t % w, y: Math.floor(t / w) },
            color: (i % 2 === 0 ? COLORS.valid : COLORS.validAlt) as RGB,
          })),
        );
      }
      const out: OverlayTile[] = [];
      for (let y = rect.y; y < rect.y + rect.h; y++)
        for (let x = rect.x; x < rect.x + rect.w; x++) out.push({ tile: { x, y }, color });
      return out;
    }
  }
}

export class OverlayView {
  private readonly mesh: Mesh;
  private readonly matrices: Float32Array;
  private readonly colors: Float32Array;
  private lastCount = -1;

  constructor(
    scene: Scene,
    private readonly width: number,
    height: number,
    name = 'overlay',
  ) {
    const max = width * height;
    this.matrices = new Float32Array(max * 16);
    this.colors = new Float32Array(max * 4);
    const box = CreateBox(name, { size: 1 }, scene);
    const mat = new StandardMaterial(`${name}Mat`, scene);
    // El color de cada instancia tiñe el difuso (no el emisivo): se deja un poco de emisivo para que se vea con poca luz.
    mat.diffuseColor = new Color3(1, 1, 1);
    mat.emissiveColor = new Color3(0.3, 0.3, 0.3);
    mat.specularColor = new Color3(0, 0, 0);
    // La transparencia va en el canal alfa de cada instancia.
    box.hasVertexAlpha = true;
    box.material = mat;
    box.renderingGroupId = 1;
    box.isPickable = false;
    box.alwaysSelectAsActiveMesh = true;
    box.thinInstanceSetBuffer('matrix', this.matrices, 16, false);
    box.thinInstanceSetBuffer('color', this.colors, 4, false);
    this.mesh = box;
  }

  set(preview: Preview, styles: readonly TileStyle[]): void {
    this.setTiles(overlayTiles(preview), styles);
  }

  setTiles(tiles: readonly OverlayTile[], styles: readonly TileStyle[]): void {
    if (tiles.length === 0 && this.lastCount === 0) return;
    const n = Math.min(tiles.length, this.matrices.length / 16);
    // Las instancias sobrantes se ocultan con matrices a cero. No se cambia thinInstanceCount: si valiera 0 al
    // compilar el material, este quedaría sin soporte de colores por instancia.
    this.matrices.fill(0, n * 16, Math.max(n, this.lastCount) * 16);
    for (let k = 0; k < n; k++) {
      const { tile, color, alpha } = tiles[k] as OverlayTile;
      const top = styles[tile.y * this.width + tile.x]?.height ?? 0.1;
      const m = k * 16;
      this.matrices.fill(0, m, m + 16);
      this.matrices[m] = 0.96;
      this.matrices[m + 5] = 0.04;
      this.matrices[m + 10] = 0.96;
      this.matrices[m + 12] = tile.x + 0.5;
      this.matrices[m + 13] = top + 0.03;
      this.matrices[m + 14] = tile.y + 0.5;
      this.matrices[m + 15] = 1;
      this.colors[k * 4] = color[0];
      this.colors[k * 4 + 1] = color[1];
      this.colors[k * 4 + 2] = color[2];
      this.colors[k * 4 + 3] = alpha ?? 0.55;
    }
    this.lastCount = n;
    this.mesh.thinInstanceBufferUpdated('matrix');
    this.mesh.thinInstanceBufferUpdated('color');
  }
}
