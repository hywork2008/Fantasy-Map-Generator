/**
 * Economy start observation (docs/analytics/economy-start-20261102.md).
 * Per live burg at each checkpoint: map attributes, employment, production, guilds, trade partners
 * and the City Editor hand-off (BurgSiteEconomy + the ward mix / guild facilities CE derives from it).
 *
 *   npx tsx docs/analytics/economy-start-20261102/economystart.mts <map.fmg> <out.json> [months=0,1,6,12,24,36,48,60]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { advanceWorld, createNodeSimulationHost } from "../../../src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "../../../scripts/lib/conflictAutonomyFromEnv.mts";
import {
  getCraftDomainEmploymentRecords,
  getGuildChapters,
  getGuildKnowledgeStocks
} from "../../../src/extensions/economy/context/knowledge";
import { getSimulationYear, getWorldContext } from "../../../src/extensions/economy/context/economyApi";
import {
  getBurgProductionRecords,
  getGoods,
  getMarkets,
  getMerchantOrganizations,
  getTradeCorridors
} from "../../../src/extensions/economy/context/trade";
import { getBurgEmploymentComposition } from "../../../src/extensions/economy/generators/burgEmploymentComposition";
import { buildBurgSiteEconomy } from "../../../src/extensions/economy/generators/burgSiteEconomy";
import { collectGuildPractitioners } from "../../../src/extensions/economy/generators/guildKnowledge";
import {
  buildGuildChapterSuitabilityContext,
  scoreGuildChapterSuitability
} from "../../../src/extensions/economy/generators/guildChapterSuitability";
import { CRAFT_KNOWLEDGE_DOMAINS } from "../../../src/extensions/economy/generators/guildKnowledgeTypes";
import { economyWardMix } from "../../../src/city-editor/generators/economicWards";
import { planGuildFacilities } from "../../../src/city-editor/generators/guildFacilities";

const [input, output, monthsArg = "0,1,6,12,24,36,48,60"] = process.argv.slice(2);
const checkpoints = monthsArg.split(",").map(Number);
const r2 = (v: number) => Math.round(v * 100) / 100;

const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();

function snapshot(month: number) {
  const world = getWorldContext();
  const { pack } = world;
  const { cells } = pack;
  const rate = Math.max(1, world.populationRate ?? 1);
  const goods = new Map(getGoods().map(g => [g.i, g]));
  const goodName = (id: number) => goods.get(id)?.name ?? String(id);
  const markets = getMarkets();
  const marketCenters = new Set(markets.map(m => m.centerBurgId));
  const practitioners = collectGuildPractitioners();
  const craftDomain = getCraftDomainEmploymentRecords();
  const chapters = getGuildChapters();
  const stocks = getGuildKnowledgeStocks();
  const suitability = buildGuildChapterSuitabilityContext();
  const orgs = getMerchantOrganizations();
  const live = (pack.burgs as any[]).filter(b => b?.i && !b.removed);

  const burgs = live.map(b => {
    const cell = b.cell;
    const production: Record<string, number> = {};
    let deals = 0;
    for (const record of getBurgProductionRecords(b) as any[]) {
      if ("dealId" in record) deals++;
      else {
        const key = `${goodName(record.goodId)}${record.recipe ? "*" : ""}`;
        production[key] = r2((production[key] ?? 0) + record.units);
      }
    }
    const comp = getBurgEmploymentComposition(b.i);
    const site = buildBurgSiteEconomy(b.i);
    const guilds = CRAFT_KNOWLEDGE_DOMAINS.map(domain => {
      const p = practitioners.get(`${b.i}:${domain}`)?.workers ?? 0;
      const craft = craftDomain.filter(r => r.burgId === b.i && r.domain === domain).reduce((s, r) => s + r.workers, 0);
      const stock = stocks.find(s => s.burgId === b.i && s.domain === domain);
      const chapter = chapters.find(c => c.burgId === b.i && c.domain === domain);
      return {
        domain,
        people: Math.round(p * rate),
        craftPeople: Math.round(craft * rate),
        stock: stock ? r2(stock.stock * 1000) / 1000 : 0,
        treasury: stock ? r2(stock.treasury) : 0,
        chapter: chapter ? chapter.foundedYear : null,
        suit: r2(scoreGuildChapterSuitability(b.i, domain, suitability))
      };
    }).filter(g => g.people > 0 || g.stock > 0 || g.chapter !== null || g.suit >= 0.2);
    const wardMix = site ? economyWardMix(site) : null;
    const craftSlots: Record<string, number> = {};
    for (const slot of wardMix ?? []) if (slot.kind === "craftsmen") craftSlots[slot.craftDomain ?? "generic"] = (craftSlots[slot.craftDomain ?? "generic"] ?? 0) + 1;
    return {
      i: b.i,
      name: b.name,
      pop: r2(b.population),
      people: Math.round(b.population * rate),
      state: b.state,
      culture: pack.cultures?.[b.culture]?.name,
      cultureBase: pack.cultures?.[b.culture]?.base,
      type: b.type,
      capital: Boolean(b.capital),
      port: Boolean(b.port),
      walls: Boolean(b.walls),
      citadel: Boolean(b.citadel),
      plaza: Boolean(b.plaza),
      temple: Boolean(b.temple),
      biome: (world.biomesData as any)?.name?.[(cells as any).biomeCode?.[cell]],
      height: cells.h[cell],
      river: Boolean(cells.r?.[cell]),
      flux: cells.fl?.[cell] ?? 0,
      market: b.market,
      marketCenter: marketCenters.has(b.i),
      x: r2(b.x),
      y: r2(b.y),
      merchantHouse: orgs.find(o => o.homeBurgId === b.i)?.scale ?? null,
      employment: comp && {
        adults: Math.round(comp.adults * rate),
        market: Math.round(comp.marketLaborForce * rate),
        admin: Math.round(comp.administration * rate),
        mining: Math.round(comp.mining * rate),
        smelting: Math.round(comp.smelting * rate),
        quarrying: Math.round(comp.quarrying * rate),
        construction: Math.round(comp.construction * rate),
        trade: Math.round(comp.trade * rate),
        strategic: Math.round(comp.strategicIndustry * rate),
        craft: Math.round(comp.craft * rate),
        assigned: Math.round(comp.assignedMarket * rate)
      },
      deals,
      production,
      guilds,
      site: site && {
        commerceRank: site.commerce.rank,
        mint: site.commerce.mint,
        guilds: site.guilds,
        storage: site.storage.map(s => ({ form: s.form, areaM2: Math.round(s.areaM2), goods: s.mainGoods, waterborne: s.waterborne })),
        facilities: site.facilities,
        partners: site.tradePartners.map(p => ({ burgId: p.burgId, slots: r2(p.annualSlots), mode: p.mode, goods: p.mainGoods })),
        mills: site.mills,
        portWarehouse: site.portWarehouse && { slots: site.portWarehouse.capacitySlots, layout: site.portWarehouse.layout, goods: site.portWarehouse.mainGoods }
      },
      ce: wardMix && {
        craftSlots,
        merchantSlots: wardMix.filter(s => s.kind === "merchant").length,
        facilities: site ? planGuildFacilities(site, "highMedieval").map(f => ({ domain: f.domain, hall: f.hall, workshopWeight: f.workshopWeight, ancillary: f.ancillary })) : []
      }
    };
  });

  const corridors = getTradeCorridors().map(c => ({
    a: c.burgA,
    b: c.burgB,
    departures: r2(c.departures),
    slots: r2(c.cargoSlots),
    value: r2(c.value),
    byMode: { land: r2(c.byMode.land), river: r2(c.byMode.river), sea: r2(c.byMode.sea) },
    days: r2(c.meanTravelDays),
    goods: Object.fromEntries(
      Object.entries(c.goodsSlots)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 8)
        .map(([id, v]) => [goodName(Number(id)), r2(v)])
    )
  }));
  return {
    month,
    year: getSimulationYear(),
    markets: markets.map(m => ({ i: m.i, center: m.centerBurgId })),
    chapters: chapters.map(c => ({ burgId: c.burgId, domain: c.domain, foundedYear: c.foundedYear, suitability: r2(c.suitability) })),
    corridors,
    burgs
  };
}

const result: { input: string; populationRate: number; snapshots: unknown[] } = {
  input,
  populationRate: getWorldContext().populationRate ?? 1,
  snapshots: []
};
let month = 0;
for (const target of checkpoints) {
  if (target > month) {
    await advanceWorld(host, { months: target - month });
    month = target;
  }
  result.snapshots.push(snapshot(month));
  process.stderr.write(`[economy-start] ${input} month ${month}\n`);
  writeFileSync(output, JSON.stringify(result));
}
host.dispose();
