import { z } from 'zod';

/**
 * assets/assetManifest.json: qué archivo .glb corresponde a cada `modelId` de los datos.
 * Si un modelId no está aquí, el cliente dibuja el placeholder por rol (CLAUDE.md, reglas de contenido).
 */
export const AssetManifest = z.strictObject({
  version: z.literal(1),
  models: z.record(
    z.string().min(1),
    z.strictObject({
      /** Ruta relativa a /assets (ej. "models/creatures/imp.glb"). */
      file: z.string().regex(/^models\/.+\.glb$/, 'debe ser models/<carpeta>/<nombre>.glb'),
      /** Escala que corrige el tamaño del modelo exportado (1 = tal cual). */
      scale: z.number().positive().default(1),
    }),
  ),
});
export type AssetManifest = z.infer<typeof AssetManifest>;
