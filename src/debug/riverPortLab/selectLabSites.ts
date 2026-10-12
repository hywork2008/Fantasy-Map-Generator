/**
 * River-Port Lab forced burg sites (docs/plan/river-port-lab.md §4.2): picks cells per site kind
 * with the same classifier the statistics use, spaced so neighbouring lab burgs do not merge.
 */
import type { Quadtree } from "d3-quadtree";
import {
  buildRiverSiteIndex,
  classifyRiverSite,
  LAB_SITE_KINDS,
  type LabSiteKind,
  type RiverSiteWorld
} from "./classifyRiverSite";

export interface LabSitePick {
  cell: number;
  kind: LabSiteKind;
}

export interface LabSiteSelection {
  picks: LabSitePick[];
  /** Kinds whose quota could not be met, with the missing count. */
  shortfall: Partial<Record<LabSiteKind, number>>;
  /** Candidate cells per kind before spacing, to tell a scarce kind from a crowded one. */
  supply: Partial<Record<LabSiteKind, number>>;
}

export function selectLabSites(
  world: RiverSiteWorld,
  candidates: Iterable<number>,
  quota: Partial<Record<LabSiteKind, number>>,
  quadtree: Quadtree<[number, number]>,
  minSpacing: number,
  random: () => number
): LabSiteSelection {
  const index = buildRiverSiteIndex(world);
  const byKind = new Map<LabSiteKind, number[]>();
  for (const cell of candidates) {
    const site = classifyRiverSite(index, cell);
    if (!site) continue;
    const list = byKind.get(site.kind) ?? [];
    list.push(cell);
    byKind.set(site.kind, list);
  }

  const picks: LabSitePick[] = [];
  const shortfall: LabSiteSelection["shortfall"] = {};
  // Rare kinds first, so a common kind cannot take the only confluence's neighbourhood.
  const order = LAB_SITE_KINDS.filter(kind => (quota[kind] ?? 0) > 0).sort(
    (a, b) => (byKind.get(a)?.length ?? 0) - (byKind.get(b)?.length ?? 0)
  );
  for (const kind of order) {
    const want = quota[kind] ?? 0;
    const list = [...(byKind.get(kind) ?? [])];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    let got = 0;
    for (const cell of list) {
      if (got >= want) break;
      const [x, y] = world.cells.p[cell];
      if (quadtree.find(x, y, minSpacing) !== undefined) continue;
      quadtree.add([x, y]);
      picks.push({ cell, kind });
      got++;
    }
    if (got < want) shortfall[kind] = want - got;
  }
  const supply = Object.fromEntries([...byKind].map(([kind, list]) => [kind, list.length]));
  return { picks, shortfall, supply };
}
