import type { CellLandUseBudget, LandUsePatchBudget, LandUseSnapshot } from "../types/landUse";
import { clipConvex, landscapeNoise, polygonArea, rectangle, subtractConvex, trimToArea } from "./landUseGeometry";
import type { ClearanceCellInput } from "./settlementClearance";

type Point = [number, number];
/** Game calibrations, not inferred historical events. */
export function recoveryYears(temp = 12, precipitation = 45): number {
  return temp <= 5 ? 60 : precipitation < 20 ? 45 : temp >= 20 && precipitation >= 60 ? 12 : 25;
}
export function clearanceLabor(input: ClearanceCellInput, previous?: CellLandUseBudget): number {
  const workforce = input.workforce;
  if (!workforce) return input.newClearanceAreaHa ?? 0;
  const maintenance = (previous?.allocatedAreaHa ?? 0) * workforce.maintenanceDaysPerHa;
  const available = Math.max(
    0,
    workforce.adultPeople * workforce.workableDays - maintenance - workforce.otherOccupationDays
  );
  // A dedicated share cannot reuse the rest of the resident occupation calendar.
  return (
    Math.min(available, workforce.adultPeople * workforce.workableDays * workforce.clearanceShare) /
    Math.max(1, workforce.clearanceDaysPerHa)
  );
}
/** Dijkstra over explicit access edges. No implicit bridge or cross-border permission. */
export function supplyCatchments(inputs: readonly ClearanceCellInput[]): Map<number, { id: number; cost: number }[]> {
  const byId = new Map(inputs.map(i => [i.id, i]));
  const result = new Map<number, { id: number; cost: number }[]>();
  for (const source of inputs) {
    const costs = new Map([[source.id, 0]]),
      visited = new Set<number>();
    const limit = source.maxTransportCost ?? 30;
    while (true) {
      const next = [...costs].filter(([id]) => !visited.has(id)).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
      if (!next) break;
      const [id, cost] = next;
      visited.add(id);
      const current = byId.get(id)!;
      for (const edge of current.access ?? []) {
        if (!byId.has(edge.cellId) || edge.allowed === false || !(edge.cost >= 0)) continue;
        const target = byId.get(edge.cellId)!;
        if (
          target.tenure === "protected" ||
          (target.tenure === "private" && (target.ownerId === undefined || target.ownerId !== source.ownerId))
        )
          continue;
        const candidate = cost + edge.cost;
        if (candidate <= limit && candidate < (costs.get(edge.cellId) ?? Infinity)) costs.set(edge.cellId, candidate);
      }
    }
    result.set(
      source.id,
      [...costs].map(([id, cost]) => ({ id, cost })).sort((a, b) => a.cost - b.cost || a.id - b.id)
    );
  }
  return result;
}
/** Ancillary primary uses claim distinct land; fodder and grazed fallow are credited only once. */
export function addActivities(
  input: ClearanceCellInput,
  cell: CellLandUseBudget,
  year: number,
  previous?: CellLandUseBudget
): void {
  let remaining = Math.max(0, cell.physicalLandAreaHa - cell.patches.reduce((s, p) => s + p.areaHa, 0));
  const add = (kind: LandUsePatchBudget["kind"], requested: number, canopyRetention = 0) => {
    const areaHa = Math.min(remaining, Math.max(0, requested));
    remaining -= areaHa;
    if (!areaHa) return undefined;
    const patch: LandUsePatchBudget = {
      id: `land:${input.id}:${kind}`,
      sourceCellId: input.id,
      kind,
      areaHa,
      anchor: input.anchor,
      supplierIds: [],
      stage: "maintained",
      convertedForestAreaHa: 0,
      canopyRetention
    };
    cell.patches.push(patch);
    return patch;
  };
  const livestock = input.livestock;
  if (livestock) {
    cell.diagnostics.push("resolved-livestock-land");
    const fallow = cell.allocatedAreaHa * (1 - (input.annualSownShare ?? 0.67));
    const credited =
      Math.min(livestock.grazedFallowHa ?? 0, fallow) +
      Math.min(livestock.fodderWithinFieldsHa ?? 0, cell.allocatedAreaHa - fallow);
    const demand = Math.max(0, livestock.grazingAreaHa - credited);
    const wood = Math.min(demand, livestock.woodPastureHa ?? 0);
    add("wood_pasture", wood, 0.55);
    add("pasture", demand - wood);
    add("hay_meadow", livestock.hayAreaHa ?? 0);
    if (
      demand + (livestock.hayAreaHa ?? 0) >
      cell.patches
        .filter(p => ["wood_pasture", "pasture", "hay_meadow"].includes(p.kind))
        .reduce((s, p) => s + p.areaHa, 0)
    )
      cell.diagnostics.push("livestock-land-shortfall");
  }
  const agro = add("agroforestry", input.agroforestryAreaHa ?? 0, 0.5);
  if (agro)
    agro.rotation = {
      years: input.agroforestryRotationYears ?? 20,
      activeYears: input.agroforestryRotationYears ?? 20,
      epoch: previous?.patches.find(p => p.kind === "agroforestry")?.rotation?.epoch ?? year,
      phase:
        (((year - (previous?.patches.find(p => p.kind === "agroforestry")?.rotation?.epoch ?? year)) %
          (input.agroforestryRotationYears ?? 20)) +
          (input.agroforestryRotationYears ?? 20)) %
        (input.agroforestryRotationYears ?? 20)
    };
  const managed = add("managed_forest", input.managedForestAreaHa ?? 0, 1);
  if (managed) {
    const old = previous?.patches.find(p => p.kind === "managed_forest")?.management;
    managed.management = old
      ? { ...old, rotationYears: Math.max(1, input.forestRotationYears ?? old.rotationYears) }
      : {
          rotationYears: Math.max(1, input.forestRotationYears ?? 25),
          lastHarvestYear: year,
          harvestedCoverage: 0,
          harvestYear: year
        };
  }
  if (input.profile === "shifting") {
    if (input.shiftingCycleYears === undefined) cell.diagnostics.push("estimated-shifting-cycle");
    const field = cell.patches.find(p => p.kind === "cultivation");
    if (field) {
      const years = Math.max(2, input.shiftingCycleYears ?? 12),
        activeYears = Math.max(1, Math.min(years - 1, input.shiftingActiveYears ?? 2));
      const epoch = previous?.patches.find(p => p.rotation)?.rotation?.epoch ?? year;
      const phase = (((year - epoch) % years) + years) % years;
      field.rotation = { years, activeYears, epoch, phase };
      const fallow = add("agroforestry", field.areaHa * (years / activeYears - 1), 0.7);
      if (fallow) {
        fallow.rotation = { ...field.rotation };
        fallow.stage = "fallow";
      }
      if (!fallow || fallow.areaHa + 1e-6 < field.areaHa * (years / activeYears - 1))
        cell.diagnostics.push("shifting-cycle-land-shortfall");
    }
  }
}
/** Coarse, bounded FMG geometry. Timber intersections are measured against the same partition RE reads. */
export function placeLandUses(input: ClearanceCellInput, cell: CellLandUseBudget, seed: string): void {
  const boundary = input.polygon;
  if (!boundary || boundary.length < 3 || !(polygonArea(boundary) > 0)) return;
  const areaScale = cell.physicalLandAreaHa / polygonArea(boundary);
  if (!(areaScale > 0)) return;
  cell.geometryHaPerUnit = areaScale;
  const xs = boundary.map(p => p[0]),
    ys = boundary.map(p => p[1]);
  const step = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 8;
  const pieces: Point[][] = [];
  for (let x = Math.floor(Math.min(...xs) / step); x * step < Math.max(...xs); x++)
    for (let y = Math.floor(Math.min(...ys) / step); y * step < Math.max(...ys); y++) {
      const square = rectangle(x * step, y * step, step, step);
      for (const triangle of [
        [square[0], square[1], square[2]],
        [square[0], square[2], square[3]]
      ]) {
        const tile = clipConvex(triangle, boundary);
        if (polygonArea(tile) > 1e-9) pieces.push(tile);
      }
    }
  const noise = (p: Point) =>
    landscapeNoise((p[0] * Math.sqrt(areaScale) * 100) / 5000, (p[1] * Math.sqrt(areaScale) * 100) / 5000, seed);
  const contour = (poly: Point[], threshold: number): Point[] => {
    const output: Point[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        va = noise(a) - threshold,
        vb = noise(b) - threshold;
      if (va >= 0) output.push(a);
      if (va >= 0 !== vb >= 0) {
        const t = va / (va - vb);
        output.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    return output;
  };
  // The threshold is shared across a biome: per-cell quotas would manufacture boundary gaps.
  // Potential timber capacity remains independent of this primary forest land geometry.
  const cover = Math.min(1, Math.max(0, input.forestCover));
  const threshold = cover <= 0 ? 2 : cover >= 1 ? -1 : 0.5 + (0.5 - cover) * 0.55;
  cell.forestCapacityCoverage = cover;
  const forest: Point[][] = [],
    open: Point[][] = [];
  for (const poly of pieces) {
    const cut = contour(poly, threshold);
    if (polygonArea(cut) > 1e-10) {
      forest.push(cut);
      open.push(...subtractConvex(poly, cut));
    } else open.push(poly);
  }
  cell.forestPolygons = forest;
  // Every partition piece lies wholly inside or outside the forest domain. Preserve that
  // provenance through clipping instead of repeating all-pairs polygon intersections.
  const forestPieces = new WeakSet(forest);
  const inherit = (parent: Point[], children: Point[][]) => {
    if (forestPieces.has(parent)) for (const child of children) forestPieces.add(child);
    return children;
  };
  const priority = (poly: Point[]) => {
    const center = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length] as Point, [
      0, 0
    ] as Point);
    return Math.hypot(center[0] - input.anchor[0], center[1] - input.anchor[1]) + noise(center) * step * 3;
  };
  open.sort((a, b) => priority(a) - priority(b));
  forest.sort((a, b) => priority(a) - priority(b));
  let available = [...open, ...forest];
  const phase = cell.patches.find(p => p.rotation && p.kind === "cultivation")?.rotation?.phase ?? 0;
  if (phase && available.length) {
    const offset = Math.floor((available.length * phase) / (input.shiftingCycleYears ?? 12));
    available = [...available.slice(offset), ...available.slice(0, offset)];
  }
  cell.convertedForestAreaHa = 0;
  for (const patch of cell.patches.filter(p => !["natural_forest", "other_natural"].includes(p.kind))) {
    if (patch.kind === "built") {
      const side = Math.sqrt(patch.areaHa / areaScale);
      const footprint = rectangle(patch.anchor[0] - side / 2, patch.anchor[1] - side / 2, side, side);
      const centered = available
        .flatMap(p => inherit(p, [clipConvex(p, footprint)]))
        .filter(p => polygonArea(p) > 1e-9);
      const remainder = available.flatMap(p => inherit(p, subtractConvex(p, footprint)));
      remainder.sort(
        (a, b) =>
          Math.hypot(a[0][0] - patch.anchor[0], a[0][1] - patch.anchor[1]) -
          Math.hypot(b[0][0] - patch.anchor[0], b[0][1] - patch.anchor[1])
      );
      available = [...centered, ...remainder];
    }
    if (patch.kind === "managed_forest" || patch.kind === "wood_pasture")
      available.sort((a, b) => Number(forestPieces.has(b)) - Number(forestPieces.has(a)));
    patch.polygons = [];
    let needed = patch.areaHa;
    const unrepresentable: Point[][] = [];
    while (needed > 1e-8 && available.length) {
      const poly = available.shift()!,
        area = polygonArea(poly) * areaScale;
      const cut = area > needed ? trimToArea(poly, needed / areaScale) : poly;
      const cutArea = polygonArea(cut) * areaScale;
      // A cut below coordinate precision cannot advance allocation. Preserve it for
      // later uses, but never feed the unchanged polygon back into this loop.
      if (!(cutArea > 0) || needed - cutArea === needed) {
        unrepresentable.push(poly);
        continue;
      }
      inherit(poly, [cut]);
      patch.polygons.push(cut);
      needed -= cutArea;
      if (area > cutArea) available.unshift(...inherit(poly, subtractConvex(poly, cut)));
    }
    available.push(...unrepresentable);
    const intersection = patch.polygons
      .filter(p => forestPieces.has(p))
      .reduce((s, p) => s + polygonArea(p) * areaScale, 0);
    patch.convertedForestAreaHa = intersection * (1 - (patch.canopyRetention ?? 0));
    cell.convertedForestAreaHa += patch.convertedForestAreaHa;
  }
  // Reconcile natural budgets with measured intersection, preserving the physical partition.
  const used = cell.patches
    .filter(p => !["natural_forest", "other_natural"].includes(p.kind))
    .reduce((s, p) => s + p.areaHa, 0);
  const remaining = cell.physicalLandAreaHa - used;
  const actualForest = available.filter(p => forestPieces.has(p)).reduce((s, p) => s + polygonArea(p) * areaScale, 0);
  for (const patch of cell.patches.filter(p => ["natural_forest", "other_natural"].includes(p.kind))) {
    patch.areaHa = patch.kind === "natural_forest" ? actualForest : Math.max(0, remaining - actualForest);
    patch.polygons = available.filter(p => forestPieces.has(p) === (patch.kind === "natural_forest"));
  }
  cell.diagnostics = cell.diagnostics.filter(d => d !== "estimated-spatial-forest-intersection");
  cell.diagnostics.push("coarse-spatial-forest-intersection", "estimated-natural-forest-layout");
}
/** Sustainable annual compartment budget; natural logging remains a stock-only operation. */
export function managedHarvestAllowance(
  snapshot: LandUseSnapshot | undefined,
  cellId: number,
  year: number
): number | undefined {
  const cell = snapshot?.cells[cellId];
  const managed = cell?.patches.filter(p => p.kind === "managed_forest" && p.management);
  if (!cell || !managed?.length) return undefined;
  return managed.reduce((s, p) => {
    const m = p.management!;
    return (
      s +
      Math.max(
        0,
        p.areaHa / cell.physicalLandAreaHa / m.rotationYears - (m.harvestYear === year ? m.harvestedCoverage : 0)
      )
    );
  }, 0);
}

/** Newly removed forest in space, including moving crop compartments. Scalar net growth is insufficient. */
export function newlyConvertedForest(cell: CellLandUseBudget, previous?: CellLandUseBudget): number {
  if (previous && cell.geometryHaPerUnit && !previous.patches.some(p => p.polygons)) {
    // Adopting geometry is not another historical harvest: only growth of known uses is new.
    return cell.patches
      .filter(p => !["natural_forest", "other_natural", "managed_forest", "abandoned"].includes(p.kind))
      .reduce((s, p) => {
        const old = previous.patches.filter(q => q.kind === p.kind).reduce((s, q) => s + q.areaHa, 0);
        return s + Math.max(0, p.areaHa - old) * (p.areaHa > 0 ? p.convertedForestAreaHa / p.areaHa : 0);
      }, 0);
  }
  if (!previous || !cell.geometryHaPerUnit || !cell.forestPolygons || !previous.patches.some(p => p.polygons))
    return Math.max(0, cell.convertedForestAreaHa - (previous?.convertedForestAreaHa ?? 0));
  let total = 0;
  for (const patch of cell.patches) {
    if (["natural_forest", "other_natural", "managed_forest", "abandoned"].includes(patch.kind)) continue;
    const removed = 1 - (patch.canopyRetention ?? 0);
    for (const poly of patch.polygons ?? [])
      for (const forest of cell.forestPolygons) {
        const intersection = clipConvex(poly, forest);
        if (polygonArea(intersection) < 1e-9) continue;
        let residual = [intersection];
        for (const old of previous.patches.filter(p => p.convertedForestAreaHa > 0)) {
          const oldRemoved =
            old.kind === "abandoned"
              ? Math.max(
                  0,
                  1 -
                    ((cell.lastUpdatedYear ?? previous.lastUpdatedYear ?? 0) -
                      (old.abandonedYear ?? previous.lastUpdatedYear ?? cell.lastUpdatedYear ?? 0)) /
                      (old.recoveryYears ?? 25)
                )
              : 1 - (old.canopyRetention ?? 0);
          for (const oldPoly of old.polygons ?? []) {
            for (const piece of residual)
              total += polygonArea(clipConvex(piece, oldPoly)) * Math.max(0, removed - oldRemoved);
            residual = residual.flatMap(p => subtractConvex(p, oldPoly));
          }
        }
        total += residual.reduce((s, p) => s + polygonArea(p) * removed, 0);
      }
  }
  return total * cell.geometryHaPerUnit;
}
