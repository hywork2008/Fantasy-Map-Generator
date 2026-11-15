/**
 * Derived tables for docs/analytics/economy-start-20261102.md from the economystart.mts outputs.
 *
 *   npx tsx docs/analytics/economy-start-20261102/analyze.mts <out.json> <obs-*.json...>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const [out, ...inputs] = process.argv.slice(2);
const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.toSorted((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

function sizeBand(people: number) {
  if (people >= 10000) return "a:10k+";
  if (people >= 3000) return "b:3k-10k";
  if (people >= 1000) return "c:1k-3k";
  return "d:<1k";
}
function classOf(b: any) {
  if (b.capital) return "capital";
  if (b.marketCenter) return "marketCenter";
  if (b.port) return "port";
  if (b.river) return "river";
  return "inland";
}

const report: Record<string, any> = {};
for (const file of inputs) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const map = basename(file, ".json");
  const snaps = data.snapshots as any[];
  const first = snaps[0];
  const byId0 = new Map(first.burgs.map((b: any) => [b.i, b]));
  const result: Record<string, any> = { burgs: first.burgs.length, markets: first.markets.length };

  // 1. Timeline of world-level counts
  result.timeline = snaps.map(s => {
    const B = s.burgs as any[];
    const chapterKeys = new Set(s.chapters.map((c: any) => `${c.burgId}:${c.domain}`));
    const emptyHalls = B.flatMap(b => b.guilds.filter((g: any) => g.chapter !== null && g.people === 0)).length;
    const informal = B.flatMap(b => b.guilds.filter((g: any) => g.chapter === null && g.people > 0)).length;
    const craftPeople = sum(B.map(b => b.employment?.craft ?? 0));
    const guildPeople = sum(B.flatMap(b => b.guilds.map((g: any) => g.people)));
    const people = sum(B.map(b => b.people));
    const corridors = s.corridors as any[];
    const modes = { land: 0, river: 0, sea: 0 };
    for (const c of corridors) for (const m of ["land", "river", "sea"] as const) modes[m] += c.byMode[m];
    const total = modes.land + modes.river + modes.sea || 1;
    const genericCe = B.filter(b => b.ce && b.ce.craftSlots.generic === 21).length;
    const withPartners = B.filter(b => b.site?.partners.length).length;
    return {
      month: s.month,
      year: s.year,
      urbanPeople: people,
      chapters: chapterKeys.size,
      emptyHalls,
      informalWithPeople: informal,
      craftPeoplePer1000: r1((craftPeople / people) * 1000),
      guildPeoplePer1000: r1((guildPeople / people) * 1000),
      corridors: corridors.length,
      modeShare: { land: r3(modes.land / total), river: r3(modes.river / total), sea: r3(modes.sea / total) },
      burgsWithPartners: withPartners,
      ceGenericCraftOnly: genericCe
    };
  });

  // 2. Chapters by domain over time, and chapter churn vs month 0
  const chapterSet = (s: any) => new Set(s.chapters.map((c: any) => `${c.burgId}:${c.domain}`));
  const set0 = chapterSet(first);
  result.chapterDomains = snaps.map(s => {
    const counts: Record<string, number> = {};
    for (const c of s.chapters) counts[c.domain] = (counts[c.domain] ?? 0) + 1;
    const set = chapterSet(s);
    return {
      month: s.month,
      counts,
      keptFromStart: [...set0].filter(k => set.has(k)).length,
      newSinceStart: [...set].filter(k => !set0.has(k)).length
    };
  });

  // 3. Industry by initial attributes (month 0 classes, observed at the first and last snapshot)
  const industry = (s: any) => {
    const groups = new Map<string, { n: number; people: number; craft: number; goods: Record<string, number>; guilds: Record<string, number> }>();
    for (const b of s.burgs) {
      const b0: any = byId0.get(b.i) ?? b;
      for (const key of [`class:${classOf(b0)}`, `size:${sizeBand(b0.people)}`, `biome:${b0.biome}`]) {
        const g = groups.get(key) ?? { n: 0, people: 0, craft: 0, goods: {}, guilds: {} };
        g.n++;
        g.people += b.people;
        g.craft += b.employment?.craft ?? 0;
        for (const [good, units] of Object.entries(b.production as Record<string, number>)) {
          // Share of burgs in the group making the good: units of different goods do not add up.
          if (!good.endsWith("*")) continue;
          if (units > 0) g.goods[good.slice(0, -1)] = (g.goods[good.slice(0, -1)] ?? 0) + 1;
        }
        for (const guild of b.guilds) if (guild.people > 0) g.guilds[guild.domain] = (g.guilds[guild.domain] ?? 0) + guild.people;
        groups.set(key, g);
      }
    }
    return Object.fromEntries(
      [...groups]
        .toSorted((a, b) => a[0].localeCompare(b[0]))
        .map(([key, g]) => {
          const guildTotal = sum(Object.values(g.guilds)) || 1;
          return [
            key,
            {
              n: g.n,
              craftPer1000: r1((g.craft / Math.max(1, g.people)) * 1000),
              topGoods: Object.entries(g.goods)
                .toSorted((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([k, v]) => `${k} ${Math.round((v / g.n) * 100)}%`),
              guildPeopleShare: Object.fromEntries(
                Object.entries(g.guilds)
                  .toSorted((a, b) => b[1] - a[1])
                  .map(([k, v]) => [k, Math.round((v / guildTotal) * 100)])
              )
            }
          ];
        })
    );
  };
  result.industryStart = industry(first);
  result.industryEnd = industry(snaps.at(-1));

  // 4. Capitals: administration against adults, craft against city size
  result.capitals = first.burgs
    .filter((b: any) => b.capital && b.employment)
    .map((b: any) => {
      const end = snaps.at(-1).burgs.find((x: any) => x.i === b.i);
      return {
        i: b.i,
        people: b.people,
        adults: b.employment.adults,
        admin: b.employment.admin,
        adminShare: r3(b.employment.admin / Math.max(1, b.employment.adults)),
        craftStart: b.employment.craft,
        craftEnd: end?.employment?.craft ?? null,
        peopleEnd: end?.people ?? null
      };
    })
    .toSorted((a: any, b: any) => b.people - a.people);
  const nonCapitals = (s: any) => s.burgs.filter((b: any) => !b.capital && b.people >= 3000 && b.employment);
  result.craftPer1000ByCapital = snaps.map(s => ({
    month: s.month,
    capitals: r1(median(s.burgs.filter((b: any) => b.capital && b.employment).map((b: any) => (b.employment.craft / b.people) * 1000))),
    nonCapitals3kPlus: r1(median(nonCapitals(s).map((b: any) => (b.employment.craft / b.people) * 1000)))
  }));

  // 5. Trade pairs: attributes of the two ends (last snapshot)
  const last = snaps.at(-1);
  const byIdLast = new Map(last.burgs.map((b: any) => [b.i, b]));
  const pairs = (last.corridors as any[])
    .map(c => ({ c, a: byIdLast.get(c.a) as any, b: byIdLast.get(c.b) as any }))
    .filter(p => p.a && p.b);
  const pairKind = (p: any) => {
    const sameState = p.a.state === p.b.state;
    const sameMarket = p.a.market === p.b.market;
    return sameMarket ? "sameMarket" : sameState ? "sameState" : "foreign";
  };
  const tradeGroups = new Map<string, { n: number; slots: number; dist: number[]; ratio: number[]; goods: Record<string, number>; modes: Record<string, number> }>();
  for (const p of pairs) {
    const key = pairKind(p);
    const g = tradeGroups.get(key) ?? { n: 0, slots: 0, dist: [], ratio: [], goods: {}, modes: { land: 0, river: 0, sea: 0 } };
    g.n++;
    g.slots += p.c.slots;
    g.dist.push(Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y));
    g.ratio.push(Math.max(p.a.people, p.b.people) / Math.max(1, Math.min(p.a.people, p.b.people)));
    for (const [good, v] of Object.entries(p.c.goods as Record<string, number>)) g.goods[good] = (g.goods[good] ?? 0) + v;
    for (const m of ["land", "river", "sea"]) g.modes[m] += p.c.byMode[m];
    tradeGroups.set(key, g);
  }
  result.tradePairs = Object.fromEntries(
    [...tradeGroups].map(([key, g]) => {
      const goodTotal = sum(Object.values(g.goods)) || 1;
      const modeTotal = sum(Object.values(g.modes)) || 1;
      return [
        key,
        {
          pairs: g.n,
          slotShare: r3(g.slots / Math.max(1, sum(pairs.map(p => p.c.slots)))),
          medianDistance: r1(median(g.dist)),
          medianPopRatio: r1(median(g.ratio)),
          modes: Object.fromEntries(Object.entries(g.modes).map(([k, v]) => [k, r3(v / modeTotal)])),
          topGoods: Object.entries(g.goods)
            .toSorted((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([k, v]) => `${k} ${Math.round((v / goodTotal) * 100)}%`)
        }
      ];
    })
  );
  // Which burgs end up as trade hubs (by partner slots), by start class
  const slotsByBurg = new Map<number, number>();
  for (const p of pairs) {
    slotsByBurg.set(p.a.i, (slotsByBurg.get(p.a.i) ?? 0) + p.c.slots);
    slotsByBurg.set(p.b.i, (slotsByBurg.get(p.b.i) ?? 0) + p.c.slots);
  }
  const hubClass: Record<string, { n: number; slots: number }> = {};
  for (const b of first.burgs) {
    const key = classOf(b);
    hubClass[key] ??= { n: 0, slots: 0 };
    hubClass[key].n++;
    hubClass[key].slots += slotsByBurg.get(b.i) ?? 0;
  }
  result.tradeSlotsPerBurgByClass = Object.fromEntries(Object.entries(hubClass).map(([k, v]) => [k, r1(v.slots / v.n)]));

  // 6. CE hand-off stability: month 0 profile vs month 12 and last
  const ceOf = (s: any) => new Map(s.burgs.map((b: any) => [b.i, b]));
  const compareCe = (later: any) => {
    const m = ceOf(later);
    let n = 0;
    let hallLost = 0;
    let hallGained = 0;
    let dominantChanged = 0;
    let partnersAt0 = 0;
    let partnersLater = 0;
    let storageAt0 = 0;
    let storageLater = 0;
    for (const b0 of first.burgs) {
      const b1: any = m.get(b0.i);
      if (!b0.ce || !b1?.ce) continue;
      n++;
      const halls0 = new Set(b0.ce.facilities.filter((f: any) => f.hall).map((f: any) => f.domain));
      const halls1 = new Set(b1.ce.facilities.filter((f: any) => f.hall).map((f: any) => f.domain));
      hallLost += [...halls0].filter(d => !halls1.has(d)).length;
      hallGained += [...halls1].filter(d => !halls0.has(d)).length;
      const dominant = (ce: any) => Object.entries(ce.craftSlots as Record<string, number>).toSorted((a, b) => b[1] - a[1])[0]?.[0];
      if (dominant(b0.ce) !== dominant(b1.ce)) dominantChanged++;
      partnersAt0 += b0.site.partners.length;
      partnersLater += b1.site.partners.length;
      storageAt0 += b0.site.storage.length;
      storageLater += b1.site.storage.length;
    }
    return {
      month: later.month,
      burgs: n,
      hallsLost: hallLost,
      hallsGained: hallGained,
      dominantCraftChanged: dominantChanged,
      meanPartners: { start: r1(partnersAt0 / n), later: r1(partnersLater / n) },
      meanStorageYards: { start: r1(storageAt0 / n), later: r1(storageLater / n) }
    };
  };
  result.ceStability = snaps.slice(1).map(compareCe);
  const halls0 = first.burgs.flatMap((b: any) => (b.ce?.facilities ?? []).filter((f: any) => f.hall));
  result.ceHallsAtStart = { halls: halls0.length, withoutWorkshop: halls0.filter((f: any) => f.workshopWeight === 0).length };
  report[map] = result;
}
writeFileSync(out, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1).slice(0, 4000));
