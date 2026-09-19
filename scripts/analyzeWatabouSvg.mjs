#!/usr/bin/env node
/**
 * Inspect an SVG exported by watabou.github.io/city-generator.
 *
 * The export has no semantic metadata for population or the generator's
 * Voronoi sites. This script therefore reports only measurable values and a
 * clearly labelled population proxy:
 *
 *   - #A5A095 paths are the exported building roof faces;
 *   - population estimate = roof faces × residents per roof (default: 5);
 *   - the scale bar calibrates SVG pixels to metres.
 *
 * It intentionally does not call the roof count a Voronoi-cell count. The
 * Voronoi graph is flattened into paths by the exporter, so its site/cell count
 * cannot be recovered faithfully from a standalone SVG.
 *
 * Usage:
 *   node scripts/analyzeWatabouSvg.mjs temp/underwood_church.svg
 *   node scripts/analyzeWatabouSvg.mjs --residents-per-building 5 --json file.svg ...
 */

import fs from "node:fs";
import path from "node:path";

const ROOF_FILL = "#A5A095";
const SCALE_MARKER = 'fill="#FF0000" fill-opacity="0"';

function usage() {
  console.error("Usage: node scripts/analyzeWatabouSvg.mjs [--residents-per-building N] [--json] FILE.svg [...]");
}

function main(args) {
  let residentsPerBuilding = 5;
  let json = false;
  const files = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--residents-per-building") {
      residentsPerBuilding = Number(args[++i]);
      if (!Number.isFinite(residentsPerBuilding) || residentsPerBuilding <= 0) {
        throw new Error("--residents-per-building must be a positive number");
      }
    } else if (args[i] === "--json") {
      json = true;
    } else {
      files.push(args[i]);
    }
  }
  if (!files.length) {
    usage();
    process.exitCode = 1;
    return;
  }

  const reports = files.map(file => analyzeSvg(file, residentsPerBuilding));
  console.table(
    reports.map(report => ({
      file: path.basename(report.file),
      svgKiB: round(report.bytes / 1024, 1),
      canvasPx: `${round(report.canvas.widthPx, 1)} × ${round(report.canvas.heightPx, 1)}`,
      scale: `${round(report.scale.metresPerPixel, 3)} m/px`,
      mapMetres: `${round(report.map.widthMetres)} × ${round(report.map.heightMetres)}`,
      mapAreaKm2: round(report.map.areaSquareMetres / 1e6, 3),
      roofFaces: report.buildings.roofFaces,
      popProxy: Math.round(report.population.estimate),
      voronoiCells: "not in SVG"
    }))
  );
  if (reports.length > 1) {
    console.table(
      reports.slice(1).map((report, index) => {
        const previous = reports[index];
        return {
          transition: `${path.basename(previous.file)} → ${path.basename(report.file)}`,
          svgBytes: `${round(report.bytes / previous.bytes, 2)}×`,
          mapArea: `${round(report.map.areaSquareMetres / previous.map.areaSquareMetres, 2)}×`,
          roofFaces: `${round(report.buildings.roofFaces / previous.buildings.roofFaces, 2)}×`,
          popProxy: `${round(report.population.estimate / previous.population.estimate, 2)}×`
        };
      })
    );
  }
  console.log(`Population proxy uses ${residentsPerBuilding} residents per roof face; it is not source population.`);
  console.log("Voronoi sites/cells are not emitted as identifiable SVG elements, so they cannot be counted reliably.");
  if (json) console.log(JSON.stringify(reports, null, 2));
}

function analyzeSvg(file, residentsPerBuilding) {
  const svg = fs.readFileSync(file, "utf8");
  const canvas = parseCanvas(svg, file);
  const scale = parseScaleBar(svg, file);
  const roofFaces = countLiteral(svg, `fill="${ROOF_FILL}"`);
  const widthMetres = canvas.widthPx * scale.metresPerPixel;
  const heightMetres = canvas.heightPx * scale.metresPerPixel;

  return {
    file,
    bytes: Buffer.byteLength(svg),
    canvas,
    scale,
    map: {
      widthMetres,
      heightMetres,
      areaSquareMetres: widthMetres * heightMetres
    },
    buildings: {
      roofFaces,
      detection: `path fill ${ROOF_FILL}`
    },
    population: {
      residentsPerBuilding,
      estimate: roofFaces * residentsPerBuilding,
      method: "roof-face count × residents per roof face"
    },
    voronoi: {
      cellCount: null,
      reason: "Watabou's SVG flattens the generated geometry and does not retain Voronoi site/cell identifiers."
    }
  };
}

function parseCanvas(svg, file) {
  const root = svg.match(/<svg\b[^>]*\bwidth="([0-9.]+)(?:px)?"[^>]*\bheight="([0-9.]+)(?:px)?"/i);
  if (!root) throw new Error(`${file}: SVG width/height not found`);
  return { widthPx: Number(root[1]), heightPx: Number(root[2]) };
}

function parseScaleBar(svg, file) {
  const markerAt = svg.indexOf(SCALE_MARKER);
  if (markerAt < 0) throw new Error(`${file}: Watabou scale-bar marker not found`);
  const fragment = svg.slice(markerAt, markerAt + 1800);
  const line = fragment.match(/L\s*0,0\s*L\s*([0-9.]+),0/);
  if (!line) throw new Error(`${file}: scale-bar pixel length not found`);

  const labels = [...fragment.matchAll(/<text\b[^>]*>([0-9.]+|m)<\/text>/g)].map(match => match[1]);
  const unitAt = labels.lastIndexOf("m");
  const numericLabels = labels.slice(0, unitAt).map(Number).filter(Number.isFinite);
  const metres = Math.max(...numericLabels);
  if (!(metres > 0)) throw new Error(`${file}: scale-bar metre label not found`);

  const pixels = Number(line[1]);
  return { barPixels: pixels, barMetres: metres, metresPerPixel: metres / pixels };
}

function countLiteral(text, literal) {
  return text.split(literal).length - 1;
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
