/**
 * Gate-led market street for City Editor wards (approach-commerce-quarters.md §6.1, C1).
 * Read only when generation setting `approachCommerce` is "on". Off leaves the
 * descriptor without profiles and the ward scorer on its previous path.
 */

import type { ApproachProfile } from "../../services/approachProfile";
import type { Point } from "../types/geometry";
import { nearestOnPolyline } from "./geom";
import { cobbledWidthMeters } from "./roadTraffic";
import { defaultRoadWidthMeters } from "./settlementExtent";

/** A gate below this share of the town's cargo is not a gate ward. The main gate is exempt. */
export const QUIET_GATE_SHARE = 0.05;
/** Grain+livestock or luxury+manufactured at or above this pulls the extra market cells. */
export const MARKET_END_SHARE = 0.2;

export interface ApproachCommerceRoad {
  approachId?: string;
  group: string;
  approachProfile?: ApproachProfile;
}

export interface ApproachCommerceGate {
  point: Point;
  roadIndex?: number;
  water: boolean;
}

/** One located gate (or the sea landing, with `gateIndex` -1) used to score wards. */
export interface CommerceGateShare {
  gateIndex: number;
  point: Point;
  share: number;
  main: boolean;
}

export interface ApproachCommercePlan {
  mainPoint: Point;
  plaza: Point;
  /** Indexes into the planned gate list. The sea landing has none. */
  gateIndexes: number[];
  /** Gate → plaza, or gate → plaza → partner when a through-axis exists. */
  marketStreet: Point[];
  /** Where the second and later market cells sit along that street. */
  marketEnd: "gate" | "center" | "street";
  shares: CommerceGateShare[];
  /** Open ground just inside the main gate, wide at the gate and narrower inward. */
  funnel: { center: Point; radius: number }[];
}

export interface ApproachCommerceInput {
  roads: readonly ApproachCommerceRoad[];
  importedRoads?: readonly { sourceIndex: number }[];
  gates: readonly ApproachCommerceGate[];
  plaza: Point | null;
  /** Harbour anchor, when the programme drew one. */
  landing?: Point | null;
  port: boolean;
  extentMeters: number;
}

interface LocatedGate {
  approachId: string;
  point: Point;
  gateIndex: number;
  share: number;
  throughShare: number;
  axisPartner?: string;
  water: boolean;
  endFlow: number;
  profile: ApproachProfile;
}

/**
 * Keep measured gate profiles on the descriptor only when commerce quarters are on.
 * Approach traffic (O4) stays behind its own switch. Returns the same object when nothing is dropped.
 */
export function generationDescriptor<
  T extends { roads: { approachProfile?: unknown; approachTraffic?: unknown }[] }
>(settings: {
  descriptor?: T;
  approachGrowthSource?: "neighbors" | "traffic";
  approachCommerce?: "off" | "on";
}): T | undefined {
  const descriptor = settings.descriptor;
  if (!descriptor) return undefined;
  const dropTraffic = settings.approachGrowthSource !== "traffic";
  const dropProfiles = settings.approachCommerce !== "on";
  if (!descriptor.roads.some(road => (dropProfiles && road.approachProfile) || (dropTraffic && road.approachTraffic)))
    return descriptor;
  const copy = structuredClone(descriptor);
  for (const road of copy.roads) {
    if (dropProfiles) delete road.approachProfile;
    if (dropTraffic) delete road.approachTraffic;
  }
  return copy;
}

/** How many of a gate's touching cells become gate wards. Lower share, fewer cells. */
export function gateWardQuota(touching: number, share: number, main: boolean, maxShare: number): number {
  if (touching <= 0) return 0;
  if (!main && !(share >= QUIET_GATE_SHARE)) return 0;
  if (touching === 1) return 1;
  const fraction = maxShare > 0 ? Math.max(0, share) / maxShare : 1;
  return Math.max(1, Math.round(touching * fraction));
}

/** One step wider, the same scale as a cobbled approach. */
export function marketStreetWidthMeters(baseMeters: number): number {
  return cobbledWidthMeters(baseMeters);
}

/** Disks of open market ground inside the main gate. The disk nearest the gate is the widest. */
export function marketFunnelDisks(
  gate: Point,
  plaza: Point,
  extentMeters: number
): { center: Point; radius: number }[] {
  const dx = plaza[0] - gate[0];
  const dy = plaza[1] - gate[1];
  const length = Math.hypot(dx, dy);
  if (length < 12) return [];
  const reach = Math.min(72, Math.max(18, length * 0.28));
  const ux = dx / length;
  const uy = dy / length;
  const wide = marketStreetWidthMeters(defaultRoadWidthMeters(extentMeters));
  return [0.18, 0.48, 0.78].map((t, i) => ({
    center: [gate[0] + ux * reach * t, gate[1] + uy * reach * t] as Point,
    radius: wide * (1.15 - i * 0.28)
  }));
}

/** Lower is better. Distance to the market street, plus a light pull toward the plaza. */
export function merchantStreetScore(point: Point, origin: Point, street: readonly Point[]): number {
  return (
    nearestOnPolyline(point, street as Point[]).dist + Math.hypot(point[0] - origin[0], point[1] - origin[1]) * 0.3
  );
}

/** Lower is better. Facing the street, then the gate end or the plaza as the cargo asks. */
export function marketStreetScore(
  point: Point,
  street: readonly Point[],
  end: ApproachCommercePlan["marketEnd"],
  main: Point,
  plaza: Point
): number {
  const hit = nearestOnPolyline(point, street as Point[]);
  if (end === "center") return hit.dist + Math.hypot(point[0] - plaza[0], point[1] - plaza[1]) * 0.35;
  if (end === "gate") return hit.dist + Math.hypot(hit.point[0] - main[0], hit.point[1] - main[1]) * 0.35;
  return hit.dist;
}

/**
 * Main gate and market street from ledger profiles. Null when no gate has a profile,
 * so the caller keeps the previous ward assignment.
 */
export function resolveApproachCommerce(input: ApproachCommerceInput): ApproachCommercePlan | null {
  const plaza = input.plaza ?? [0, 0];
  const located = locateGates(input);
  const sea = busiestSea(input.roads);
  if (!located.length && !sea) return null;

  const axis = throughAxis(located);
  let main: LocatedGate | undefined;
  let partner: LocatedGate | undefined;
  if (axis) {
    main = busierEnd(axis[0], axis[1]);
    partner = main === axis[0] ? axis[1] : axis[0];
  } else {
    const land = located.filter(gate => !gate.water);
    main = land.sort(
      (a, b) =>
        b.endFlow - a.endFlow ||
        b.share - a.share ||
        (a.approachId < b.approachId ? -1 : a.approachId > b.approachId ? 1 : 0)
    )[0];
  }

  const seaWins = !axis && !!sea && input.port && !!input.landing && (!main || sea.share > main.share);
  if (!main && !seaWins) return null;

  const mainPoint = seaWins ? input.landing! : main!.point;
  const mainProfile = seaWins ? sea!.profile : main!.profile;
  if (Math.hypot(mainPoint[0] - plaza[0], mainPoint[1] - plaza[1]) < 1 && !partner) return null;

  const marketStreet = partner ? [mainPoint, plaza, partner.point] : [mainPoint, plaza];
  const gateIndexes = [seaWins ? -1 : main!.gateIndex, partner?.gateIndex].filter(
    (index): index is number => index !== undefined && index >= 0
  );
  const shares: CommerceGateShare[] = located.map(gate => ({
    gateIndex: gate.gateIndex,
    point: gate.point,
    share: gate.share,
    main: !seaWins && gate.gateIndex === main!.gateIndex
  }));
  if (seaWins) shares.push({ gateIndex: -1, point: mainPoint, share: sea!.share, main: true });

  return {
    mainPoint,
    plaza,
    gateIndexes,
    marketStreet,
    marketEnd: marketEndOf(mainProfile),
    shares,
    funnel: marketFunnelDisks(mainPoint, plaza, input.extentMeters)
  };
}

function marketEndOf(profile: ApproachProfile): ApproachCommercePlan["marketEnd"] {
  const bulk = (profile.cargo.grain ?? 0) + (profile.cargo.livestock ?? 0);
  const fine = (profile.cargoValue.luxury ?? 0) + (profile.cargo.manufactured ?? 0);
  if (bulk >= MARKET_END_SHARE && bulk >= fine) return "gate";
  if (fine >= MARKET_END_SHARE && fine > bulk) return "center";
  return "street";
}

function locateGates(input: ApproachCommerceInput): LocatedGate[] {
  const located: LocatedGate[] = [];
  for (let gateIndex = 0; gateIndex < input.gates.length; gateIndex++) {
    const gate = input.gates[gateIndex];
    if (gate.roadIndex === undefined) continue;
    const imported = input.importedRoads?.[gate.roadIndex];
    if (!imported) continue;
    const road = input.roads[imported.sourceIndex];
    if (!road?.approachProfile || !road.approachId) continue;
    const profile = road.approachProfile;
    located.push({
      approachId: road.approachId,
      point: gate.point,
      gateIndex,
      share: profile.share,
      throughShare: profile.throughShare,
      ...(profile.axisPartner ? { axisPartner: profile.axisPartner } : {}),
      water: gate.water || road.group === "searoutes",
      endFlow: profile.share * (1 - profile.throughShare),
      profile
    });
  }
  return located;
}

function busiestSea(roads: readonly ApproachCommerceRoad[]): { share: number; profile: ApproachProfile } | null {
  let best: { share: number; profile: ApproachProfile } | null = null;
  for (const road of roads) {
    if (road.group !== "searoutes" || !road.approachProfile) continue;
    if (!best || road.approachProfile.share > best.share)
      best = { share: road.approachProfile.share, profile: road.approachProfile };
  }
  return best;
}

function throughAxis(located: readonly LocatedGate[]): [LocatedGate, LocatedGate] | null {
  const byId = new Map(located.map(gate => [gate.approachId, gate]));
  const seen = new Set<string>();
  let best: { pair: [LocatedGate, LocatedGate]; score: number } | null = null;
  for (const gate of located) {
    if (!gate.axisPartner) continue;
    const partner = byId.get(gate.axisPartner);
    if (!partner || partner.approachId === gate.approachId) continue;
    const key = [gate.approachId, partner.approachId].sort().join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    const score = gate.share * gate.throughShare + partner.share * partner.throughShare;
    if (!(score > 0)) continue;
    if (!best || score > best.score) best = { pair: [gate, partner], score };
  }
  return best?.pair ?? null;
}

function busierEnd(a: LocatedGate, b: LocatedGate): LocatedGate {
  if (a.endFlow !== b.endFlow) return a.endFlow > b.endFlow ? a : b;
  if (a.share !== b.share) return a.share > b.share ? a : b;
  return a.approachId < b.approachId ? a : b;
}

/**
 * Descriptor index of the land main gate (§6.2). Null when no profile resolves,
 * or when the sea landing is the main gate and there is no land approach to host an inn.
 */
export function mainCommerceRoadIndex(roads: readonly ApproachCommerceRoad[], port: boolean): number | null {
  const importedRoads = roads.map((_, index) => ({ sourceIndex: index }));
  const gates: ApproachCommerceGate[] = [];
  for (let index = 0; index < roads.length; index++) {
    const road = roads[index];
    if (!road.approachId || !road.approachProfile || road.group === "searoutes") continue;
    // Synthetic points stay off the plaza so a lone gate is not rejected as coincident.
    gates.push({ point: [(index + 1) * 20, 0], roadIndex: index, water: false });
  }
  const plan = resolveApproachCommerce({
    roads,
    importedRoads,
    gates,
    plaza: [0, 0],
    landing: [0, 40],
    port,
    extentMeters: 600
  });
  const main = plan?.shares.find(share => share.main);
  if (!main || main.gateIndex < 0) return null;
  return gates[main.gateIndex]?.roadIndex ?? null;
}
