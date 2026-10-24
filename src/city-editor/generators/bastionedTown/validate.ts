// Fortress setting checks. Geometry failures are reported by the planner.
import { editorText } from "../../../i18n/editorMessages";
import type { CityDocument } from "../../types/document";
import type { BastionedTownSettings, GenerationSettings } from "../../types/generation";
import { bastionEra } from "../generation/settings";

export type FortressFailureReason =
  | "fortress-insufficient-space"
  | "fortress-invalid-bastion"
  | "fortress-outwork-overlap"
  | "fortress-access-unreachable"
  | "fortress-housing-shortfall"
  | "fortress-water-conflict";

const FAILURE_KEY = {
  "fortress-insufficient-space": "cityEditor.messages.fortressInsufficientSpace",
  "fortress-invalid-bastion": "cityEditor.messages.fortressInvalidBastion",
  "fortress-outwork-overlap": "cityEditor.messages.fortressOutworkOverlap",
  "fortress-access-unreachable": "cityEditor.messages.fortressAccessUnreachable",
  "fortress-housing-shortfall": "cityEditor.messages.fortressHousingShortfall",
  "fortress-water-conflict": "cityEditor.messages.fortressWaterConflict"
} as const;

export function fortressFailureMessage(reason: FortressFailureReason): string {
  return editorText(FAILURE_KEY[reason]);
}

/** Smallest preset frame that can hold a star plus its outwork band around `cityRadius`. */
export function fortressFrameExtent(cityRadius: number): number {
  const needed = 2 * (cityRadius * 1.7 + 180);
  return [300, 600, 1200, 2400, 4800].find(n => n >= needed) ?? Math.ceil(needed / 100) * 100;
}

export function bastionedTownSettingConflicts(settings: GenerationSettings): string[] | null {
  const fort = settings.townFortification;
  if (!fort) return null;
  const reasons: string[] = [];
  if (fort.kind !== "bastioned") reasons.push("town fortification");
  if (!["none", "ravelins"].includes(fort.outworks)) reasons.push("outworks");
  if (!["dry", "wet"].includes(fort.ditch)) reasons.push("ditch");
  if (!["radial", "organic"].includes(fort.streetPlan)) reasons.push("street plan");
  if (settings.mode === "fort") reasons.push("mode");
  if (settings.townWallRings === "double") reasons.push("double walls");
  if (settings.generationMethod !== "skeleton-first") reasons.push("generation method");
  if (settings.wallShape !== "bastioned") reasons.push("wall shape");
  if (settings.walledAreaShare !== 1) reasons.push("walled share");
  if (!settings.config?.features?.walls) reasons.push("walls");
  if (
    settings.wallSides !== undefined &&
    (!Number.isInteger(settings.wallSides) || settings.wallSides < 5 || settings.wallSides > 9)
  )
    reasons.push("bastion count");
  const layout = settings.layout;
  if (layout === "bram" || layout === "circulade" || layout === "classic" || layout === "auto") reasons.push("layout");
  if (layout === "organic" && fort.streetPlan !== "organic") reasons.push("layout");
  if (layout !== undefined && layout !== "organic" && fort.streetPlan === "organic") reasons.push("layout");
  if (settings.moats?.town === false) reasons.push("moat");
  if (settings.moats?.castle !== undefined) reasons.push("moat");
  if (settings.riverPlacement !== undefined && settings.riverPlacement !== "through") reasons.push("river");
  if (settings.streets?.avoidSea === false) reasons.push("coast roads");
  if (settings.elevationPreset !== undefined && settings.elevationPreset !== "flat") reasons.push("elevation");
  if (settings.config?.relief === true) reasons.push("relief");
  if (!bastionEra(settings.historicalPeriod ?? settings.descriptor?.historicalPeriod)) reasons.push("era");
  return reasons.length ? reasons : null;
}

export function fortressSettingsMessage(features: string[]): string {
  return editorText("cityEditor.messages.fortressSettingsConflict", { features: features.join(", ") });
}

/** A ditch span must run along the curtain outward normal. Skew is not a style choice. */
export function ditchSpanDeviationDegrees(span: [Point, Point], outward: Point): number {
  const dx = span[1][0] - span[0][0];
  const dy = span[1][1] - span[0][1];
  const len = Math.hypot(dx, dy) || 1;
  const along = Math.abs((dx / len) * outward[0] + (dy / len) * outward[1]);
  return (Math.acos(Math.min(1, along)) * 180) / Math.PI;
}

type Point = [number, number];

export function citadelRequested(settings: GenerationSettings): boolean {
  return settings.descriptor ? !!settings.descriptor.burg.citadel : !!settings.config.features.citadel;
}

export function isBastionedTownSettings(value: unknown): value is BastionedTownSettings {
  if (!value || typeof value !== "object") return false;
  const fort = value as BastionedTownSettings;
  return (
    fort.kind === "bastioned" &&
    (fort.outworks === "none" || fort.outworks === "ravelins") &&
    (fort.ditch === "dry" || fort.ditch === "wet") &&
    (fort.streetPlan === "radial" || fort.streetPlan === "organic")
  );
}

export function documentHasFortress(document: CityDocument): boolean {
  return !!document.bastionedTown;
}
