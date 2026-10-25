// Load checks for a v5 bastioned town. Derived indexes are not accepted as fields.
import type { BastionedTownPlan, CityDocument, DefenseRegion, Point } from "../../types/document";
import { finitePoint, finiteRing } from "./geometry";

function regionOk(region: DefenseRegion | undefined): boolean {
  return (
    Array.isArray(region) &&
    region.length > 0 &&
    region.every(
      poly => poly && finiteRing(poly.outer) && Array.isArray(poly.holes) && poly.holes.every(hole => finiteRing(hole))
    )
  );
}

function elevationsOk(values: number[] | undefined, length?: number): boolean {
  return (
    Array.isArray(values) &&
    values.length >= 1 &&
    (length === undefined || values.length === length) &&
    values.every(n => typeof n === "number" && Number.isFinite(n))
  );
}

function idOk(id: unknown): id is string {
  return typeof id === "string" && id.length > 0;
}

/** Reject a plan whose main line does not name real wall edges, or that contradicts a moat. */
export function validBastionedTown(document: CityDocument): boolean {
  const plan = document.bastionedTown;
  if (!plan || document.version !== 5) return false;
  if (!planShape(plan)) return false;
  const circuit = document.defenseCircuits?.find(c => c.id === plan.circuitId && c.scope === "town");
  if (!circuit || circuit.moat) return false;
  const wallEdges = new Set(
    document.featureGroups
      .filter(g => g.kind === "wall" && circuit.wallGroupIds.includes(g.id))
      .flatMap(g => (g.kind === "wall" ? g.segments.map(ref => ref.edgeId) : []))
  );
  const claimed = [...plan.bastions, ...plan.curtains].flatMap(part => part.wallEdgeIds);
  if (!claimed.length || claimed.some(id => !wallEdges.has(id))) return false;
  const edgeIds = new Set(Object.keys(document.mesh.edges));
  if (claimed.some(id => !edgeIds.has(id))) return false;
  return true;
}

function planShape(plan: BastionedTownPlan): boolean {
  if (
    plan.version !== 1 ||
    !idOk(plan.id) ||
    !idOk(plan.circuitId) ||
    (plan.boundaryKind !== "inland-closed" && plan.boundaryKind !== "waterfront") ||
    plan.locked !== true ||
    !Array.isArray(plan.bastions) ||
    plan.bastions.length < (plan.boundaryKind === "waterfront" ? 3 : 5) ||
    plan.bastions.length > 9 ||
    !Array.isArray(plan.curtains) ||
    ((!plan.sluices || !plan.sluices.length) && plan.curtains.length !== plan.bastions.length)
  )
    return false;
  const owners = new Set<string>([plan.id, plan.circuitId]);
  for (const bastion of plan.bastions) {
    if (
      !idOk(bastion.id) ||
      !owners.has(bastion.ownerId) ||
      !Array.isArray(bastion.wallEdgeIds) ||
      !bastion.wallEdgeIds.length ||
      !finiteRing(bastion.rampart) ||
      !finiteRing(bastion.platform) ||
      !elevationsOk(bastion.elevations?.base, 5) ||
      !elevationsOk(bastion.elevations?.crest, 5)
    )
      return false;
  }
  for (const curtain of plan.curtains) {
    if (
      !idOk(curtain.id) ||
      !owners.has(curtain.ownerId) ||
      !Array.isArray(curtain.wallEdgeIds) ||
      !curtain.wallEdgeIds.length ||
      !finiteRing(curtain.rampart, 4) ||
      !elevationsOk(curtain.elevations?.base, 2) ||
      !elevationsOk(curtain.elevations?.crest, 2) ||
      (curtain.closure !== undefined &&
        curtain.closure !== "rampart" &&
        curtain.closure !== "sluice" &&
        curtain.closure !== "shore")
    )
      return false;
    if (
      (curtain.closure === "sluice" || curtain.closure === "shore") &&
      !plan.sluices?.some(s => s.curtainId === curtain.id)
    )
      return false;
  }
  if (plan.sluices) {
    if (!Array.isArray(plan.sluices) || !plan.sluices.length) return false;
    for (const sluice of plan.sluices) {
      if (
        !idOk(sluice.id) ||
        sluice.ownerId !== plan.id ||
        (sluice.kind !== "sluice" && sluice.kind !== "shore") ||
        !plan.curtains.some(curtain => curtain.id === sluice.curtainId && curtain.closure === sluice.kind) ||
        !finiteRing(sluice.opening, 2) ||
        !Array.isArray(sluice.banks) ||
        sluice.banks.length !== 2 ||
        !sluice.banks.every(finitePoint)
      )
        return false;
    }
  }
  if (plan.works) {
    if (!Array.isArray(plan.works)) return false;
    const seen = new Set<string>();
    for (const work of plan.works) {
      if (
        !idOk(work.id) ||
        seen.has(work.kind) ||
        work.ownerId !== plan.id ||
        (work.kind !== "barracks" && work.kind !== "magazine") ||
        !finiteRing(work.polygon, 4)
      )
        return false;
      seen.add(work.kind);
    }
  }
  if (!Array.isArray(plan.outworks) || !Array.isArray(plan.ditches) || !Array.isArray(plan.coveredWays)) return false;
  for (const work of plan.outworks) {
    if (
      !idOk(work.id) ||
      work.ownerId !== plan.id ||
      !plan.curtains.some(c => c.id === work.curtainId) ||
      !finiteRing(work.outline) ||
      !finiteRing(work.rampart) ||
      !finiteRing(work.platform) ||
      !finitePoint(work.sally) ||
      !plan.ditches.some(d => d.id === work.ditchId) ||
      !elevationsOk(work.elevations?.base) ||
      !elevationsOk(work.elevations?.crest)
    )
      return false;
  }
  for (const ditch of plan.ditches) {
    if (!idOk(ditch.id) || (ditch.kind !== "dry" && ditch.kind !== "wet") || !regionOk(ditch.region)) return false;
    if (!elevationsOk(ditch.bed) || !elevationsOk(ditch.bank) || ditch.bed.length !== ditch.bank.length) return false;
    if (ditch.kind === "wet") {
      if (
        ditch.waterLevel === undefined ||
        !Number.isFinite(ditch.waterLevel) ||
        ditch.supply?.kind !== "closed-basin" ||
        ditch.supply.inlet !== "none" ||
        ditch.supply.outlet !== "none"
      )
        return false;
    }
  }
  for (const path of plan.coveredWays)
    if (!idOk(path.id) || !regionOk(path.region) || !elevationsOk(path.elevations)) return false;
  if (!Array.isArray(plan.glacis) || plan.glacis.some(region => !regionOk(region))) return false;
  if (!Array.isArray(plan.accesses) || !plan.accesses.length) return false;
  for (const access of plan.accesses) {
    if (
      !idOk(access.id) ||
      (access.role !== "civic" && access.role !== "defender") ||
      !idOk(access.gateId) ||
      !finiteRing(access.landBefore, 1) ||
      access.bridge.length !== 2 ||
      !access.bridge.every(finitePoint) ||
      !finiteRing(access.landAfter, 1) ||
      !(access.widthMeters > 0) ||
      !elevationsOk(access.elevations, access.bridge.length)
    )
      return false;
  }
  return true;
}

export function pointsOf(ring: Point[]): Point[] {
  return ring.map(p => [p[0], p[1]] as Point);
}
