import { csvParse } from "d3";
import occupations from "../../../docs/plan/medieval-urban-calibration-targets/occupations.csv?raw";
import { DEDICATED_COOPER } from "../../buildings/medieval/dedicatedCooperProfile";
import { DEDICATED_TANNERY } from "../../buildings/medieval/dedicatedTanneryProfile";
import { DETACHED_BAKEHOUSE } from "../../buildings/medieval/detachedBakehouseProfile";
import { ENCLOSED_GUILD_HALL } from "../../buildings/medieval/enclosedGuildHall";
import { ENCLOSED_GUILD_TRADES } from "../../buildings/medieval/enclosedGuildTrades";
import { HORSE_MILL } from "../../buildings/medieval/horseMill";
import {
  opusGuildHouseLayout,
  opusGuildHouseModelId,
  opusGuildHousePreset
} from "../../buildings/medieval/opusGuildHouseProfiles";
import {
  OPUS_BUTCHERY,
  OPUS_ROPEWALK,
  OPUS_SMITHY,
  OPUS_TOWN_TRADES,
  type OpusTownTrade
} from "../../buildings/medieval/opusTradeProfiles";
import {
  type OpusWorkhomeCulture,
  opusWorkhomeLayout,
  opusWorkhomePreset
} from "../../buildings/medieval/opusWorkhomeProfiles";
import { WORKHOME_FORMS } from "../../buildings/medieval/workhomeFormProfiles";
import { WORKHOME_TRADES } from "../../buildings/medieval/workhomeTradeProfiles";
import type { LandmarkAsset } from "../types/document";
import type { BVFacilityRequest } from "./allocateBVFacilities";
import { bvFacilityAsset } from "./bvFacilityAsset";
import type { FacilityUse } from "./facilityUses";
import { guildHallPlan, type PlannedGuildHall } from "./guildHallPlan";
import { medievalTradeDemand, type TradeReferenceRow } from "./medievalTradeDemand";

const PREFIX = "population-facility:";
/** Practitioners (masters, journeymen, apprentices) one facility of a pool holds where it is not a one-family
 * workshop of 2.5: a bakehouse or brewhouse ran with five or six hands, and the butchers sold from the stalls of a
 * shared meat hall (the shambles) rather than from a hall each. A wet tanyard kept its three stations (liming and
 * bark vats, fleshing beam, drying frames; the dedicated tannery model's workplaces) manned under a master, four
 * hands to the yard (tanners' row plan T1a). */
const PRACTITIONERS_PER_FACILITY: Record<string, number> = { baking: 5, brewing: 6, butchery: 15, tanning: 4 };
/** Hands of one butcher's shop where each keeps his own (a master, a journeyman and an apprentice; provisional). */
const BUTCHER_SHOP_HANDS = 3;
/** Pools whose facility is a smaller BV model than the trade's default. */
const BREWHOUSE_MODEL = "ale-brewhouse";
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

/**
 * The facilities a town of this size needs. `culture` sets its guild halls by its housing culture (plan
 * bv-workhome-facade-variation.md §6.1 W5a); without one, as the mesh editor still does, every guild has its hall.
 */
export function buildPopulationFacilityRequests(
  population: number,
  options: {
    period: string;
    port: boolean;
    culture?: OpusWorkhomeCulture;
    /** The town lays burgage plots: each butcher keeps his own shop in the Butcher Row, his slaughter shed behind it
     * (docs/plan/ce-town-trade-rear-works.md R3, §10.8), rather than a butchers' hall for several. */
    plots?: boolean;
  }
) {
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
  const chapters = demand.domains.filter(d => d.inferredHalls),
    halls: PlannedGuildHall[] = options.culture
      ? guildHallPlan(options.culture, population, chapters)
      : chapters.map(d => ({ kind: "craft", domains: [d.domain] }));
  for (const hall of halls) {
    const domain = hall.domains[0] ?? "textiles",
      role = domain === "glassware" ? "glassware-pottery" : domain === "printing" ? "book-trades" : domain;
    const known = ENCLOSED_GUILD_TRADES.find(t => t.id === role)?.id;
    // A German-style guild house is a town house in the row (plan W5b); the other halls stand on their own.
    const asset = !known
      ? placeholder(`guild:${role}`, 13, 10)
      : hall.kind === "zunft"
        ? cached(`guild-house:${known}`, () =>
            bvFacilityAsset(opusGuildHouseModelId(known), [opusGuildHouseLayout(opusGuildHousePreset(known)).entrance])
          )
        : cached(`guild:${known}`, () =>
            bvFacilityAsset(`trade-hall.guild-enclosed.${known}`, [{ id: "main", ...ENCLOSED_GUILD_HALL.main }])
          );
    requests.push({
      id: `${PREFIX}guild:${hall.kind === "town" ? "town" : domain}`,
      asset,
      zone: "core",
      use: "commerce"
    });
  }
  for (const trade of demand.trades) {
    const per =
        options.plots && trade.pool === "butchery" ? BUTCHER_SHOP_HANDS : PRACTITIONERS_PER_FACILITY[trade.pool],
      facilities = per ? (trade.workshops ? Math.max(1, Math.round(trade.practitioners / per)) : 0) : trade.workshops;
    if (!facilities) continue;
    const asset = cached(`workshop:${trade.pool}`, () => {
      const dry = WORKHOME_TRADES.find(t => t.id === trade.pool);
      if (dry) {
        // The Opus shop-house's street door on its Codex envelope (docs/plan/bv-workhome-facade-variation.md W3).
        const form = WORKHOME_FORMS[dry.form],
          door = opusWorkhomeLayout(opusWorkhomePreset(dry.id, dry.form)).entrance;
        return {
          ...bvFacilityAsset(`trade-workhome.${form.formId}.${trade.pool}`, [door]),
          residentialDwellings: 1
        };
      }
      if (trade.pool === "baking")
        return bvFacilityAsset("trade-workshop.dedicated-bakehouse", [{ id: "main", ...DETACHED_BAKEHOUSE.main }]);
      if (trade.pool === "smithing") return bvFacilityAsset("trade-workshop.dedicated-smithy", [OPUS_SMITHY.entrance]);
      if (trade.pool === "cooperage")
        return bvFacilityAsset("trade-workshop.dedicated-cooperage", DEDICATED_COOPER.ports.slice(0, 1));
      if (trade.pool === "tanning")
        return bvFacilityAsset("trade-workshop.dedicated-wet-tannery", DEDICATED_TANNERY.ports);
      if (trade.pool === "ropemaking")
        return bvFacilityAsset("trade-workshop.dedicated-ropewalk", [OPUS_ROPEWALK.entrance]);
      // Entrances follow the adopted Opus plots: the shop door on the street front.
      if (trade.pool === "butchery")
        return bvFacilityAsset("trade-workshop.dedicated-butchery", [OPUS_BUTCHERY.entrance]);
      const townTradeModels: Record<string, OpusTownTrade> = {
        chandlery: "chandlery",
        metalwares: "metalwares",
        fishmongery: "fishmongery",
        cutlery: "cutlery",
        limeAndTile: "lime-tile-yard",
        glazing: "glaziers-workshop"
      };
      const townTrade = townTradeModels[trade.pool];
      if (townTrade)
        return bvFacilityAsset(`trade-workshop.dedicated-${townTrade}`, [OPUS_TOWN_TRADES[townTrade].entrance]);
      // Low-tier entrance positions follow the existing authored hall/open-shelter fronts.
      if (trade.pool === "brewing")
        return bvFacilityAsset(BREWHOUSE_MODEL, [{ id: "main", position: [-2, 0, 1.5], clearWidth: 1.1 }]);
      if (trade.pool === "pottery")
        return bvFacilityAsset("potters-workshop", [{ id: "main", position: [-2, 0, 1.5], clearWidth: 1.4 }]);
      if (trade.pool === "printing")
        return bvFacilityAsset("early-printing-workshop", [{ id: "main", position: [0, 0, 1.5], clearWidth: 1.4 }]);
      if (trade.pool === "milling")
        return bvFacilityAsset("trade-workshop.dedicated-horse-mill", [{ id: "main", ...HORSE_MILL.main }]);
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
      "chandlery",
      "milling"
    ].includes(trade.pool);
    const use: FacilityUse =
      trade.pool === "tanning" ? "river" : outer ? "hazard" : asset.residentialDwellings === 1 ? "craft" : "commerce";
    for (let i = 0; i < facilities; i++)
      requests.push({
        id: `${PREFIX}workshop:${trade.pool}:${i}`,
        asset,
        zone: outer ? "outskirts" : "core",
        use,
        ...(trade.pool === "tanning" ? { riverbankMaxDistanceMeters: 50 } : {})
      });
  }
  return { demand, requests };
}
