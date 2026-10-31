import { BASILICA_NAVE_METERS, BASILICA_RESERVATION_METERS } from "../../buildings/temples/basilicaDimensions";
import { URBAN_DWELLING_SIZE } from "../../utils/urbanDwellings";
import type { TempleType } from "../types/document";

export { URBAN_DWELLING_SIZE };

/** Ground-floor plot (m²) for one urban household of `URBAN_DWELLING_SIZE` people. */
export const DWELLING_LOT_M2 = 80;

export function dwellingLotArea(ward: string | null | undefined): number {
  if (ward === "castle") return 400;
  if (ward === "merchant") return 110;
  return DWELLING_LOT_M2;
}

/** Street-to-street span of a Tiny-scale intramural block: two house rows, a lane, a small court. */
export function intramuralBlockSpan(lotArea: number, laneWidth: number): number {
  const row = Math.sqrt(Math.max(40, lotArea)) * 1.65;
  return Math.max(28, Math.min(52, 2 * row + laneWidth + 8));
}

export type CivicSize = "micro" | "tiny" | "small" | "medium" | "large";

/** Midpoints between preset windows: 300 / 600 / 1,200 / 2,400 / 4,800 m. */
export function civicSizeForExtent(extentMeters: number): CivicSize {
  if (extentMeters < 450) return "micro";
  if (extentMeters < 900) return "tiny";
  if (extentMeters < 1800) return "small";
  if (extentMeters < 3600) return "medium";
  return "large";
}

/** Nave length × aisle width (m). Basilicas never fall below their native model's dimensions. */
export const TEMPLE_FOOTPRINT_M: Record<CivicSize, { length: number; width: number }> = {
  micro: { length: 14, width: 8 },
  tiny: BASILICA_NAVE_METERS,
  small: BASILICA_NAVE_METERS,
  medium: BASILICA_NAVE_METERS,
  large: { length: 68, width: 36 }
};

/** Side length (m) of the reserved market square, before street setbacks. */
export const PLAZA_FOOTPRINT_M: Record<CivicSize, number> = {
  micro: 18,
  tiny: 36,
  small: 48,
  medium: 64,
  large: 88
};

/** Clearance (m) around the temple nave / plaza statue so roads and houses stay off it. */
export const CIVIC_YARD_M: Record<CivicSize, number> = {
  micro: 4,
  tiny: 8,
  small: 10,
  medium: 12,
  large: 14
};

export function templeFootprintMeters(extentMeters: number): { length: number; width: number } {
  return TEMPLE_FOOTPRINT_M[civicSizeForExtent(extentMeters)];
}

/** Reserve the full detailed model in 2D; the nave dimensions alone omit projecting architecture. */
export function templeReservationMeters(extentMeters: number, sizeMeters?: number, type?: TempleType) {
  const preset = templeFootprintMeters(extentMeters);
  const length = sizeMeters && sizeMeters > 0 ? sizeMeters : preset.length;
  const width = (length * preset.width) / preset.length;
  if ((type ?? (length < 24 ? "chapel" : "basilica")) !== "basilica") return { length, width };
  return {
    length: BASILICA_RESERVATION_METERS.length * Math.max(1, length / BASILICA_NAVE_METERS.length),
    width: BASILICA_RESERVATION_METERS.width * Math.max(1, width / BASILICA_NAVE_METERS.width)
  };
}

export function plazaFootprintMeters(extentMeters: number): number {
  return PLAZA_FOOTPRINT_M[civicSizeForExtent(extentMeters)];
}

export function civicYardMeters(extentMeters: number): number {
  return CIVIC_YARD_M[civicSizeForExtent(extentMeters)];
}

/** Mesh cells reserved for the temple precinct. */
export function templeCellCount(extentMeters: number, capital: boolean): number {
  const bySize = { micro: 1, tiny: 1, small: 1, medium: 2, large: 3 }[civicSizeForExtent(extentMeters)];
  return Math.max(bySize, capital ? 2 : 1);
}
