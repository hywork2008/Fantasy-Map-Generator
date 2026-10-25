import type { FixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import type { CityDocument, Id, Tool } from "../types/document";
import type { RenderSelection } from "../types/selection";

import type { HousingViewOptions } from "./standaloneHousingAppearance";

/**
 * Read-only inputs one render pass shares between its layer renderers. Derived
 * once in `renderEditorSvg`; a layer renderer never reassigns these fields and
 * never reads the current document from anywhere else.
 */
export interface RenderContext {
  readonly document: CityDocument;
  readonly tool: Tool;
  readonly selection: RenderSelection;
  readonly zoom: number;
  /** Town view: the simplified, quality-scaled presentation of a built city. */
  readonly town: boolean;
  readonly fixedMode: boolean;
  readonly fixedGeometry: FixedBurgCrossings | null;
  /** Town view at "light" or "minimal" quality. */
  readonly lightweight: boolean;
  readonly minimal: boolean;
  readonly hideBuildings: boolean;
  readonly hideStreetLines: boolean;
  readonly preview: boolean;
  readonly housingView?: HousingViewOptions;
}

export type { Id };
