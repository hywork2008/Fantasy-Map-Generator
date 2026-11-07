import { csvParse } from "d3";
import occupations from "../../../docs/plan/medieval-urban-calibration-targets/occupations.csv?raw";
import { DEDICATED_COOPER } from "../../buildings/medieval/dedicatedCooperProfile";
import { dedicatedSmithyProfile } from "../../buildings/medieval/dedicatedSmithyProfile";
import { DEDICATED_TANNERY } from "../../buildings/medieval/dedicatedTanneryProfile";
import { DETACHED_BAKEHOUSE } from "../../buildings/medieval/detachedBakehouseProfile";
import { ENCLOSED_GUILD_HALL } from "../../buildings/medieval/enclosedGuildHall";
import { ENCLOSED_GUILD_TRADES } from "../../buildings/medieval/enclosedGuildTrades";
import { WORKHOME_FORMS } from "../../buildings/medieval/workhomeFormProfiles";
import { WORKHOME_TRADES } from "../../buildings/medieval/workhomeTradeProfiles";
import type { LandmarkAsset } from "../types/document";
import type { BVFacilityRequest } from "./allocateBVFacilities";
import { bvFacilityAsset } from "./bvFacilityAsset";
import type { FacilityUse } from "./facilityUses";
import { medievalTradeDemand, type TradeReferenceRow } from "./medievalTradeDemand";

const PREFIX = "population-facility:";
const rows = csvParse(occupations) as unknown as TradeReferenceRow[];

/** Provisional dimensions are visible in the saved asset and replaced when a BV form is available. */
function placeholder(pool: string, width = 10, depth = 12): LandmarkAsset {
  const outer: [number, number][] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2]
  ];
  return {
    id: `${PREFIX}placeholder:${pool}`,
    revision: "1",
    name: `${pool} (provisional site)`,
    historicalPhase: "medieval",
    referenceSizeMeters: [width, depth],
    dimensionSource: "Provisional CE allocation dimensions; not a verified BV footprint",
    provenanceId: "ce-provisional",
    footprint: [{ outer, holes: [] }],
    minimumSite: [{ outer, holes: [] }],
    entrances: [{ id: "main", point: [0, depth / 2], outward: [0, 1], widthMeters: 1.4, required: true }],
    renderSvg: `<svg xmlns="http://www.w3.org/2000/svg"><rect x="${-width / 2}" y="${-depth / 2}" width="${width}" height="${depth}" fill="#e6c17a" stroke="#805d22" stroke-dasharray="2 1"/></svg>`
  };
}

export function buildPopulationFacilityRequests(population: number, options: { period: string; port: boolean }) {
  const demand = medievalTradeDemand(rows, population, {
    period: options.period,
    port: options.port
  });
  const requests: BVFacilityRequest[] = [];
  const assets = new Map<string, LandmarkAsset>();
  const cached = (key: string, build: () => LandmarkAsset) => {
    if (!assets.has(key)) assets.set(key, build());
    return assets.get(key)!;
  };
  for (const domain of demand.domains.filter(d => d.inferredHalls)) {
    const role =
      domain.domain === "glassware"
        ? "glassware-pottery"
        : domain.domain === "printing"
          ? "book-trades"
          : domain.domain;
    const asset = ENCLOSED_GUILD_TRADES.some(t => t.id === role)
      ? cached(`guild:${role}`, () =>
          bvFacilityAsset(`trade-hall.guild-enclosed.${role}`, [{ id: "main", ...ENCLOSED_GUILD_HALL.main }])
        )
      : placeholder(`guild:${role}`, 13, 10);
    requests.push({ id: `${PREFIX}guild:${domain.domain}`, asset, zone: "core", use: "commerce" });
  }
  for (const trade of demand.trades) {
    if (!trade.workshops) continue;
    const asset = cached(`workshop:${trade.pool}`, () => {
      const dry = WORKHOME_TRADES.find(t => t.id === trade.pool);
      if (dry) {
        const form = WORKHOME_FORMS[dry.form];
        return {
          ...bvFacilityAsset(`trade-workhome.${form.formId}.${trade.pool}`, [{ id: "main", ...form.main }]),
          residentialDwellings: 1
        };
      }
      if (trade.pool === "baking")
        return bvFacilityAsset("trade-workshop.dedicated-bakehouse", [{ id: "main", ...DETACHED_BAKEHOUSE.main }]);
      if (trade.pool === "smithing")
        return bvFacilityAsset("trade-workshop.dedicated-smithy", dedicatedSmithyProfile("smithy").ports.slice(0, 1));
      if (trade.pool === "cooperage")
        return bvFacilityAsset("trade-workshop.dedicated-cooperage", DEDICATED_COOPER.ports.slice(0, 1));
      if (trade.pool === "tanning")
        return bvFacilityAsset("trade-workshop.dedicated-wet-tannery", DEDICATED_TANNERY.ports);
      if (trade.pool === "ropemaking")
        return bvFacilityAsset("trade-workshop.dedicated-ropewalk", [
          { id: "main", position: [0, 0, 27], clearWidth: 1.6 }
        ]);
      if (trade.pool === "butchery")
        return bvFacilityAsset("trade-workshop.dedicated-butchery", [
          { id: "main", position: [-2, 0, 2.5], clearWidth: 1.5 }
        ]);
      const townTradeModels: Record<string, { id: string; depth: number }> = {
        chandlery: { id: "chandlery", depth: 10 },
        metalwares: { id: "metalwares", depth: 12 },
        fishmongery: { id: "fishmongery", depth: 12 },
        cutlery: { id: "cutlery", depth: 10 },
        limeAndTile: { id: "lime-tile-yard", depth: 20 },
        glazing: { id: "glaziers-workshop", depth: 10 }
      };
      const townTrade = townTradeModels[trade.pool];
      if (townTrade)
        return bvFacilityAsset(`trade-workshop.dedicated-${townTrade.id}`, [
          { id: "main", position: [0, 0, townTrade.depth / 2 - 1.2], clearWidth: 1.5 }
        ]);
      // Low-tier entrance positions follow the existing authored hall/open-shelter fronts.
      if (trade.pool === "brewing")
        return bvFacilityAsset("town-brewery", [{ id: "main", position: [-2, 0, 1.5], clearWidth: 1.1 }]);
      if (trade.pool === "pottery")
        return bvFacilityAsset("potters-workshop", [{ id: "main", position: [-2, 0, 1.5], clearWidth: 1.4 }]);
      if (trade.pool === "printing")
        return bvFacilityAsset("early-printing-workshop", [{ id: "main", position: [0, 0, 1.5], clearWidth: 1.4 }]);
      if (trade.pool === "pottery") return placeholder(trade.pool, 20, 20);
      return placeholder(trade.pool);
    });
    const outer = [
      "tanning",
      "smithing",
      "cooperage",
      "ropemaking",
      "limeAndTile",
      "pottery",
      "glazing",
      "butchery",
      "chandlery",
      "milling"
    ].includes(trade.pool);
    const use: FacilityUse =
      trade.pool === "tanning" || trade.pool === "milling"
        ? "river"
        : outer
          ? "hazard"
          : asset.residentialDwellings === 1
            ? "craft"
            : "commerce";
    for (let i = 0; i < trade.workshops; i++)
      requests.push({
        id: `${PREFIX}workshop:${trade.pool}:${i}`,
        asset,
        zone: outer ? "outskirts" : "core",
        use,
        ...(trade.pool === "tanning" || trade.pool === "milling" ? { riverbankMaxDistanceMeters: 50 } : {})
      });
  }
  return { demand, requests };
}
