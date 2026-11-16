import type { GenerationSettings } from "../../../types/generation";
import type { VectorGenerationSettings } from "../../../types/vector/generation";

/** The castle the mesh editor's settings ask for (P4e), or none. */
export function vectorCastleChoice(
  settings: Pick<GenerationSettings, "config" | "descriptor" | "castle" | "moats">
): VectorGenerationSettings["castle"] {
  const wanted = settings.descriptor ? settings.descriptor.burg.citadel : settings.config.features.citadel;
  if (!wanted) return undefined;
  const c = settings.castle ?? {};
  return {
    position: c.position ?? "auto",
    size: c.size ?? "auto",
    ...(settings.moats?.castle ? { moat: true } : {}),
    ...(c.style && c.style !== "auto" ? { style: c.style } : {})
  };
}
