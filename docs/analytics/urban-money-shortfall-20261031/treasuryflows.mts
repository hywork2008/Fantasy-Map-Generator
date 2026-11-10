/**
 * Market treasury money by channel: every change of marketTreasury.balance, classified by the calling
 * module, summed per Market and year, plus year-end balance, grain IOU and Salt payables; the saltworks
 * list (market, state, owner) at the end. Read-only apart from the property hook.
 * Usage: treasuryflows.mts <archive.fmg> <output.json> [months]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { getMarkets } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/trade";
import { getWorldContext } from "/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/economyApi";
import { advanceWorld, createNodeSimulationHost } from "/Users/h-yamaguchi/Projects/fmg-2/src/simulation/adapters/node";
import { applyConflictAutonomyFromEnv } from "/Users/h-yamaguchi/Projects/fmg-2/scripts/lib/conflictAutonomyFromEnv.mts";

const [input, output, length = "36"] = process.argv.slice(2);
const months = Number(length);
const host = createNodeSimulationHost();
await host.loadArchive(new Uint8Array(readFileSync(input)));
await host.prepare();
applyConflictAutonomyFromEnv();

let flows: Record<number, Record<string, number>> = {};
const years: unknown[] = [];

function channel(): string {
  const frames = (new Error().stack ?? "").split("\n").slice(1);
  for (const frame of frames) {
    const file = frame.match(/([A-Za-z0-9_-]+)\.m?ts/)?.[1];
    const fn = frame.match(/at (?:[A-Za-z0-9_$]+\.)?([A-Za-z0-9_$]+) /)?.[1];
    if (!file || file === "treasuryflows" || fn === "set" || fn === "creditMarket") continue;
    return fn ? `${file}.${fn}` : file;
  }
  return "unknown";
}

function wrap(marketId: number, t: any): any {
  if (!t || t.__wrapped) return t;
  let balance = t.balance ?? 0;
  Object.defineProperty(t, "__wrapped", { value: true, enumerable: false });
  Object.defineProperty(t, "balance", {
    enumerable: true,
    configurable: true,
    get: () => balance,
    set: (v: number) => {
      const d = v - balance;
      if (d) {
        const row = (flows[marketId] ??= {});
        const k = `${d >= 0 ? "+" : "-"} ${channel()}`;
        row[k] = (row[k] ?? 0) + d;
      }
      balance = v;
    }
  });
  return t;
}

function hook(): void {
  for (const m of getMarkets() as any[]) {
    const desc = Object.getOwnPropertyDescriptor(m, "marketTreasury");
    if (desc?.set) { wrap(m.i, m.marketTreasury); continue; }
    let t = wrap(m.i, m.marketTreasury);
    Object.defineProperty(m, "marketTreasury", {
      enumerable: true,
      configurable: true,
      get: () => t,
      set: v => { t = wrap(m.i, v); }
    });
  }
}

function snapshot() {
  const out: Record<number, unknown> = {};
  for (const m of getMarkets() as any[]) {
    const t = m.marketTreasury ?? {};
    out[m.i] = {
      balance: Math.round(t.balance ?? 0),
      grainPayable: Math.round(t.ruralGrainPayable ?? 0),
      saltPayables: Math.round(Object.values(t.saltPayables ?? {}).reduce((s: number, v: any) => s + Math.max(0, v), 0)),
      ruralPurse: Math.round(m.foodLedger?.ruralHouseholdWealth ?? 0)
    };
  }
  return out;
}

const world = getWorldContext();
let start = snapshot();
for (let m = 1; m <= months; m++) {
  hook();
  await advanceWorld(host, { months: 1 });
  if (m % 12 === 0 || m === months) {
    years.push({ month: m, start, end: snapshot(), flows });
    flows = {};
    start = snapshot();
  }
}
const saltworks = (await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/context/industry")).getSaltworks() as any[];
const marketCell = (await import("/Users/h-yamaguchi/Projects/fmg-2/src/extensions/economy/economyContext")).getMarketCellColumn();
const works = saltworks.map((w: any) => ({ i: w.i, cell: w.cellId, market: marketCell[w.cellId], state: w.stateId, owner: w.owner, wholesale: w.monthlyWholesaleReceived, wages: w.monthlyWagesPaid }));
const states = world.pack.states.filter((s: any) => s?.i && !s.removed).map((s: any) => ({ i: s.i, treasury: Math.round(s.treasury ?? 0) }));
writeFileSync(output, JSON.stringify({ months, years, saltworks: works, states }));
host.dispose();
