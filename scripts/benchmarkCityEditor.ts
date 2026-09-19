/** node --import tsx scripts/benchmarkCityEditor.ts --sizes=small,medium,large --timeout=30000 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";
import { createGridDocument, type CitySizePreset, type GridKind } from "../src/city-editor/core/document";
import {
  defaultGenerationSettings,
  generateCityOnDocument,
  generateStageOnDocument
} from "../src/city-editor/core/generate";
import type { GenerationSample } from "../src/city-editor/core/generationDiagnostics";
import { facePoints, validate } from "../src/city-editor/core/mesh";
import { polygonArea } from "../src/city-editor/core/gen/geom";
import { featureGroupVertices } from "../src/city-editor/core/features";
import { vertexHasCrossing } from "../src/city-editor/core/passages";
import type { CityDocument } from "../src/city-editor/core/types";
import { renderEditorSvg } from "../src/city-editor/render/svg";

const option = (name: string, fallback: string) =>
  process.argv
    .find(a => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? fallback;
const out = resolve(option("out", "/tmp/ce-phase1-benchmark"));
mkdirSync(out, { recursive: true });
const seed = option("seed", "phase1-reference");
const child = option("case", "");
if (!child) {
  const reports: unknown[] = [];
  for (const size of option("sizes", "small").split(","))
    for (const grid of option("grids", "hex,voronoi,evolution").split(",")) {
      for (const terrain of option("terrains", "inland,river,coast").split(",")) {
        const name = `${size}-${grid}-${terrain}`;
        const run = spawnSync(
          process.execPath,
          [...process.execArgv, process.argv[1], `--case=${name}`, `--out=${out}`, `--seed=${seed}`],
          {
            encoding: "utf8",
            timeout: Number(option("timeout", "30000")),
            maxBuffer: 1024 * 1024
          }
        );
        const report =
          run.status === 0
            ? JSON.parse(run.stdout)
            : {
                name,
                seed,
                status: run.error?.code === "ETIMEDOUT" ? "timeout" : "error",
                error: run.error?.message ?? run.stderr
              };
        reports.push(report);
        writeFileSync(resolve(out, "report.json"), JSON.stringify(reports, null, 2));
        console.log(name, report.status, report.generationMs ?? "");
      }
    }
} else {
  const [size, grid, terrain] = child.split("-");
  const dom = new JSDOM("<!doctype html><body></body>");
  Object.assign(globalThis, { document: dom.window.document });
  const css = readFileSync(resolve("src/city-editor/index.html"), "utf8").match(/<style>([\s\S]*?)<\/style>/)![1];
  const samples: GenerationSample[] = [];
  const capture = (document: CityDocument, label: string) => {
    const half = document.frame.extentMeters / 2;
    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      `${-half} ${-half} ${half * 2} ${half * 2}`,
      1,
      false,
      null,
      null,
      null,
      null,
      false,
      s => samples.push(s)
    );
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", "1000");
    svg.setAttribute("height", "1000");
    const style = dom.window.document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = css;
    svg.prepend(style);
    writeFileSync(resolve(out, `${child}-${label}.svg`), svg.outerHTML);
    return svg;
  };
  let start = performance.now();
  const input = createGridDocument({ size: size as CitySizePreset, grid: grid as GridKind, seed });
  const gridMs = performance.now() - start;
  const settings = defaultGenerationSettings();
  settings.config.coast = terrain === "coast" ? "straight" : "none";
  settings.config.rivers = terrain === "river" ? ["through"] : [];
  settings.config.features.port = terrain === "coast";
  // Diagnostic stages expose the unpolished geometry for visual comparison.
  for (const step of [3, 4, 5]) {
    const stage = generateStageOnDocument(input, settings, seed, step);
    if (stage) capture(stage, `stage-${step}`);
  }
  start = performance.now();
  const city = generateCityOnDocument(input, settings, seed, sample => {
    samples.push(sample);
    // Retain the last completed phase even when the parent times out this case.
    writeFileSync(resolve(out, `${child}-progress.json`), JSON.stringify(samples));
  });
  const generationMs = performance.now() - start;
  if (!city) {
    console.log(JSON.stringify({ name: child, seed, status: "generation-failed", gridMs, generationMs, samples }));
  } else {
    start = performance.now();
    const svg = capture(city, "complete");
    const renderMs = performance.now() - start;
    const builtFaces = Object.values(city.mesh.faces).filter(
      f => f.properties.buildable && f.properties.water === "land"
    );
    const occupied = new Set([...svg.querySelectorAll(".ce-building")].map(n => n.getAttribute("data-building-face")));
    const residential = builtFaces.filter(
      f =>
        f.properties.ward &&
        !["empty", "park"].includes(f.properties.ward) &&
        !city.elements.some(e => ["plaza", "temple"].includes(e.kind) && e.faceIds.includes(f.id))
    );
    const detours = city.featureGroups
      .filter(g => g.kind === "road")
      .map(g => {
        const points = featureGroupVertices(city, g).map(id => city.mesh.vertices[id].point);
        const length = points
          .slice(1)
          .reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
        const direct =
          points.length > 1 ? Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) : 0;
        return direct > 0 ? length / direct : null;
      })
      .filter((d): d is number => d !== null);
    console.log(
      JSON.stringify({
        name: child,
        seed,
        status: "complete",
        gridMs,
        generationMs,
        renderMs,
        faces: Object.keys(city.mesh.faces).length,
        edges: Object.keys(city.mesh.edges).length,
        buildings: svg.querySelectorAll(".ce-building").length,
        buildableArea: builtFaces.reduce((sum, f) => sum + Math.abs(polygonArea(facePoints(city.mesh, f))), 0),
        emptyResidentialFraction: residential.length
          ? residential.filter(f => !occupied.has(f.id)).length / residential.length
          : null,
        maxRoadDetour: detours.length ? Math.max(...detours) : null,
        gates: city.gates.length,
        connectedGates: city.gates.filter(g => vertexHasCrossing(city, g.vertexId, "wall", "road")).length,
        validation: validate(city),
        samples
      })
    );
  }
  dom.window.close();
}
