import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import { SHIP_DIMENSIONS } from "../data/ships";
import type { ShipPhysicalDimensions, ShipType } from "../types/ships";

export interface ShipDimensions extends ShipPhysicalDimensions {
  label: string;
}

function localizedShipSpec(dimensions: ShipPhysicalDimensions, labelKey: EditorMessageKey): ShipDimensions {
  return {
    baseLengthMeters: dimensions.baseLengthMeters,
    baseBeamMeters: dimensions.baseBeamMeters,
    defaultSizeMeters: dimensions.defaultSizeMeters,
    minSizeMeters: dimensions.minSizeMeters,
    maxSizeMeters: dimensions.maxSizeMeters,
    get label() {
      return editorText(labelKey);
    },
    historicalName: dimensions.historicalName
  };
}

export const SHIP_SPECS: Record<ShipType, ShipDimensions> = {
  small: localizedShipSpec(SHIP_DIMENSIONS.small, "cityEditor.messages.smallShipSloop"),
  medium: localizedShipSpec(SHIP_DIMENSIONS.medium, "cityEditor.messages.mediumShipCaravel"),
  large: localizedShipSpec(SHIP_DIMENSIONS.large, "cityEditor.messages.largeShipGalleon"),
  barge: localizedShipSpec(SHIP_DIMENSIONS.barge, "cityEditor.messages.riverCargoBoatBarge")
};
