#!/usr/bin/env tsx
/**
 * Character wealth diagnostic — stipend / held-money balance check.
 *
 * Surfaces the inversion discussed in balance review: guild apprentices (often
 * ages 12–17) holding multi-gold purses while field commanders sit on a few
 * silver or copper pieces. All stipend rates in characterStipends.ts /
 * treasuryAllocation.ts are still placeholders; this script measures the live
 * (or saved) distribution so a rebalance has a baseline.
 *
 * ## Usage
 *
 *   # From a saved .map / characters JSON / pack export
 *   npx tsx scripts/diagnoseCharacterWealth.ts path/to/file
 *   npm run diagnose:wealth -- path/to/file
 *
 *   # Write machine-readable outputs next to the report
 *   npx tsx scripts/diagnoseCharacterWealth.ts path/to/file --json out.json --csv out.csv
 *
 *   # Print a pasteable browser-console snippet (live map, no file)
 *   npx tsx scripts/diagnoseCharacterWealth.ts --browser
 *
 * ## Input shapes accepted
 *
 * - Legacy `.map` text (CRLF lines; characters = JSON at index 45)
 * - `temp/debug/map/45_characters.json` style array
 * - Full object with `pack.characters`
 * - Plain `Character[]` or `{ [id]: Character }`
 * - Live browser: `window.fmg.world.pack.characters` via `--browser` snippet
 *
 * Internal wealth is silver-piece units. Display coinage defaults to 1🟡=12⚪,
 * 1⚪=12🟤 (same as DEFAULT_CURRENCY_RATES).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types (minimal; keep the script free of app module imports) ─────────────

interface TitleHolding {
  title: string;
  landed: boolean;
  entityType: "state" | "province";
  entityId: number;
  endYear?: number;
}

interface CharacterRole {
  source: string;
  kind: string;
  entityType: string;
  entityId: number;
  label: string;
  endYear?: number;
  organizationId?: number;
  domain?: string;
}

interface CharacterLike {
  i: number;
  name: string;
  age: number;
  gender?: string;
  titles?: TitleHolding[];
  roles?: CharacterRole[];
  wealth?: number;
  dead?: boolean;
  state?: number;
  location?: number;
}

type PaidBucket =
  | "ruler"
  | "centralOffice"
  | "fieldCommander"
  | "provinceLord"
  | "guildMaster"
  | "guildApprentice"
  | "marketManager"
  | "marketRival"
  | "merchantOrgHead"
  | "otherRole"
  | "noPaidRole";

const BUCKET_ORDER: readonly PaidBucket[] = [
  "ruler",
  "centralOffice",
  "fieldCommander",
  "provinceLord",
  "guildMaster",
  "guildApprentice",
  "marketManager",
  "marketRival",
  "merchantOrgHead",
  "otherRole",
  "noPaidRole"
];

const BUCKET_LABEL: Record<PaidBucket, string> = {
  ruler: "Ruler (landed state)",
  centralOffice: "Central office",
  fieldCommander: "Field commander",
  provinceLord: "Province lord",
  guildMaster: "Guild master",
  guildApprentice: "Guild apprentice",
  marketManager: "Market manager",
  marketRival: "Market rival",
  merchantOrgHead: "Merchant org head",
  otherRole: "Other active role",
  noPaidRole: "No paid role"
};

/** Rank for primary-bucket assignment (lower = higher priority). */
const BUCKET_RANK: Record<PaidBucket, number> = {
  ruler: 0,
  centralOffice: 1,
  fieldCommander: 2,
  provinceLord: 3,
  guildMaster: 4,
  guildApprentice: 5,
  marketManager: 6,
  marketRival: 7,
  merchantOrgHead: 8,
  otherRole: 9,
  noPaidRole: 10
};

const CENTRAL_OFFICE_TITLES = new Set([
  "Chancellor",
  "Marshal",
  "Steward",
  "Spymaster",
  "Court Chaplain",
  "Prime Minister",
  "Minister of Foreign Affairs",
  "Minister of War",
  "Minister of Finance",
  "Director of Intelligence"
]);

const FIELD_COMMANDER_TITLES = new Set(["Commander", "Admiral"]);

const GOLD_TO_SILVER = 12;
const SILVER_TO_COPPER = 12;

// ─── Stats helpers ───────────────────────────────────────────────────────────

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  if (next === undefined) return sorted[base];
  return sorted[base] + rest * (next - sorted[base]);
}

interface WealthStats {
  count: number;
  dead: number;
  withWealthField: number;
  zero: number;
  positive: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  mean: number;
  sum: number;
  ageMin: number;
  ageMedian: number;
  ageMax: number;
  ageUnder18: number;
}

function emptyStats(): WealthStats {
  return {
    count: 0,
    dead: 0,
    withWealthField: 0,
    zero: 0,
    positive: 0,
    min: 0,
    p25: 0,
    median: 0,
    p75: 0,
    max: 0,
    mean: 0,
    sum: 0,
    ageMin: 0,
    ageMedian: 0,
    ageMax: 0,
    ageUnder18: 0
  };
}

function computeStats(rows: CharacterRow[]): WealthStats {
  const stats = emptyStats();
  stats.count = rows.length;
  if (!rows.length) return stats;

  const living = rows.filter(r => !r.dead);
  const wealths = living.map(r => r.wealth).sort((a, b) => a - b);
  const ages = living.map(r => r.age).sort((a, b) => a - b);

  stats.dead = rows.length - living.length;
  stats.withWealthField = living.filter(r => r.hasWealthField).length;
  stats.zero = wealths.filter(w => w === 0).length;
  stats.positive = wealths.filter(w => w > 0).length;
  stats.min = wealths[0] ?? 0;
  stats.p25 = quantile(wealths, 0.25);
  stats.median = quantile(wealths, 0.5);
  stats.p75 = quantile(wealths, 0.75);
  stats.max = wealths[wealths.length - 1] ?? 0;
  stats.sum = wealths.reduce((a, b) => a + b, 0);
  stats.mean = wealths.length ? stats.sum / wealths.length : 0;
  stats.ageMin = ages[0] ?? 0;
  stats.ageMedian = quantile(ages, 0.5);
  stats.ageMax = ages[ages.length - 1] ?? 0;
  stats.ageUnder18 = living.filter(r => r.age < 18).length;
  return stats;
}

function formatCoin(silver: number): string {
  const amount = Number.isFinite(silver) ? Math.max(0, silver) : 0;
  const totalCopper = Math.round(amount * SILVER_TO_COPPER);
  const goldToCopper = GOLD_TO_SILVER * SILVER_TO_COPPER;
  const gold = Math.floor(totalCopper / goldToCopper);
  const rem = totalCopper % goldToCopper;
  const s = Math.floor(rem / SILVER_TO_COPPER);
  const c = rem % SILVER_TO_COPPER;
  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold}G`);
  if (s > 0 || parts.length === 0) parts.push(`${s}S`);
  if (c > 0) parts.push(`${c}C`);
  return parts.join(" ");
}

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(digits);
}

function pad(s: string, w: number, right = false): string {
  if (s.length >= w) return s;
  const space = " ".repeat(w - s.length);
  return right ? space + s : s + space;
}

// ─── Classification ──────────────────────────────────────────────────────────

function activeTitles(c: CharacterLike): TitleHolding[] {
  return (c.titles ?? []).filter(t => t.endYear === undefined);
}

function activeRoles(c: CharacterLike): CharacterRole[] {
  return (c.roles ?? []).filter(r => r.endYear === undefined);
}

function classifyBuckets(c: CharacterLike): PaidBucket[] {
  const found = new Set<PaidBucket>();
  const titles = activeTitles(c);
  const roles = activeRoles(c);

  for (const t of titles) {
    if (FIELD_COMMANDER_TITLES.has(t.title)) {
      found.add("fieldCommander");
      continue;
    }
    if (CENTRAL_OFFICE_TITLES.has(t.title)) {
      found.add("centralOffice");
      continue;
    }
    if (t.entityType === "state" && t.landed) {
      found.add("ruler");
      continue;
    }
    if (t.entityType === "province") {
      found.add("provinceLord");
    }
  }

  for (const r of roles) {
    switch (r.kind) {
      case "guildMaster":
        found.add("guildMaster");
        break;
      case "guildApprentice":
        found.add("guildApprentice");
        break;
      case "marketManager":
        found.add("marketManager");
        break;
      case "marketRivalMerchant":
        found.add("marketRival");
        break;
      case "merchantOrganizationHead":
        found.add("merchantOrgHead");
        break;
      default:
        found.add("otherRole");
        break;
    }
  }

  if (!found.size) found.add("noPaidRole");
  return [...found].sort((a, b) => BUCKET_RANK[a] - BUCKET_RANK[b]);
}

function primaryBucket(buckets: PaidBucket[]): PaidBucket {
  return buckets[0] ?? "noPaidRole";
}

interface CharacterRow {
  i: number;
  name: string;
  age: number;
  dead: boolean;
  wealth: number;
  hasWealthField: boolean;
  primary: PaidBucket;
  buckets: PaidBucket[];
  titles: string[];
  roleKinds: string[];
  state?: number;
  location?: number;
}

function toRow(c: CharacterLike): CharacterRow {
  const buckets = classifyBuckets(c);
  const hasWealthField = typeof c.wealth === "number";
  return {
    i: c.i,
    name: c.name ?? `id:${c.i}`,
    age: c.age ?? 0,
    dead: Boolean(c.dead),
    wealth: hasWealthField ? c.wealth! : 0,
    hasWealthField,
    primary: primaryBucket(buckets),
    buckets,
    titles: activeTitles(c).map(t => t.title),
    roleKinds: activeRoles(c).map(r => r.kind),
    state: c.state,
    location: c.location
  };
}

// ─── Report ──────────────────────────────────────────────────────────────────

interface InversionFlag {
  id: string;
  severity: "warn" | "info";
  message: string;
}

interface DiagnosisReport {
  source: string;
  characterCount: number;
  livingCount: number;
  wealthFieldPresent: number;
  byPrimary: Record<PaidBucket, WealthStats>;
  inversions: InversionFlag[];
  richestApprentices: CharacterRow[];
  poorestCommanders: CharacterRow[];
  richestOverall: CharacterRow[];
  ageBands: Record<string, WealthStats>;
}

function ageBand(age: number): string {
  if (age < 12) return "0-11";
  if (age < 18) return "12-17";
  if (age < 30) return "18-29";
  if (age < 50) return "30-49";
  if (age < 70) return "50-69";
  return "70+";
}

function buildReport(characters: CharacterLike[], source: string): DiagnosisReport {
  const rows = characters.filter(c => c && typeof c.i === "number").map(toRow);
  const living = rows.filter(r => !r.dead);

  const byPrimary = {} as Record<PaidBucket, WealthStats>;
  for (const bucket of BUCKET_ORDER) {
    byPrimary[bucket] = computeStats(living.filter(r => r.primary === bucket));
  }

  // Multi-membership stats for inversion (a character can be only one primary,
  // but guildApprentice primary is what we care about for the reported bug).
  const apprentices = living.filter(r => r.buckets.includes("guildApprentice"));
  const commanders = living.filter(r => r.buckets.includes("fieldCommander"));
  const masters = living.filter(r => r.buckets.includes("guildMaster"));
  const apprenticeStats = computeStats(apprentices);
  const commanderStats = computeStats(commanders);
  const masterStats = computeStats(masters);

  const inversions: InversionFlag[] = [];

  if (apprenticeStats.count > 0 && commanderStats.count > 0) {
    if (apprenticeStats.median > commanderStats.median * 2 && apprenticeStats.median >= 1) {
      inversions.push({
        id: "apprentice-vs-commander-median",
        severity: "warn",
        message: `Guild apprentice median wealth (${fmtNum(apprenticeStats.median)} SP / ${formatCoin(apprenticeStats.median)}) is >2× field commander median (${fmtNum(commanderStats.median)} SP / ${formatCoin(commanderStats.median)}). Historical order is inverted.`
      });
    } else if (apprenticeStats.median > commanderStats.median) {
      inversions.push({
        id: "apprentice-vs-commander-median-soft",
        severity: "info",
        message: `Guild apprentice median (${fmtNum(apprenticeStats.median)} SP) exceeds field commander median (${fmtNum(commanderStats.median)} SP).`
      });
    }
  }

  if (apprenticeStats.count > 0 && masterStats.count > 0 && apprenticeStats.median >= masterStats.median * 0.8) {
    inversions.push({
      id: "apprentice-near-master",
      severity: "warn",
      message: `Apprentice median (${fmtNum(apprenticeStats.median)} SP) is ≥80% of guild master median (${fmtNum(masterStats.median)} SP). Apprentices should be far below masters (historically often near-zero cash).`
    });
  }

  if (apprenticeStats.ageUnder18 > 0 && apprenticeStats.median >= GOLD_TO_SILVER) {
    inversions.push({
      id: "child-apprentice-gold",
      severity: "warn",
      message: `${apprenticeStats.ageUnder18} living apprentice(s) under 18; bucket median is ≥1 gold (${formatCoin(apprenticeStats.median)}). Child apprentices historically held little/no cash wages.`
    });
  }

  if (commanderStats.count > 0 && commanderStats.median > 0 && commanderStats.median < 1) {
    inversions.push({
      id: "commander-sub-silver",
      severity: "info",
      message: `Field commander median wealth is under 1 silver (${formatCoin(commanderStats.median)}). Military stipends are calibrated to subsistence-scale upkeep (BASE_UPKEEP_PER_HEAD) and may be too low vs economy pools.`
    });
  }

  if (living.length > 0 && living.filter(r => r.hasWealthField).length === 0) {
    inversions.push({
      id: "no-wealth-field",
      severity: "warn",
      message: "No character has a numeric `wealth` field. Dump may predate Character.wealth, or stipends were never seeded. Numbers will all read as 0."
    });
  }

  const ageBands: Record<string, WealthStats> = {};
  for (const band of ["0-11", "12-17", "18-29", "30-49", "50-69", "70+"]) {
    ageBands[band] = computeStats(living.filter(r => ageBand(r.age) === band));
  }

  const byWealthDesc = [...living].sort((a, b) => b.wealth - a.wealth);
  const byWealthAsc = [...living].sort((a, b) => a.wealth - b.wealth);

  return {
    source,
    characterCount: rows.length,
    livingCount: living.length,
    wealthFieldPresent: living.filter(r => r.hasWealthField).length,
    byPrimary,
    inversions,
    richestApprentices: [...apprentices].sort((a, b) => b.wealth - a.wealth).slice(0, 8),
    poorestCommanders: [...commanders].sort((a, b) => a.wealth - b.wealth).slice(0, 8),
    richestOverall: byWealthDesc.slice(0, 10),
    ageBands
  };
}

function printReport(report: DiagnosisReport): void {
  const line = (s = "") => console.log(s);

  line("═══════════════════════════════════════════════════════════════════");
  line(" Character wealth diagnosis");
  line("═══════════════════════════════════════════════════════════════════");
  line(` Source:            ${report.source}`);
  line(` Characters:        ${report.characterCount} total, ${report.livingCount} living`);
  line(` With wealth field: ${report.wealthFieldPresent}`);
  line(` Coin display:      1G = ${GOLD_TO_SILVER}S, 1S = ${SILVER_TO_COPPER}C (internal unit = silver)`);
  line();

  line("── By primary paid bucket (living only; multi-role → highest rank) ──");
  const headers = [
    pad("Bucket", 22),
    pad("N", 5, true),
    pad("<18", 5, true),
    pad("med SP", 10, true),
    pad("mean SP", 10, true),
    pad("max SP", 10, true),
    pad("median coins", 16, true),
    pad("age med", 8, true)
  ];
  line(headers.join(" "));
  line("-".repeat(90));

  for (const bucket of BUCKET_ORDER) {
    const s = report.byPrimary[bucket];
    if (!s.count) continue;
    line(
      [
        pad(BUCKET_LABEL[bucket], 22),
        pad(String(s.count), 5, true),
        pad(String(s.ageUnder18), 5, true),
        pad(fmtNum(s.median), 10, true),
        pad(fmtNum(s.mean), 10, true),
        pad(fmtNum(s.max), 10, true),
        pad(formatCoin(s.median), 16, true),
        pad(fmtNum(s.ageMedian, 0), 8, true)
      ].join(" ")
    );
  }
  line();

  line("── Age bands (all living) ──");
  for (const [band, s] of Object.entries(report.ageBands)) {
    if (!s.count) continue;
    line(
      `  ${pad(band, 6)}  n=${pad(String(s.count), 5, true)}  med=${pad(fmtNum(s.median), 8, true)} SP (${formatCoin(s.median)})  max=${fmtNum(s.max)} SP`
    );
  }
  line();

  if (report.inversions.length) {
    line("── Flags ──");
    for (const flag of report.inversions) {
      const tag = flag.severity === "warn" ? "WARN" : "info";
      line(`  [${tag}] ${flag.message}`);
    }
    line();
  } else {
    line("── Flags ──");
    line("  (none — relative ordering looks sane, or sample too small)");
    line();
  }

  if (report.richestApprentices.length) {
    line("── Richest guild apprentices ──");
    for (const r of report.richestApprentices) {
      line(
        `  #${r.i} ${r.name}  age ${r.age}  ${fmtNum(r.wealth)} SP (${formatCoin(r.wealth)})  roles=[${r.roleKinds.join(",")}]`
      );
    }
    line();
  }

  if (report.poorestCommanders.length) {
    line("── Poorest field commanders ──");
    for (const r of report.poorestCommanders) {
      line(
        `  #${r.i} ${r.name}  age ${r.age}  ${fmtNum(r.wealth)} SP (${formatCoin(r.wealth)})  titles=[${r.titles.join(",")}]`
      );
    }
    line();
  }

  if (report.richestOverall.length) {
    line("── Top 10 richest living ──");
    for (const r of report.richestOverall) {
      line(
        `  #${r.i} ${r.name}  age ${r.age}  ${fmtNum(r.wealth)} SP (${formatCoin(r.wealth)})  primary=${r.primary}`
      );
    }
    line();
  }

  line("── Reference pay ladder (SP / cycle; pools are ceilings only) ──");
  line("  Apprentice pocket   0.03/0.05/0.08  if solidarity ≥ 20 both ways");
  line("  Market rival        0.30 fixed");
  line("  Guild master        0.35 fixed");
  line("  Market manager      0.70 fixed");
  line("  Field commander     clamp(upkeep×15%, 0.5, 1.5)");
  line("  Province lord       1.00 fixed");
  line("  Central office      clamp(dept×12%, 0.8, 3.0)");
  line("  Ruler household     clamp(income×formRate, 1.0, 5.0)");
  line("  Soldier reference   0.12 (upkeep, not Character.wealth)");
  line("  seed back-pay       4–10 cycles (apprentice 2–6 pocket if bonded)");
  line("  See docs/analytics/character-wealth-balance.md");
  line();
  line("Done.");
}

function reportToJson(report: DiagnosisReport): unknown {
  return {
    ...report,
    byPrimary: Object.fromEntries(
      BUCKET_ORDER.map(b => [
        b,
        {
          label: BUCKET_LABEL[b],
          ...report.byPrimary[b],
          medianCoins: formatCoin(report.byPrimary[b].median),
          maxCoins: formatCoin(report.byPrimary[b].max)
        }
      ])
    )
  };
}

function reportToCsv(report: DiagnosisReport): string {
  const header = [
    "bucket",
    "label",
    "count",
    "age_under_18",
    "median_sp",
    "mean_sp",
    "min_sp",
    "p25_sp",
    "p75_sp",
    "max_sp",
    "sum_sp",
    "age_median",
    "median_coins"
  ].join(",");
  const rows = BUCKET_ORDER.filter(b => report.byPrimary[b].count > 0).map(b => {
    const s = report.byPrimary[b];
    return [
      b,
      JSON.stringify(BUCKET_LABEL[b]),
      s.count,
      s.ageUnder18,
      s.median,
      s.mean,
      s.min,
      s.p25,
      s.p75,
      s.max,
      s.sum,
      s.ageMedian,
      JSON.stringify(formatCoin(s.median))
    ].join(",");
  });
  return [header, ...rows].join("\n") + "\n";
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

function asCharacterArray(value: unknown): CharacterLike[] | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return value.filter((c): c is CharacterLike => Boolean(c) && typeof c === "object" && "i" in c);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.characters)) return asCharacterArray(obj.characters);
    if (obj.pack && typeof obj.pack === "object") {
      const pack = obj.pack as Record<string, unknown>;
      if (pack.characters) return asCharacterArray(pack.characters);
    }
    // Numeric-key map (Indexed-object dump)
    const values = Object.values(obj);
    if (values.length && values.every(v => v && typeof v === "object" && v !== null && "i" in (v as object))) {
      return values as CharacterLike[];
    }
  }
  return null;
}

function looksLikeCharacterArrayJson(slot: string): boolean {
  if (!slot || (slot[0] !== "[" && slot[0] !== "{")) return false;
  // Cheap structural hints — avoid JSON.parse on multi-MB non-character slots.
  return (
    slot.includes('"age"') &&
    slot.includes('"name"') &&
    (slot.includes('"titles"') || slot.includes('"roles"') || slot.includes('"wealth"'))
  );
}

function loadFromMapFile(text: string): CharacterLike[] | null {
  // .map files are CRLF-joined slots; characters live at index 45 on current saves
  // (see src/io/save.ts). Older maps may omit the slot entirely.
  const lines = text.includes("\r\n") ? text.split("\r\n") : text.split("\n");

  const candidates: string[] = [];
  if (lines[45] && looksLikeCharacterArrayJson(lines[45])) candidates.push(lines[45]);
  for (let i = 0; i < lines.length; i++) {
    if (i === 45) continue;
    const line = lines[i];
    if (line && looksLikeCharacterArrayJson(line)) candidates.push(line);
  }

  for (const slot of candidates) {
    try {
      const parsed = JSON.parse(slot) as unknown;
      const chars = asCharacterArray(parsed);
      if (chars?.length) return chars;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function loadCharacters(filePath: string): CharacterLike[] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`File not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const looksLikeMap = abs.endsWith(".map") || /^\d+\.\d+/.test(raw.slice(0, 20)) || raw.includes("\r\n");

  if (looksLikeMap) {
    const fromMap = loadFromMapFile(raw);
    if (fromMap?.length) return fromMap;
    if (abs.endsWith(".map")) {
      throw new Error(
        `No characters slot found in map file ${abs}. ` +
          `Current saves store characters at line index 45; older .map files (pre-Characters) have no wealth data. ` +
          `Export live data with: copy(JSON.stringify(window.fmg.world.pack.characters))`
      );
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const fromMap = loadFromMapFile(raw);
    if (fromMap?.length) return fromMap;
    throw new Error(`Failed to parse JSON in ${abs}: ${(err as Error).message}`);
  }

  const chars = asCharacterArray(parsed);
  if (!chars?.length) {
    throw new Error(
      `No characters found in ${abs}. Expected Character[], { characters }, pack.characters, or .map slot [45].`
    );
  }
  return chars;
}

// ─── Browser snippet ─────────────────────────────────────────────────────────

const BROWSER_SNIPPET = `
/* Paste into the browser console on a live FMG tab (npm run dev).
 * Requires Characters + Economy stipends to have run (wealth field present).
 */
(() => {
  const GOLD = 12, SILVER_C = 12;
  const CENTRAL = new Set(["Chancellor","Marshal","Steward","Spymaster","Court Chaplain","Prime Minister","Minister of Foreign Affairs","Minister of War","Minister of Finance","Director of Intelligence"]);
  const CMD = new Set(["Commander","Admiral"]);
  const RANK = { ruler:0, centralOffice:1, fieldCommander:2, provinceLord:3, guildMaster:4, guildApprentice:5, marketManager:6, marketRival:7, merchantOrgHead:8, otherRole:9, noPaidRole:10 };
  const LABEL = { ruler:"Ruler", centralOffice:"Central office", fieldCommander:"Field commander", provinceLord:"Province lord", guildMaster:"Guild master", guildApprentice:"Guild apprentice", marketManager:"Market manager", marketRival:"Market rival", merchantOrgHead:"Merchant org head", otherRole:"Other role", noPaidRole:"No paid role" };

  function coin(sp) {
    const t = Math.round(Math.max(0, sp) * SILVER_C);
    const g = Math.floor(t / (GOLD * SILVER_C));
    const r = t % (GOLD * SILVER_C);
    const s = Math.floor(r / SILVER_C);
    const c = r % SILVER_C;
    return [g ? g + "G" : null, (s || !g) ? s + "S" : null, c ? c + "C" : null].filter(Boolean).join(" ");
  }
  function q(sorted, p) {
    if (!sorted.length) return 0;
    const pos = (sorted.length - 1) * p, b = Math.floor(pos), f = pos - b;
    return sorted[b + 1] === undefined ? sorted[b] : sorted[b] + f * (sorted[b + 1] - sorted[b]);
  }
  function stats(rows) {
    const w = rows.map(r => r.wealth).sort((a,b)=>a-b);
    const ages = rows.map(r => r.age).sort((a,b)=>a-b);
    return {
      n: rows.length,
      under18: rows.filter(r => r.age < 18).length,
      med: q(w, 0.5), mean: w.length ? w.reduce((a,b)=>a+b,0)/w.length : 0,
      max: w[w.length-1] || 0, ageMed: q(ages, 0.5)
    };
  }
  function buckets(c) {
    const found = new Set();
    for (const t of (c.titles || []).filter(t => t.endYear === undefined)) {
      if (t.landed && t.entityType === "state") found.add("ruler");
      if (t.entityType === "province") found.add("provinceLord");
      if (!t.landed && CENTRAL.has(t.title)) found.add("centralOffice");
      if (!t.landed && CMD.has(t.title)) found.add("fieldCommander");
    }
    for (const r of (c.roles || []).filter(r => r.endYear === undefined)) {
      if (r.kind === "guildMaster") found.add("guildMaster");
      else if (r.kind === "guildApprentice") found.add("guildApprentice");
      else if (r.kind === "marketManager") found.add("marketManager");
      else if (r.kind === "marketRivalMerchant") found.add("marketRival");
      else if (r.kind === "merchantOrganizationHead") found.add("merchantOrgHead");
      else found.add("otherRole");
    }
    if (!found.size) found.add("noPaidRole");
    return [...found].sort((a,b) => RANK[a] - RANK[b]);
  }

  const chars = (window.fmg && window.fmg.world && window.fmg.world.pack && window.fmg.world.pack.characters) || [];
  const living = chars.filter(c => c && !c.dead).map(c => {
    const b = buckets(c);
    return { i: c.i, name: c.name, age: c.age || 0, wealth: typeof c.wealth === "number" ? c.wealth : 0, hasW: typeof c.wealth === "number", primary: b[0], buckets: b, titles: (c.titles||[]).filter(t=>t.endYear===undefined).map(t=>t.title), roles: (c.roles||[]).filter(r=>r.endYear===undefined).map(r=>r.kind) };
  });

  console.log("%cCharacter wealth diagnosis (live)", "font-weight:bold;font-size:14px");
  console.log("Living:", living.length, " with wealth field:", living.filter(r => r.hasW).length);
  const order = Object.keys(RANK).sort((a,b)=>RANK[a]-RANK[b]);
  const table = order.map(k => {
    const s = stats(living.filter(r => r.primary === k));
    if (!s.n) return null;
    return { bucket: LABEL[k], n: s.n, under18: s.under18, medianSP: +s.med.toFixed(2), meanSP: +s.mean.toFixed(2), maxSP: +s.max.toFixed(2), medianCoins: coin(s.med), ageMed: +s.ageMed.toFixed(0) };
  }).filter(Boolean);
  console.table(table);

  const appr = living.filter(r => r.buckets.includes("guildApprentice"));
  const cmd = living.filter(r => r.buckets.includes("fieldCommander"));
  const aMed = stats(appr).med, cMed = stats(cmd).med;
  if (appr.length && cmd.length && aMed > cMed) {
    console.warn("INVERSION: apprentice median", aMed, coin(aMed), "> commander median", cMed, coin(cMed));
  }
  console.log("Richest apprentices:", [...appr].sort((a,b)=>b.wealth-a.wealth).slice(0,5));
  console.log("Poorest commanders:", [...cmd].sort((a,b)=>a.wealth-b.wealth).slice(0,5));

  // Also return a serialisable summary for copy()
  const summary = { living: living.length, table, apprenticeMedian: aMed, commanderMedian: cMed };
  console.log("Return value = summary; copy(JSON.stringify(summary,null,2)) to clipboard.");
  return summary;
})();
`.trim();

// ─── CLI ─────────────────────────────────────────────────────────────────────

function printUsage(): void {
  console.log(`Usage:
  npx tsx scripts/diagnoseCharacterWealth.ts <file> [--json out.json] [--csv out.csv]
  npx tsx scripts/diagnoseCharacterWealth.ts --browser
  npm run diagnose:wealth -- <file>

Examples:
  npm run diagnose:wealth -- temp/debug/map/45_characters.json
  npm run diagnose:wealth -- tests/fixtures/demo.map --csv /tmp/wealth.csv
  npx tsx scripts/diagnoseCharacterWealth.ts --browser
    # then paste the printed snippet into the browser console on a live map
`);
}

function main(argv: string[]): number {
  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    printUsage();
    return argv.length === 0 ? 1 : 0;
  }

  if (argv.includes("--browser")) {
    console.log("── Paste into the browser console on a live FMG map ──\n");
    console.log(BROWSER_SNIPPET);
    console.log("\n── end snippet ──");
    console.log("\nTip: after running, copy(JSON.stringify($_, null, 2)) if the console supports $_.");
    return 0;
  }

  const fileArg = argv.find(a => !a.startsWith("--"));
  if (!fileArg) {
    printUsage();
    return 1;
  }

  let jsonOut: string | null = null;
  let csvOut: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") jsonOut = argv[i + 1] ?? null;
    if (argv[i] === "--csv") csvOut = argv[i + 1] ?? null;
  }

  const characters = loadCharacters(fileArg);
  const report = buildReport(characters, path.resolve(fileArg));
  printReport(report);

  if (jsonOut) {
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(reportToJson(report), null, 2));
    console.log(`Wrote JSON: ${path.resolve(jsonOut)}`);
  }
  if (csvOut) {
    fs.writeFileSync(path.resolve(csvOut), reportToCsv(report));
    console.log(`Wrote CSV: ${path.resolve(csvOut)}`);
  }

  const hardWarns = report.inversions.filter(f => f.severity === "warn").length;
  // Exit 0 always for exploratory use; print warn count for scripts that care.
  if (hardWarns) console.log(`(${hardWarns} warning flag(s))`);
  return 0;
}

// Exported for a light self-check when run with --self-test
export {
  buildReport,
  classifyBuckets,
  computeStats,
  formatCoin,
  loadCharacters,
  primaryBucket,
  toRow,
  type CharacterLike,
  type DiagnosisReport
};

const isMain =
  Boolean(process.argv[1]) && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  if (process.argv.includes("--self-test")) {
    const sample: CharacterLike[] = [
      {
        i: 1,
        name: "Kid",
        age: 13,
        wealth: 96,
        roles: [
          {
            source: "economy",
            kind: "guildApprentice",
            entityType: "burg",
            entityId: 1,
            label: "Guild Apprentice"
          }
        ]
      },
      {
        i: 2,
        name: "Capt",
        age: 34,
        wealth: 0.4,
        titles: [{ title: "Commander", landed: false, entityType: "state", entityId: 1 }]
      },
      {
        i: 3,
        name: "Master",
        age: 48,
        wealth: 120,
        roles: [
          { source: "economy", kind: "guildMaster", entityType: "burg", entityId: 1, label: "Guild Master" }
        ]
      }
    ];
    const report = buildReport(sample, "self-test");
    printReport(report);
    const hasInversion = report.inversions.some(f => f.id.startsWith("apprentice-vs-commander"));
    if (!hasInversion) {
      console.error("self-test failed: expected apprentice/commander inversion flag");
      process.exit(1);
    }
    console.log("self-test ok");
    process.exit(0);
  }

  process.exit(main(process.argv.slice(2)));
}
