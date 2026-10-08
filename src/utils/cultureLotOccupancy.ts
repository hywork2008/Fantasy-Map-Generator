import type { Burg, Culture } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { getUrbanDwellings } from "./urbanDwellings";

/** Lot occupancy a culture builds towards when its own guide is unset. */
export const DEFAULT_LOT_OCCUPANCY = 0.8;

/** City Editor houses per hectare of the town disc (π·radius²) at 100% Lot
 * occupancy, measured with this sizing on Bac Trang (2026-10-08, medians of
 * 68 towns). A wall with its ring road, or a citadel, takes part of the disc. */
export const HOUSES_PER_DISC_HECTARE = { walled: 110, citadel: 133, open: 180 } as const;

/** Highest occupancy the radius is sized for. Capacity per hectare varies by
 * about ±20% between towns, and City Editor cannot add lots beyond 100%, so a
 * fully packed guide still leaves room for a town that measures below median. */
export const MAX_SIZING_LOT_OCCUPANCY = 0.85;

export function isLotOccupancy(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1;
}

/** Culture guide for City Editor's Lot occupancy (0–1). */
export function cultureLotOccupancy(culture: Culture | undefined): number {
  return isLotOccupancy(culture?.lotOccupancy) ? culture.lotOccupancy : DEFAULT_LOT_OCCUPANCY;
}

export function burgLotOccupancy(pack: Pick<PackedGraph, "cultures" | "cells">, burg: Burg): number {
  const culture = burg.culture ?? pack.cells?.culture?.[burg.cell];
  return cultureLotOccupancy(culture == null ? undefined : (pack.cultures?.[culture] as Culture | undefined));
}

/** Town radius whose residential cells hold the burg's dwellings at
 * `lotOccupancy`, aimed at the middle of City Editor's 0–5% housing allowance.
 * City Editor then measures the real count and corrects the remainder. */
export function occupancyRadiusMeters(
  population: number,
  lotOccupancy: number,
  burg: { walls?: boolean | number; citadel?: boolean | number }
): number {
  const houses = getUrbanDwellings(population) * 1.025;
  const kind = burg.walls ? "walled" : burg.citadel ? "citadel" : "open";
  const density = HOUSES_PER_DISC_HECTARE[kind] * Math.min(lotOccupancy, MAX_SIZING_LOT_OCCUPANCY);
  const radius = Math.sqrt(((houses / density) * 10000) / Math.PI);
  // A hamlet has a handful of cells, so a plaza, citadel or bank can take
  // half its capacity. Below 80 m the disc grows, by 60% at 40 m.
  const spare = 1 + Math.max(0, Math.min(0.6, ((80 - radius) / 40) * 0.6));
  return Math.max(40, Math.min(1500, Math.round(radius * Math.sqrt(spare))));
}
