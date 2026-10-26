import type { CastleSettings } from "../types/castle";
import type { CityDocument } from "../types/document";

/** A map-wide appearance change preserves castle sites, geometry and structural locks. */
export function withCastleStyle(document: CityDocument, style: NonNullable<CastleSettings["style"]>): CityDocument {
  const next: CityDocument = { ...document, castleStyle: style };
  if (document.castles)
    next.castles = document.castles.map(castle => {
      // Historic modular assets have their own model, rather than procedural style variants.
      if (castle.fortress) return castle;
      const updated = { ...castle };
      if (style === "auto") delete updated.castleStyle;
      else updated.castleStyle = style;
      return updated;
    });
  if (document.fabric?.generation) {
    const recipe = document.fabric.generation;
    next.fabric = {
      ...document.fabric,
      generation: {
        ...recipe,
        settings: { ...recipe.settings, castle: { ...recipe.settings.castle, style }, legacyCastles: false }
      }
    };
  }
  return next;
}
