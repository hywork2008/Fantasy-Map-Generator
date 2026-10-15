import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import JSZip from "jszip";
import { parseAuditOptions, runAudit } from "../../auditFmgCityContext";
import { readFmgArchive, sha256, type FmgArchive } from "../fmgArchiveReader";
import { buildCityAudit, type AuditOptions } from "./model";
import { csvString, jsonString } from "./output";
import {
  buildDirectionsGraphs,
  computeDirectionsForWorld,
  pickDefaultMode
} from "../../../src/services/travelDirectionsCore";
import type { PackedGraph } from "../../../src/types/PackedGraph";

const defaultOptions: AuditOptions = {
  burgIds: [1],
  all: false,
  distanceUnit: "km",
  travelMode: "auto",
  avoidSea: false,
  preferSea: false
};
function fixture(): FmgArchive {
  return {
    inputPath: "fixture.fmg",
    inputHash: "",
    manifest: {},
    presentation: {},
    entries: new Map(),
    world: {
      populationRate: 1000,
      urbanization: 1,
      distanceScale: 1,
      options: {},
      pack: {
        cells: {
          p: [
            [0, 0],
            [5, 0],
            [10, 0],
            [100, 0]
          ],
          h: [25, 25, 25, 25],
          burg: [1, 0, 2, 3],
          province: [1, 1, 2, 3]
        },
        burgs: [
          0,
          { i: 1, name: "Origin", cell: 0, x: 0, y: 0, state: 1, group: "town", citadel: 1, walls: 0 },
          { i: 2, name: 'Target,"A"\nLine', cell: 2, x: 10, y: 0, state: 2, group: "village", citadel: 0, walls: 1 },
          { i: 3, name: "Isolated", cell: 3, x: 100, y: 0, state: 0 }
        ],
        states: [
          { i: 0, name: "Independent" },
          { i: 1, name: "Home", diplomacy: ["Neutral", "x", "Enemy"] },
          { i: 2, name: "Foreign", diplomacy: ["Neutral", "Rival", "x"] }
        ],
        routes: [
          {
            i: 7,
            group: "roads",
            points: [
              [0, 0, 0],
              [5, 0, 1],
              [10, 0, 2]
            ]
          },
          {
            i: 8,
            group: "searoutes",
            points: [
              [0, 0, 0],
              [10, 0, 2]
            ]
          }
        ]
      }
    },
    simulation: {
      currentYear: 339,
      burgs: { 1: { population: 2.099, treasury: 5 }, 2: { population: 1.807 }, 3: {} },
      military: {
        1: [
          {
            i: 0,
            name: "Guard",
            cell: 0,
            x: 0,
            y: 0,
            bx: 5,
            by: 0,
            t: 100,
            a: 12,
            u: { infantry: 10, artillery: 2 },
            plannedU: { infantry: 30 },
            children: [{ i: 100, u: { infantry: 5 } }]
          }
        ]
      },
      extensions: { economy: { burgMarketLedgers: { 1: { burgId: 1, stock: 50 } } } }
    }
  };
}
function mutablePack(a: FmgArchive) {
  return a.world.pack as {
    burgs: Array<Record<string, unknown>>;
    routes: Array<Record<string, unknown>>;
    cells: Record<string, unknown>;
  };
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n" && !quoted) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  assert.equal(quoted, false);
  return rows;
}

async function zipFixture(directory: string, edit?: (zip: JSZip, manifest: Record<string, unknown>) => void) {
  const source = fixture();
  const zip = new JSZip();
  const burgColumn = new Uint16Array([1, 0, 2, 3]);
  const bytes = Buffer.from(burgColumn.buffer);
  mutablePack(source).cells.burg = { $typedArray: "typed-arrays/0.bin" };
  source.simulation.absent = { $undefined: true };
  const manifest = {
    format: "fantasy-map-generator",
    schemaVersion: 2,
    endian: "little",
    appVersion: "test",
    typedArrays: [
      { path: "typed-arrays/0.bin", type: "Uint16Array", byteLength: bytes.length, checksum: sha256(bytes) }
    ],
    opaqueExtensionChunks: []
  };
  zip.file("typed-arrays/0.bin", bytes);
  zip.file("map/world.json", JSON.stringify(source.world));
  zip.file("simulation/core.json", JSON.stringify(source.simulation));
  zip.file("presentation.json", "{}");
  edit?.(zip, manifest);
  zip.file("manifest.json", JSON.stringify(manifest));
  const file = path.join(directory, "fixture.fmg");
  await writeFile(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return file;
}
async function withTemp(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fmg-audit-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("extracts canonical population, fortifications, directional diplomacy, and independent land/sea connections", () => {
  const report = buildCityAudit(fixture(), defaultOptions);
  assert.equal(report.burgs[0].populationPersons, 2099);
  assert.equal(report.burgs[1].populationPersons, 1807);
  assert.equal(report.burgs[0].citadel, true);
  assert.equal(report.burgs[0].walls, false);
  assert.equal(report.connections.length, 2);
  assert.deepEqual(
    report.connections.map(c => c.routeGroup),
    ["roads", "searoutes"]
  );
  assert.equal(report.connections[0].relationRaw, "Enemy");
  assert.equal(report.connections[0].reverseRelationRaw, "Rival");
  assert.equal(report.connections[0].routeDistanceKm, 10);
  assert.equal(report.directions.length, 3); // pair cached across two routes
  assert.equal(report.burgs[0].groupRaw, "town");
  assert.equal((report.burgs[0].ceProjection as { scale: string }).scale, "village");
});

test("Directions core supports reusable graphs, all transport modes, and unavailable paths without global state", () => {
  const a = fixture();
  const pack = a.world.pack as unknown as PackedGraph;
  const ctx = { pack, distanceScale: 2, heightExponent: 1.8 };
  const graphs = buildDirectionsGraphs(pack);
  const result = computeDirectionsForWorld(ctx, 1, 2, { avoidSea: true }, graphs)!;
  assert.equal(result.mounted.available && result.mounted.route.distanceKm, 20);
  assert.equal(pickDefaultMode(result), "mounted");
  assert.deepEqual(computeDirectionsForWorld(ctx, 1, 3, false, graphs)?.foot, {
    available: false,
    reasonKey: "noRoute"
  });
  assert.equal(computeDirectionsForWorld(ctx, 99, 2), null);
  assert.deepEqual(computeDirectionsForWorld(ctx, 1, 1)?.foot, { available: false, reasonKey: "sameLocation" });
});

test("retains both legs when a route passes through an origin", () => {
  const a = fixture();
  const p = mutablePack(a);
  p.routes = [
    {
      i: 1,
      group: "trails",
      points: [
        [0, 0, 0],
        [5, 0, 1],
        [10, 0, 2],
        [100, 0, 3]
      ]
    }
  ];
  const r = buildCityAudit(a, { ...defaultOptions, burgIds: [2] });
  assert.deepEqual(r.connections.map(c => c.targetId).sort(), [1, 3]);
});

test("unknown population and flags remain null, conflicting ownership is visible, input is immutable", () => {
  const a = fixture();
  mutablePack(a).burgs[1].population = 99;
  const before = jsonString(a);
  const r = buildCityAudit(a, { ...defaultOptions, all: true, burgIds: [] });
  assert.equal(jsonString(a), before);
  assert.equal(r.burgs[0].populationPersons, 2099);
  assert.equal(r.burgs[2].populationPersons, null);
  assert.equal(r.burgs[2].walls, null);
  assert.ok(r.findings.some(f => f.ruleId === "DATA_OWNER_CONFLICT"));
  assert.ok(r.findings.some(f => f.ruleId === "DATA_VALUE_MISSING"));
});

test("legacy population fallback is labeled and state zero does not mean domestic", () => {
  const a = fixture();
  const p = mutablePack(a);
  p.burgs[1].state = 0;
  p.burgs[2].state = 0;
  p.burgs[1].population = 5;
  (a.simulation.burgs as Record<string, unknown>)[1] = {};
  const r = buildCityAudit(a, defaultOptions);
  assert.equal(r.burgs[0].populationPersons, 5000);
  assert.equal(r.burgs[0].populationSourceKind, "stored_legacy_fallback");
  assert.equal(r.connections[0].relationClass, "unknown");
  assert.equal(r.connections[0].isDomestic, false);
});

test("separates unknown physical units from preserved Directions numeric values", () => {
  const r = buildCityAudit(fixture(), { ...defaultOptions, distanceUnit: undefined, nearbyRadiusKm: 20 });
  assert.equal(r.connections[0].routeDistanceKm, null);
  assert.equal(r.connections[0].directionsDistanceValue, 10);
  assert.equal(r.connections[0].rawPathDistanceKm, null);
  assert.equal(r.nearby.length, 0);
  assert.ok(r.findings.some(f => f.ruleId === "NEARBY_UNIT_UNKNOWN" && f.status === "skipped"));
});

test("nearby includes an unconnected city without inventing a routed distance", () => {
  const r = buildCityAudit(fixture(), { ...defaultOptions, nearbyRadiusKm: 150 });
  const isolated = r.nearby.find(n => n.targetId === 3)!;
  assert.equal(isolated.straightDistanceKm, 100);
  assert.equal(isolated.routeDistanceKm, null);
  assert.ok(r.directions.filter(d => d.targetId === 3).every(d => d.status === "noRoute"));
  assert.equal(r.burgs.length, 3);
});

test("invalid route references disable Directions and are not silently repaired", () => {
  const a = fixture();
  (mutablePack(a).routes[0].points as number[][])[1][2] = 999;
  const r = buildCityAudit(a, defaultOptions);
  assert.ok(r.findings.some(f => f.ruleId === "DATA_REFERENCE_INVALID" && f.severity === "error"));
  assert.equal(r.connections[0].routeDistanceKm, null);
  assert.ok(r.directions.every(d => d.status === "invalid_input"));
});

test("missing/deleted/duplicate cities and dead ends are explicit", () => {
  const a = fixture();
  const p = mutablePack(a);
  p.burgs[2].removed = true;
  assert.throws(() => buildCityAudit(a, { ...defaultOptions, burgIds: [2] }), /missing or removed/);
  const r = buildCityAudit(a, defaultOptions);
  assert.ok(r.connections.every(c => c.pathStatus === "invalid_reference"));
  p.burgs[2].removed = false;
  p.burgs.push({ ...p.burgs[2] });
  assert.ok(buildCityAudit(a, defaultOptions).findings.some(f => f.message.includes("Duplicate burg")));
  const b = fixture();
  mutablePack(b).cells.burg = [1, 0, 0, 3];
  assert.ok(buildCityAudit(b, defaultOptions).connections.every(c => c.pathStatus === "terminal_without_burg"));
});

test("military units, planned units, base coordinates and child formations are not summed into soldiers", () => {
  const r = buildCityAudit(fixture(), defaultOptions);
  assert.equal(r.military.length, 2);
  assert.equal(r.military[1].amount, 2);
  assert.ok(r.military.every(m => m.manpowerPersons === null));
  assert.deepEqual(r.burgs[0].militarySameCellKeys, ["1:0"]);
  assert.deepEqual(JSON.parse(jsonString(r.burgs[0].militarySameCellUnitsRaw)), { infantry: 10, artillery: 2 });
  assert.deepEqual(r.military[0].sameCellBurgIds, [1]);
  assert.equal(r.military[0].baseX, 5);
  assert.equal(r.military[0].x, 0);
  assert.deepEqual(r.military[0].plannedUnits, { infantry: 30 });
  assert.deepEqual(r.burgs[0].burgMarketLedger, { burgId: 1, stock: 50 });
});

test("CSV round trips embedded quotes/newlines, null, zero, false and protects formulas", () => {
  const rows = parseCsv(
    csvString(
      [{ name: 'City,"Quoted"\nLine', n: 0, flag: false, missing: null, formula: "  =1+1", negative: -2 }],
      ["name", "n", "flag", "missing", "formula", "negative"]
    )
  );
  assert.deepEqual(rows[1], ['City,"Quoted"\nLine', "0", "false", "", "'  =1+1", "-2"]);
  const report = buildCityAudit(fixture(), defaultOptions);
  assert.equal(JSON.parse(jsonString(report)).connections[0].targetName, 'Target,"A"\nLine');
});

test("CLI rejects incompatible flags and invalid arguments", () => {
  assert.equal(parseAuditOptions(["--help"]), null);
  for (const args of [
    ["map.fmg"],
    ["map.fmg", "--output", "x", "--all", "--burg", "1"],
    ["map.fmg", "--output", "x", "--all", "--avoid-sea", "--prefer-sea"],
    ["map.fmg", "--output", "x", "--all", "--distance-unit", "bad"],
    ["map.fmg", "--output", "x", "--all", "--height-exponent", "6"],
    ["map.fmg", "--output", "x", "--burg", "1.1"]
  ]) {
    assert.throws(() => parseAuditOptions(args));
  }
});

test("archive reader restores typed arrays/special values, verifies checksums, and bounds decompression", async () =>
  withTemp(async dir => {
    const file = await zipFixture(dir);
    const a = await readFmgArchive(file);
    assert.ok(mutablePack(a).cells.burg instanceof Uint16Array);
    assert.equal(a.simulation.absent, undefined);
    assert.equal(a.inputHash, sha256(await readFile(file)));
    await zipFixture(dir, zip => zip.file("large.txt", "x".repeat(10000)));
    await assert.rejects(
      readFmgArchive(file, { maxBytes: (await readFile(file)).length + 1, maxEntries: 100 }),
      /Expanded archive exceeds/
    );
    await assert.rejects(readFmgArchive(file, { maxBytes: 1, maxEntries: 100 }), /exceeds/);
    await assert.rejects(readFmgArchive(file, { maxBytes: 100000, maxEntries: 1 }), /too many entries/);
    await zipFixture(dir, zip => zip.file("typed-arrays/0.bin", Buffer.alloc(8)));
    await assert.rejects(readFmgArchive(file), /checksum mismatch/);
  }));

test("rejects unsupported schema, absent typed chunks, unsafe paths and invalid array descriptors", async () =>
  withTemp(async dir => {
    for (const [edit, pattern] of [
      [
        (_z: JSZip, m: Record<string, unknown>) => {
          m.schemaVersion = 999;
        },
        /Unsupported/
      ],
      [
        (z: JSZip) => {
          z.remove("typed-arrays/0.bin");
        },
        /Invalid typed-array/
      ],
      [
        (z: JSZip) => {
          z.file("../escape.txt", "no");
        },
        /Unsafe archive/
      ],
      [
        (_z: JSZip, m: Record<string, unknown>) => {
          (m.typedArrays as Record<string, unknown>[])[0].type = "UnknownArray";
        },
        /Invalid typed-array/
      ]
    ] as const) {
      const file = await zipFixture(dir, edit);
      await assert.rejects(readFmgArchive(file), pattern);
    }
  }));

test("CLI writes complete JSON/CSV/raw files, preserves input, refuses overwrite and symlink output", async () =>
  withTemp(async dir => {
    const file = await zipFixture(dir);
    const before = sha256(await readFile(file));
    const out = path.join(dir, "report");
    const opts = parseAuditOptions([file, "--output", out, "--burg", "1", "--distance-unit", "km", "--expand"])!;
    assert.equal(await runAudit(opts), 0);
    const r = JSON.parse(await readFile(path.join(out, "report.json"), "utf8"));
    assert.equal(r.burgs[0].populationPersons, 2099);
    assert.ok((await readdir(out)).includes("connections.csv"));
    assert.equal(sha256(await readFile(file)), before);
    assert.equal(
      await readFile(path.join(out, "raw", "manifest.json"), "utf8"),
      JSON.stringify((await readFmgArchive(file)).manifest)
    );
    await assert.rejects(runAudit(opts), /new or empty/);
    const link = path.join(dir, "linked");
    await symlink(out, link);
    await assert.rejects(runAudit({ ...opts, output: link }), /symlink/);
  }));

test("exit 2 still publishes a reviewable report when integrity errors match fail-on", async () =>
  withTemp(async dir => {
    const file = await zipFixture(dir, z => {
      const f = fixture();
      mutablePack(f).routes[0].points = [
        [0, 0, 0],
        [1, 1, 999]
      ];
      z.file("map/world.json", JSON.stringify(f.world));
    });
    const opts = parseAuditOptions([
      file,
      "--output",
      path.join(dir, "errors"),
      "--burg",
      "1",
      "--distance-unit",
      "km"
    ])!;
    assert.equal(await runAudit(opts), 2);
    assert.ok((await readFile(path.join(opts.output, "summary.md"), "utf8")).includes("error="));
    assert.equal(await runAudit({ ...opts, output: path.join(dir, "ignored"), failOn: "never" }), 0);
  }));

test("existing extract:fmg CLI uses shared decoder and retains original expanded chunks", async () =>
  withTemp(async dir => {
    const file = await zipFixture(dir);
    const output = path.join(dir, "expanded");
    const text = execFileSync(
      process.execPath,
      ["--import", "tsx", "scripts/extractFmgArchive.ts", file, "--output", output, "--burg", "1"],
      { encoding: "utf8" }
    );
    assert.match(text, /schema 2/);
    const diagnostic = JSON.parse(text.slice(text.indexOf("{\n")));
    assert.equal(diagnostic.burg.simulation.population, 2.099);
    assert.equal(diagnostic.cell.burg, 1);
    assert.equal(diagnostic.cell.h, 25);
    const rawWorld = JSON.parse(await readFile(path.join(output, "map/world.json"), "utf8"));
    assert.deepEqual(rawWorld.pack.cells.burg, { $typedArray: "typed-arrays/0.bin" });
  }));

test("CSV-only and JSON-only output publish into existing empty directories", async () =>
  withTemp(async dir => {
    const file = await zipFixture(dir);
    for (const format of ["json", "csv"]) {
      const out = path.join(dir, format);
      await mkdir(out);
      const options = parseAuditOptions([file, "--output", out, "--all", "--distance-unit", "km", "--format", format])!;
      assert.equal(await runAudit(options), 0);
      const files = await readdir(out);
      assert.equal(files.includes("report.json"), format === "json");
      assert.equal(files.includes("burgs.csv"), format === "csv");
      assert.ok(files.includes("manifest.json"));
      assert.ok(files.includes("summary.md"));
    }
  }));
