import type { AllocateGaelicInput, FeudalRegime, GaelicCellInput, NobleHolding } from "./types";

/** Population determines institutions; area and adjacency determine their territorial footprint. */
export function allocateEuropeanHoldings(input: AllocateGaelicInput, regime: FeudalRegime): NobleHolding[] {
  const cells = input.cells.filter(c => c.height >= 20).sort((a, b) => a.id - b.id);
  if (!cells.length) return [];
  const people = cells.reduce((sum, c) => sum + c.ruralPeople + c.urbanPeople, 0);
  const byId = new Map(cells.map(c => [c.id, c]));
  const available = new Set(cells.map(c => c.id));
  const holdings: NobleHolding[] = [];
  const communal = regime === "italianCommunal" || regime === "urbanCommunal";
  const officer = regime === "nordicOfficer" || regime === "hungarianCounty";
  const feeDensity =
    regime === "nordicOfficer" ? 0.25 : regime === "germanImmediate" ? 0.7 : regime === "iberianConcejo" ? 0.5 : 1;
  const create = (list: GaelicCellInput[], patch: Partial<NobleHolding>): NobleHolding => {
    const seat = [...list].sort((a, b) => b.urbanPeople - a.urbanPeople || a.id - b.id).find(c => c.burgId > 0);
    const h: NobleHolding = {
      id: holdings.length + 1,
      stateId: input.stateId,
      dignity: null,
      office: "none",
      tenure: "fief",
      cellIds: list.map(c => c.id),
      provinceIds: [...new Set(list.map(c => c.provinceId).filter(Boolean))],
      burgIds: list.filter(c => c.burgId).map(c => c.burgId),
      knightFees: Math.max(
        0,
        Math.round((list.reduce((sum, c) => sum + c.ruralPeople + c.urbanPeople, 0) / 400) * feeDensity)
      ),
      holderKind: "character",
      hereditary: true,
      frontier: list.some(c => input.threatenedProvinceIds?.includes(c.provinceId)),
      seatName:
        seat?.burgName ||
        input.provinces.find(p => p.id === list[0]?.provinceId)?.name ||
        `Holding ${holdings.length + 1}`,
      seatBurgId: seat?.burgId ?? 0,
      ...patch
    };
    holdings.push(h);
    return h;
  };
  const grow = (seed: number, targetPeople: number, maxArea = Infinity): GaelicCellInput[] => {
    const queue = [seed],
      seen = new Set<number>(),
      result: GaelicCellInput[] = [];
    let population = 0,
      area = 0;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (seen.has(id)) continue;
      seen.add(id);
      const c = byId.get(id);
      if (!c || !available.has(id)) continue;
      if (result.length && (population >= targetPeople || area + c.areaKm2 > maxArea)) continue;
      available.delete(id);
      result.push(c);
      population += c.ruralPeople + c.urbanPeople;
      area += Math.max(0, c.areaKm2);
      queue.push(...c.neighborIds.filter(n => available.has(n)).sort((a, b) => a - b));
    }
    return result;
  };
  const capital =
    input.capitalCellId !== undefined && available.has(input.capitalCellId) ? input.capitalCellId : cells[0].id;
  const crownRatio =
    regime === "germanImmediate"
      ? 0.05
      : regime === "frenchTerritorial"
        ? input.period === "lateMedieval"
          ? 0.5
          : 0.15
        : officer
          ? 0.1
          : 0.2;

  if (regime === "englishHonour") {
    // Honours share rights across shires. Exact integer accounting leaves no unowned or overbooked cell.
    create([], {
      holderKind: "crown",
      tenure: "demesne",
      shares: [],
      seatName: "Crown",
      seatBurgId: input.capitalBurgId
    });
    create([], {
      holderKind: "abbey",
      office: "abbotTemporal",
      tenure: "ecclesiastical",
      shares: [],
      seatName: "Church"
    });
    const earlCount = Math.floor(people / 300000),
      baronCount = Math.floor(people / 17500);
    const count = Math.max(1, earlCount + baronCount);
    for (let i = 0; i < count; i++)
      create([], {
        dignity: i < earlCount ? "count" : "baron",
        shares: [],
        seatName:
          cells.filter(c => c.burgId)[i % Math.max(1, cells.filter(c => c.burgId).length)]?.burgName ||
          `Honour ${i + 1}`
      });
    const owners = new Map<number, Set<number>>(cells.map(c => [c.id, new Set<number>()]));
    for (let i = 0; i < count; i++)
      for (let offset = 0; offset < Math.min(4, cells.length); offset++)
        owners.get(cells[(i * 37 + offset) % cells.length].id)!.add(i);
    for (const c of cells) {
      holdings[0].shares!.push({ cellId: c.id, basisPoints: 2000 });
      holdings[1].shares!.push({ cellId: c.id, basisPoints: 1500 });
      const assigned = owners.get(c.id)!;
      if (!assigned.size) assigned.add(c.id % count);
      const list = [...assigned];
      const base = Math.floor(6500 / list.length),
        remainder = 6500 % list.length;
      for (const [index, i] of list.entries()) {
        const bp = base + (index < remainder ? 1 : 0);
        if (bp) holdings[i + 2].shares!.push({ cellId: c.id, basisPoints: bp });
      }
    }
    for (const h of holdings) {
      const shares = h.shares ?? [];
      h.provinceIds = [...new Set(shares.map(s => byId.get(s.cellId)!.provinceId).filter(Boolean))];
      h.knightFees = Math.round(
        shares.reduce((sum, s) => {
          const c = byId.get(s.cellId)!;
          return sum + ((c.ruralPeople + c.urbanPeople) * s.basisPoints) / 10000;
        }, 0) / 400
      );
    }
  } else {
    create(grow(capital, people * crownRatio), {
      holderKind: "crown",
      tenure: "demesne",
      seatBurgId: input.capitalBurgId
    });
    const churchSeed = cells
      .filter(c => available.has(c.id))
      .sort((a, b) => b.urbanPeople - a.urbanPeople || a.id - b.id)[0];
    if (churchSeed && regime !== "episcopal")
      create(grow(churchSeed.id, people * 0.15), {
        holderKind: "abbey",
        tenure: "ecclesiastical",
        office: "abbotTemporal"
      });
    const target =
      regime === "germanImmediate"
        ? input.period === "earlyMedieval"
          ? 500000
          : input.period === "lateMedieval"
            ? 35000
            : 100000
        : communal
          ? 75000
          : officer
            ? 150000
            : 100000;
    while (available.size) {
      const seed = cells
        .filter(c => available.has(c.id))
        .sort((a, b) => b.urbanPeople - a.urbanPeople || a.id - b.id)[0];
      const list = grow(
        seed.id,
        target,
        regime === "italianFeudal" ? 8000 : communal || regime === "iberianConcejo" ? 6000 : officer ? 3000 : 15000
      );
      const town = communal || (regime === "iberianConcejo" && seed.burgId > 0);
      const frontier = list.some(c => input.threatenedProvinceIds?.includes(c.provinceId));
      const order = regime === "iberianConcejo" && frontier && !town;
      const episcopal = regime === "episcopal";
      create(list, {
        holderKind: town ? "commune" : order ? "order" : officer ? "odal" : "character",
        tenure: town
          ? "urbanJurisdiction"
          : order
            ? "militaryOrder"
            : officer
              ? "odal"
              : episcopal
                ? "ministerialis"
                : "fief",
        dignity:
          town || order || officer
            ? null
            : episcopal
              ? "banneret"
              : regime === "germanImmediate" &&
                  input.period === "earlyMedieval" &&
                  list.reduce((s, c) => s + c.areaKm2, 0) >= 15000
                ? "duke"
                : "count",
        office: town
          ? regime === "italianCommunal"
            ? "podesta"
            : "consuls"
          : order
            ? "orderMaster"
            : episcopal
              ? "castellan"
              : frontier && regime !== "nordicOfficer" && regime !== "hungarianCounty"
                ? "borderCommand"
                : "none",
        hereditary: !town && !order && !episcopal
      });
    }
  }
  if (officer || regime === "englishHonour") {
    for (const province of input.provinces)
      create([], {
        office: regime === "nordicOfficer" ? "sysselman" : regime === "hungarianCounty" ? "ispan" : "sheriff",
        tenure: "feeQuotaOnly",
        hereditary: false,
        provinceIds: [province.id],
        seatName: province.name,
        seatBurgId: province.seatBurgId,
        knightFees: 0
      });
  }
  return holdings;
}
