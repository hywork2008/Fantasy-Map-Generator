#!/usr/bin/env node
// ce:perf の report.jsonl から、遅い都市・時間のかかる工程などの絞り込み材料を抽出する。
// 使い方と読み方: docs/tools/ce-performance-query.md
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const COMMANDS = {
  overview: "全体像: 件数・状態・生成時間の分布・規模別の時間・時間の使い道トップ",
  cities: "遅い都市の一覧（--by で並び替え）",
  stages: "全都市で集計した工程別の時間（--self で自己時間）",
  stage: "指定した工程が遅い都市の一覧: stage <path|部分一致>",
  city: "1都市の工程ツリー: city <burgId|名前>",
  retries: "再試行・不採用の都市と、失敗試行で捨てた時間",
  scaling: "工程の時間が規模（dwellings等）に対してどう増えるか（超線形の工程を探す）",
  walls: "市壁・城塞・門の診断: 二重市壁の実現/後退理由、周回別の河川開口、城塞・門の失敗",
  compare: "2つのレポートの工程別の差分: compare <before.jsonl> <after.jsonl>",
};

const usage = `Usage: npm run ce:perf:query -- <report.jsonl> <command> [arg] [options]

Commands:
${Object.entries(COMMANDS).map(([k, v]) => `  ${k.padEnd(9)} ${v}`).join("\n")}

Options:
  --top <n>        表示件数（既定 15）
  --by <key>       cities の並び替え: generationMs(既定) totalMs dwellings population faces
                   ms/dwelling attempts wasted(失敗試行の時間) fit-housing など工程名/パス
  --self           stages/stage で子工程を除いた自己時間を使う
  --depth <n>      stages/city で表示する階層の深さ（既定 無制限）
  --min-ms <ms>    stages/city で、この時間未満の行を省く（既定 0）
  --size <name>    都市をサイズで絞る（small|medium|large 等）
  --status <s>     generated|rejected で絞る
  --min-dwellings <n> / --max-dwellings <n>  住宅数で絞る
  --json           Markdownの代わりにJSONで出力
  --help           この説明
詳しい読み方: docs/tools/ce-performance-query.md`;

const argv = process.argv.slice(2);
const flags = { top: 15, by: "generationMs", self: false, json: false, depth: Infinity, minMs: 0 };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    if (i + 1 >= argv.length) fail(`${a} needs a value`);
    return argv[++i];
  };
  if (a === "--help" || a === "-h") { console.log(usage); process.exit(0); }
  else if (a === "--top") flags.top = Number(next());
  else if (a === "--by") flags.by = next();
  else if (a === "--self") flags.self = true;
  else if (a === "--json") flags.json = true;
  else if (a === "--depth") flags.depth = Number(next());
  else if (a === "--min-ms") flags.minMs = Number(next());
  else if (a === "--size") flags.size = next();
  else if (a === "--status") flags.status = next();
  else if (a === "--min-dwellings") flags.minDwellings = Number(next());
  else if (a === "--max-dwellings") flags.maxDwellings = Number(next());
  else if (a.startsWith("--")) fail(`Unknown option ${a}\n${usage}`);
  else pos.push(a);
}
function fail(message) {
  console.error(message);
  process.exit(1);
}
if (pos.length < 2) fail(usage);
for (const n of ["top", "depth", "minMs"]) if (Number.isNaN(flags[n])) fail(`--${n} must be a number`);
const [file, command, arg, arg2] = pos;
if (!(command in COMMANDS)) fail(`Unknown command: ${command}\n${usage}`);

// ---------- 読み込み ----------
async function load(path) {
  const p = resolve(path);
  if (!existsSync(p)) fail(`Not found: ${p}`);
  const records = [];
  let n = 0;
  for await (const line of createInterface({ input: createReadStream(p), crlfDelay: Infinity })) {
    n++;
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); }
    catch (e) { fail(`${p}:${n}: invalid JSON: ${e.message}`); }
  }
  if (!records.length) fail(`No records in ${p}`);
  return records;
}

const norm = (path) => path.replace(/attempt-\d+/g, "attempt-*");
const stageRows = (r) => (r.generationBreakdown || []).map((b) => ({ ...b, key: norm(b.path) }));
const gen = (r) => r.timings?.generationMs ?? null;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
function pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function stats(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, sum: 0, mean: null, median: null, p95: null, max: null };
  return { n: v.length, sum: sum(v), mean: sum(v) / v.length, median: pct(v, 50), p95: pct(v, 95), max: v[v.length - 1] };
}
// 失敗試行で捨てた時間: attempt-N のうち最終採用試行(= attempts)以外の elapsedMs 合計
function wastedMs(r) {
  const finalAttempt = r.status === "generated" ? r.attempts : null;
  return sum((r.generationBreakdown || [])
    .filter((b) => /^generation\/attempt-\d+$/.test(b.path))
    .filter((b) => Number(b.path.match(/\d+$/)[0]) !== finalAttempt)
    .map((b) => b.elapsedMs));
}
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = sum(xs) / n, my = sum(ys) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
// 対数-対数回帰の傾き: 時間 ∝ 規模^k の k。1付近=線形、2付近=2乗
function logSlope(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x > 0 && y > 0);
  if (pts.length < 5) return null;
  const lx = pts.map((p) => Math.log(p[0])), ly = pts.map((p) => Math.log(p[1]));
  const n = pts.length, mx = sum(lx) / n, my = sum(ly) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (lx[i] - mx) * (ly[i] - my); sxx += (lx[i] - mx) ** 2; }
  return sxx ? sxy / sxx : null;
}

function applyFilters(records) {
  return records.filter((r) =>
    (!flags.size || r.size === flags.size) &&
    (!flags.status || r.status === flags.status) &&
    (flags.minDwellings === undefined || (r.dwellings ?? 0) >= flags.minDwellings) &&
    (flags.maxDwellings === undefined || (r.dwellings ?? 0) <= flags.maxDwellings));
}

// ---------- 整形 ----------
const f = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(d));
const ms = (v) => (v === null || v === undefined ? "-" : v >= 100 ? f(v) : f(v, 1));
const pc = (v) => (v === null || v === undefined ? "-" : `${f(v * 100, 1)}%`);
function table(headers, rows) {
  const line = (cells) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map((r) => line(r.map((c) => String(c ?? "-"))))].join("\n");
}
function emit(title, data, markdown) {
  if (flags.json) console.log(JSON.stringify({ command, title, ...data }, null, 2));
  else console.log(`## ${title}\n\n${markdown}\n`);
}
const cityLabel = (r) => `${r.burgId} ${r.name}`;

// ---------- 集計の核 ----------
// 工程(パス)ごとに、全都市分の elapsed / self を集める。出現しない都市は0扱いにせず出現数nで示す。
function aggregateStages(records) {
  const map = new Map();
  for (const r of records) {
    for (const b of stageRows(r)) {
      let e = map.get(b.key);
      if (!e) map.set(b.key, (e = { key: b.key, depth: b.depth, elapsed: [], self: [], calls: 0 }));
      // 同一都市内で attempt-* が複数あれば合算（1都市1サンプルにする）
      e.perCity ??= new Map();
      const c = e.perCity.get(r) ?? { elapsed: 0, self: 0 };
      c.elapsed += b.elapsedMs; c.self += b.selfMs; e.perCity.set(r, c);
      e.calls += b.calls;
    }
  }
  for (const e of map.values()) {
    for (const c of e.perCity.values()) { e.elapsed.push(c.elapsed); e.self.push(c.self); }
  }
  return map;
}

// ---------- コマンド ----------
const records = applyFilters(await load(file));
if (!records.length && command !== "compare") fail("No records match the filters");

const commands = {
  overview() {
    const generated = records.filter((r) => r.status === "generated");
    const statuses = {};
    for (const r of records) statuses[r.status] = (statuses[r.status] || 0) + 1;
    const g = stats(records.map(gen));
    const total = g.sum;
    const sorted = records.map(gen).filter(Number.isFinite).sort((a, b) => b - a);
    const top10Share = sum(sorted.slice(0, 10)) / total;
    const top10pctN = Math.max(1, Math.ceil(sorted.length * 0.1));
    const topDecileShare = sum(sorted.slice(0, top10pctN)) / total;
    const bySize = {};
    for (const r of records) (bySize[r.size] ??= []).push(r);
    const sizeRows = Object.entries(bySize).map(([size, rs]) => {
      const s = stats(rs.map(gen));
      return { size, cities: rs.length, medianMs: s.median, p95Ms: s.p95, maxMs: s.max, sumMs: s.sum, shareOfTotal: s.sum / total,
        medianDwellings: stats(rs.map((r) => r.dwellings)).median };
    });
    const dw = records.map((r) => r.dwellings), ms_ = records.map(gen);
    const corr = { dwellings: pearson(dw, ms_), population: pearson(records.map((r) => r.population), ms_), faces: pearson(records.map((r) => r.faces), ms_) };
    const slope = logSlope(dw, ms_);
    const self = new Map();
    for (const r of generated.length ? generated : records) for (const b of stageRows(r)) self.set(b.key, (self.get(b.key) || 0) + b.selfMs);
    const selfTotal = sum([...self.values()]);
    const topSelf = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([key, v]) => ({ stage: key, selfMs: v, share: v / selfTotal }));
    const retried = records.filter((r) => (r.attempts ?? 1) > 1);
    const wasted = sum(records.map(wastedMs));
    const data = { records: records.length, statuses, generationMs: g, totalGenerationMs: total,
      top10CitiesShare: top10Share, topDecileShare, bySize: sizeRows, correlationWithGenerationMs: corr,
      timeVsDwellingsExponent: slope, topSelfStages: topSelf, retriedCities: retried.length, wastedMsOnFailedAttempts: wasted };
    const md = [
      `レコード ${records.length} 件 / 状態 ${JSON.stringify(statuses)} / 生成時間合計 ${f(total / 1000, 1)} s`,
      `生成時間(ms): 中央値 ${ms(g.median)} / 平均 ${ms(g.mean)} / p95 ${ms(g.p95)} / 最大 ${ms(g.max)}`,
      `上位10都市で全体の ${pc(top10Share)}、上位10%(${top10pctN}都市)で ${pc(topDecileShare)}。` +
        ` → これが高いほど「少数の遅い都市」を狙えばよく、低いほど全体的に遅い（工程側を狙う）。`,
      `時間 ∝ dwellings^${f(slope, 2)}（約1=線形、2に近い=2乗で悪化）。相関 r: dwellings ${f(corr.dwellings, 2)} / population ${f(corr.population, 2)} / faces ${f(corr.faces, 2)}`,
      `再試行(attempts>1) ${retried.length} 都市、失敗試行で捨てた時間 ${f(wasted / 1000, 1)} s (${pc(wasted / total)})`,
      "", "### サイズ別",
      table(["size", "cities", "median住宅", "median ms", "p95 ms", "max ms", "合計の割合"],
        sizeRows.map((s) => [s.size, s.cities, f(s.medianDwellings), ms(s.medianMs), ms(s.p95Ms), ms(s.maxMs), pc(s.shareOfTotal)])),
      "", "### 自己時間の上位工程（子を除く。合計が生成時間なので重複なし＝最初の改善候補）",
      table(["stage", "self合計 s", "割合"], topSelf.map((s) => [s.stage, f(s.selfMs / 1000, 1), pc(s.share)])),
      "", "次の一手: `cities` で遅い都市、`stages --self` で工程、`stage <path>` で工程が遅い都市、`city <id>` で内訳。",
    ].join("\n");
    emit("overview", data, md);
  },

  cities() {
    const by = flags.by;
    const value = (r) => {
      switch (by) {
        case "generationMs": return gen(r);
        case "totalMs": return r.totalMs;
        case "wasted": return wastedMs(r);
        case "ms/dwelling": return gen(r) / Math.max(1, r.dwellings);
        case "dwellings": case "population": case "faces": case "attempts": case "generatedFaces": return r[by];
        default: {
          const rows = stageRows(r).filter((b) => b.key === by || b.key === `generation/${by}` || b.key.endsWith(`/${by}`));
          if (!rows.length) return 0;
          return sum(rows.map((b) => (flags.self ? b.selfMs : b.elapsedMs)));
        }
      }
    };
    const ranked = records.map((r) => ({ r, v: value(r) })).filter((x) => Number.isFinite(x.v))
      .sort((a, b) => b.v - a.v).slice(0, flags.top);
    const rows = ranked.map(({ r, v }) => {
      const sr = stageRows(r).filter((b) => b.depth >= 1).sort((a, b) => b.selfMs - a.selfMs)[0];
      return { burgId: r.burgId, name: r.name, status: r.status, size: r.size, population: r.population, dwellings: r.dwellings,
        faces: r.faces, generatedFaces: r.generatedFaces, attempts: r.attempts, generationMs: gen(r), msPerDwelling: gen(r) / Math.max(1, r.dwellings),
        wastedMs: wastedMs(r), sortValue: v, topSelfStage: sr?.key, topSelfMs: sr?.selfMs };
    });
    emit(`遅い都市 (by ${by}, top ${flags.top})`, { by, rows },
      table(["burg", "status", "size", "住宅", "faces", "試行", "gen ms", "ms/住宅", "捨てた ms", "自己時間最大の工程 (ms)"],
        rows.map((x) => [`${x.burgId} ${x.name}`, x.status, x.size, x.dwellings, x.faces, x.attempts, ms(x.generationMs), f(x.msPerDwelling, 2),
          ms(x.wastedMs), x.topSelfStage ? `${x.topSelfStage.replace("generation/", "")} (${ms(x.topSelfMs)})` : "-"])));
  },

  stages() {
    const agg = aggregateStages(records);
    const totalGen = sum(records.map((r) => gen(r) ?? 0));
    const rows = [...agg.values()].filter((e) => e.depth <= flags.depth).map((e) => {
      const v = flags.self ? e.self : e.elapsed;
      const s = stats(v);
      return { stage: e.key, depth: e.depth, cities: e.elapsed.length, sumMs: s.sum, shareOfGeneration: s.sum / totalGen,
        medianMs: s.median, p95Ms: s.p95, maxMs: s.max, meanMs: s.mean };
    }).filter((x) => x.sumMs >= flags.minMs).sort((a, b) => b.sumMs - a.sumMs).slice(0, flags.top);
    emit(`工程別（${flags.self ? "自己時間: 子を除く。合計=生成時間" : "累計時間: 子を含む。親子で重複"}, 全都市合計順）`,
      { metric: flags.self ? "self" : "elapsed", rows },
      table(["stage", "cities", "合計 s", "生成時間比", "median ms", "p95 ms", "max ms"],
        rows.map((x) => [x.stage, x.cities, f(x.sumMs / 1000, 1), pc(x.shareOfGeneration), ms(x.medianMs), ms(x.p95Ms), ms(x.maxMs)])) +
      `\n\n※ 試行ごとの工程 attempt-N は attempt-* にまとめ、同一都市内は合算。「cities」はその工程が出現した都市数。`);
  },

  stage() {
    if (!arg) fail("stage needs <path|部分一致>, e.g. `stage fit-housing/legacy-fabric/local-fabric`");
    const hit = (key) => key === arg || key === `generation/${arg}` || key.endsWith(`/${arg}`) || (arg.includes("*") ? false : key.includes(arg));
    const keys = new Set();
    for (const r of records) for (const b of stageRows(r)) if (hit(b.key)) keys.add(b.key);
    if (!keys.size) fail(`No stage matches "${arg}". 候補は \`stages --top 60\` で確認`);
    // 完全一致があればそれのみ
    const exact = [...keys].filter((k) => k === arg || k === `generation/${arg}`);
    const use = new Set(exact.length ? exact : keys);
    const rows = records.map((r) => {
      const bs = stageRows(r).filter((b) => use.has(b.key));
      if (!bs.length) return null;
      const v = sum(bs.map((b) => (flags.self ? b.selfMs : b.elapsedMs)));
      return { burgId: r.burgId, name: r.name, size: r.size, dwellings: r.dwellings, faces: r.faces, attempts: r.attempts,
        stageMs: v, generationMs: gen(r), shareOfCity: v / gen(r), calls: sum(bs.map((b) => b.calls)) };
    }).filter(Boolean).sort((a, b) => b.stageMs - a.stageMs);
    const dwSlope = logSlope(rows.map((x) => x.dwellings), rows.map((x) => x.stageMs));
    emit(`工程 ${[...use].join(", ")} が遅い都市 (${flags.self ? "self" : "elapsed"}, top ${flags.top}/${rows.length})`,
      { stages: [...use], timeVsDwellingsExponent: dwSlope, rows: rows.slice(0, flags.top) },
      `この工程の時間 ∝ dwellings^${f(dwSlope, 2)}（出現 ${rows.length} 都市）\n\n` +
      table(["burg", "size", "住宅", "faces", "試行", "工程 ms", "都市内の割合", "calls"],
        rows.slice(0, flags.top).map((x) => [`${x.burgId} ${x.name}`, x.size, x.dwellings, x.faces, x.attempts, ms(x.stageMs), pc(x.shareOfCity), x.calls])));
  },

  city() {
    if (!arg) fail("city needs <burgId|名前>");
    const matches = records.filter((r) => String(r.burgId) === arg || r.name === arg);
    if (!matches.length) fail(`No city matches "${arg}"`);
    const out = matches.map((r) => {
      const rows = stageRows(r).filter((b) => b.depth <= flags.depth && b.elapsedMs >= flags.minMs);
      return { r, rows };
    });
    const md = out.map(({ r, rows }) => {
      const g = gen(r);
      const head = `### ${cityLabel(r)} (run ${r.run ?? 1}) status=${r.status} size=${r.size} 人口=${r.population} 住宅=${r.dwellings} faces=${r.faces}→${r.generatedFaces ?? "-"} 試行=${r.attempts} gen=${ms(g)} ms`;
      const t = table(["stage", "累計 ms", "自己 ms", "累計/gen", "calls"],
        rows.map((b) => ["　".repeat(b.depth) + b.path.split("/").slice(-1)[0] + (b.depth === 0 ? "" : ""), ms(b.elapsedMs), ms(b.selfMs), pc(b.elapsedMs / g), b.calls]));
      const failed = (r.phases || []).filter((p) => p.failure).map((p) => `attempt ${p.attempt} ${p.phase}: ${p.failure.reason}`);
      const dedup = [...new Set(failed)];
      return `${head}\n\n${t}` + (dedup.length ? `\n\n不採用理由: ${dedup.join(" / ")}` : "");
    }).join("\n\n");
    emit(`city ${arg}`, { cities: out.map(({ r, rows }) => ({ burgId: r.burgId, name: r.name, run: r.run, generationMs: gen(r), rows })) }, md);
  },

  retries() {
    const rs = records.filter((r) => (r.attempts ?? 1) > 1 || r.status !== "generated");
    const reasons = new Map();
    const rows = rs.map((r) => {
      const rr = [...new Set((r.phases || []).filter((p) => p.failure).map((p) => p.failure.reason))];
      for (const x of rr) reasons.set(x, (reasons.get(x) || 0) + 1);
      return { burgId: r.burgId, name: r.name, status: r.status, size: r.size, dwellings: r.dwellings, attempts: r.attempts,
        generationMs: gen(r), wastedMs: wastedMs(r), reasons: rr };
    }).sort((a, b) => b.wastedMs - a.wastedMs);
    const total = sum(records.map((r) => gen(r) ?? 0));
    const wasted = sum(rows.map((x) => x.wastedMs));
    emit("再試行・不採用", { cities: rows.length, wastedMs: wasted, reasons: Object.fromEntries(reasons), rows },
      `対象 ${rows.length} 都市 / 失敗試行で捨てた時間 ${f(wasted / 1000, 1)} s（生成時間合計の ${pc(wasted / total)}）\n` +
      `不採用理由の件数: ${[...reasons].map(([k, v]) => `${k}=${v}`).join(", ") || "-"}\n\n` +
      table(["burg", "status", "size", "住宅", "試行", "gen ms", "捨てた ms", "理由"],
        rows.slice(0, flags.top).map((x) => [`${x.burgId} ${x.name}`, x.status, x.size, x.dwellings, x.attempts, ms(x.generationMs), ms(x.wastedMs), x.reasons.join(",")])) +
      `\n\n※ 不採用(rejected)は全試行を使い切った都市。再試行の原因は \`city <id>\` の「不採用理由」で確認。`);
  },

  scaling() {
    const key = flags.by === "generationMs" ? "dwellings" : flags.by;
    if (!["dwellings", "population", "faces"].includes(key)) fail("--by は scaling では dwellings|population|faces");
    const agg = aggregateStages(records);
    const xsOf = (e) => [...e.perCity.keys()].map((r) => r[key]);
    const rows = [...agg.values()].filter((e) => e.depth <= flags.depth).map((e) => {
      const ys = [...e.perCity.values()].map((c) => (flags.self ? c.self : c.elapsed));
      const sm = stats(ys);
      return { stage: e.key, cities: ys.length, sumMs: sm.sum, exponent: logSlope(xsOf(e), ys), corr: pearson(xsOf(e), ys) };
    }).filter((x) => x.exponent !== null && x.sumMs >= Math.max(flags.minMs, 1))
      .sort((a, b) => b.exponent * Math.log10(1 + b.sumMs) - a.exponent * Math.log10(1 + a.sumMs)).slice(0, flags.top);
    const whole = logSlope(records.map((r) => r[key]), records.map(gen));
    emit(`規模(${key})に対する工程の増え方`, { by: key, wholeExponent: whole, rows },
      `全体: 生成時間 ∝ ${key}^${f(whole, 2)}\n\n` +
      table(["stage", "cities", "合計 s", `指数k (時間∝${key}^k)`, "相関r"],
        rows.map((x) => [x.stage, x.cities, f(x.sumMs / 1000, 1), f(x.exponent, 2), f(x.corr, 2)])) +
      `\n\n指数が約1=線形、1.5以上=超線形（規模が大きい都市で急に悪化）、0付近=規模に依らない固定費。` +
      `\n並び順は 指数 × log(合計時間) で、時間を食う超線形工程が上に来る。標本が5都市未満の工程は除外。`);
  },

  walls() {
    // generateCity.ts / innerTownWall.ts の診断コード（index + 1）
    const INNER_FAILURES = ["no-outer-wall", "too-small", "gap", "no-gate", "castle-crowds", "open-defense"];
    const BLOCKERS = ["water", "outside-land", "mesh-edge"];
    const finalPhase = (r, name) => {
      const ps = (r.phases || []).filter((p) => p.phase === name);
      return ps.filter((p) => p.attempt === r.attempts).at(-1) ?? ps.at(-1);
    };
    const doubles = records.filter((r) => (r.phases || []).some((p) => p.phase === "inner-wall"));
    const rows = doubles.map((r) => {
      const iw = finalPhase(r, "inner-wall")?.counts ?? {};
      const wdc = finalPhase(r, "wall-defense-closure")?.counts ?? {};
      const built = r.status === "generated" && iw.ok === 1 && (wdc.rings ?? 0) > 1;
      return { burgId: r.burgId, name: r.name, status: r.status, attempts: r.attempts, dwellings: r.dwellings,
        innerFirst: wdc.innerFirst ?? null, built,
        failure: built ? null : r.status !== "generated" ? "rejected" : INNER_FAILURES[(iw.failureCode ?? 0) - 1] ?? (iw.ok === 1 ? "lost-later" : "unknown"),
        planned: iw.planned ?? null, bestGap: iw.bestGap ?? null, blocker: BLOCKERS[(iw.blockerCode ?? 0) - 1] ?? null,
        innerFaces: iw.faces ?? null, gapCells: iw.gapCells ?? null,
        outerRiverOpeningMeters: wdc.outerRiverOpeningMeters ?? null, innerRiverOpeningMeters: wdc.innerRiverOpeningMeters ?? null,
        riverOpeningMeters: wdc.riverOpeningMeters ?? null, invasionPaths: wdc.invasionPaths ?? null, unprotectedMeters: wdc.unprotectedMeters ?? null,
        generationMs: gen(r) };
    });
    const count = (xs, key) => xs.reduce((m, x) => ((m[x[key] ?? "-"] = (m[x[key] ?? "-"] || 0) + 1), m), {});
    const built = rows.filter((x) => x.built);
    const opened = (x, k) => (x[k] ?? 0) > 0.5;
    // 城塞・門の失敗（全都市、全試行）
    const castle = {}, gateRows = [];
    for (const r of records)
      for (const p of r.phases || []) {
        if (!p.failure) continue;
        if (/^castle/.test(p.failure.reason)) castle[p.failure.reason] = (castle[p.failure.reason] || 0) + 1;
        if (p.failure.reason === "unconnected-gates" && p.counts?.gateFrameRatio !== undefined)
          gateRows.push({ burgId: r.burgId, name: r.name, attempt: p.attempt, ...p.counts });
      }
    const data = { doubleRequested: rows.length, built: built.length, failures: count(rows.filter((x) => !x.built), "failure"),
      blockers: count(rows.filter((x) => x.failure === "gap"), "blocker"),
      builtWithRiverOpening: { outer: built.filter((x) => opened(x, "outerRiverOpeningMeters")).length, inner: built.filter((x) => opened(x, "innerRiverOpeningMeters")).length },
      castleFailures: castle, unconnectedGates: gateRows, rows };
    const md = [
      `二重市壁の要求 ${rows.length} 都市 / 実現 ${built.length}（${pc(built.length / Math.max(1, rows.length))}）。順序: ${JSON.stringify(count(rows, "innerFirst"))}（1=内壁先, 0=外壁先）`,
      `後退理由: ${JSON.stringify(data.failures)} / gap の相手: ${JSON.stringify(data.blockers)}（water=水面, outside-land=市外の陸, mesh-edge=メッシュ端）`,
      `実現した二重市壁で河川開口あり: 外壁 ${data.builtWithRiverOpening.outer} / 内壁 ${data.builtWithRiverOpening.inner}`,
      "",
      table(["burg", "status", "試行", "住宅", "内壁", "後退理由", "bestGap", "相手", "外壁 川開口m", "内壁 川開口m", "侵入路", "gen ms"],
        rows.sort((a, b) => Number(a.built) - Number(b.built) || b.generationMs - a.generationMs).slice(0, Math.max(flags.top, rows.length))
          .map((x) => [`${x.burgId} ${x.name}`, x.status, x.attempts, x.dwellings, x.built ? "あり" : "なし", x.failure ?? "-", x.bestGap ?? "-", x.blocker ?? "-",
            f(x.outerRiverOpeningMeters), f(x.innerRiverOpeningMeters), x.invasionPaths ?? "-", ms(x.generationMs)])),
      "",
      `### 城塞の失敗（全試行の件数）\n${JSON.stringify(castle)}`,
      "",
      "### 門が道路に接続できない失敗（unconnected-gates）",
      gateRows.length
        ? table(["burg", "試行", "門", "未接続", "枠までの距離比", "周囲の面/中央値", "門の道路辺"],
            gateRows.map((x) => [`${x.burgId} ${x.name}`, x.attempt, x.gates, x.disconnected, f(x.gateFrameRatio, 2), f(x.gateFaceAreaRatio, 2), x.gateRoadEdges]))
        : "なし（または診断値のない古いレポート）",
      "",
      "枠までの距離比: 0=地図枠上、1=中心。周囲の面/中央値が大きいほど外縁の大セルに門がある。",
    ].join("\n");
    emit("walls", data, md);
  },

  async compare() {
    if (!arg) fail("compare needs <before.jsonl> as <file> and <after.jsonl> as arg");
    const before = records;
    const after = applyFilters(await load(arg));
    // 共通の (burgId, name) だけ比較し、都市構成の差による見かけの変化を避ける
    const idOf = (r) => `${r.burgId}`;
    const bMap = new Map(), aMap = new Map();
    for (const r of before) (bMap.get(idOf(r)) ?? bMap.set(idOf(r), []).get(idOf(r))).push(r);
    for (const r of after) (aMap.get(idOf(r)) ?? aMap.set(idOf(r), []).get(idOf(r))).push(r);
    const common = [...bMap.keys()].filter((k) => aMap.has(k));
    const med = (rs) => stats(rs.map(gen)).median;
    const cityRows = common.map((k) => {
      const b = med(bMap.get(k)), a = med(aMap.get(k));
      const r0 = bMap.get(k)[0];
      return { burgId: r0.burgId, name: r0.name, dwellings: r0.dwellings, beforeMs: b, afterMs: a, diffMs: a - b, ratio: a / b };
    });
    const sumB = sum(cityRows.map((x) => x.beforeMs)), sumA = sum(cityRows.map((x) => x.afterMs));
    const stageSum = (map) => {
      const m = new Map();
      for (const k of common) for (const r of [map.get(k)[0]]) for (const b of stageRows(r)) m.set(b.key, (m.get(b.key) || 0) + (flags.self ? b.selfMs : b.elapsedMs));
      return m;
    };
    const sb = stageSum(bMap), sa = stageSum(aMap);
    const stageRowsOut = [...new Set([...sb.keys(), ...sa.keys()])].map((k) => ({ stage: k, beforeMs: sb.get(k) || 0, afterMs: sa.get(k) || 0, diffMs: (sa.get(k) || 0) - (sb.get(k) || 0) }))
      .sort((a, b) => Math.abs(b.diffMs) - Math.abs(a.diffMs)).slice(0, flags.top);
    const worse = [...cityRows].sort((a, b) => b.diffMs - a.diffMs).slice(0, flags.top);
    const better = [...cityRows].sort((a, b) => a.diffMs - b.diffMs).slice(0, flags.top);
    const cTable = (rows) => table(["burg", "住宅", "before ms", "after ms", "差 ms", "比"],
      rows.map((x) => [`${x.burgId} ${x.name}`, x.dwellings, ms(x.beforeMs), ms(x.afterMs), ms(x.diffMs), f(x.ratio, 2)]));
    emit("compare", { commonCities: common.length, beforeTotalMs: sumB, afterTotalMs: sumA, stages: stageRowsOut, worse, better },
      `共通都市 ${common.length} / 生成時間合計 ${f(sumB / 1000, 1)} s → ${f(sumA / 1000, 1)} s (${pc(sumA / sumB - 1)})\n` +
      `※ 同じ入力CSV・同じマシンで測ったレポート同士でのみ意味がある（.meta.json の inputHash/cpu を確認）。同一都市が複数回ある場合は中央値。\n\n` +
      `### 工程の変化（${flags.self ? "self" : "elapsed"}、差の絶対値順）\n` +
      table(["stage", "before s", "after s", "差 s"], stageRowsOut.map((x) => [x.stage, f(x.beforeMs / 1000, 2), f(x.afterMs / 1000, 2), f(x.diffMs / 1000, 2)])) +
      `\n\n### 悪化した都市\n${cTable(worse)}\n\n### 改善した都市\n${cTable(better)}`);
  },
};

await commands[command]();
