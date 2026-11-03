import type { CityElement } from "../types/document";
import type { ShipDisplayState } from "../types/ships";

export const MOORED_SHIP_STATE = { sails: "furled", gunports: "closed" } as const;
export const BRUSH_SHIP_STATE = { sails: "set", gunports: "closed" } as const;

/** Explicit saved state wins; legacy harbor ships remain moored and manual ships sail-ready. */
export function resolveShipDisplayState(
  element: Pick<CityElement, "id" | "shipState" | "harborFaceId" | "harborOperation">
): ShipDisplayState {
  if (element.shipState) return { ...element.shipState };
  const fallback =
    element.harborFaceId || element.harborOperation || element.id.startsWith("gc:ship-")
      ? MOORED_SHIP_STATE
      : BRUSH_SHIP_STATE;
  return { ...fallback };
}

export function validShipDisplayState(value: unknown): value is ShipDisplayState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<ShipDisplayState>;
  return ["set", "furled"].includes(state.sails ?? "") && ["open", "closed"].includes(state.gunports ?? "");
}
