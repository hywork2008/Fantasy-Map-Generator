import type { WorldContext } from "../context/worldContext";
import { getEarthCoordinatesAtMapPoint } from "../data/earthConfig";
import { optionsStore } from "../state/optionsStore";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { getPrecipitationDailyScores, PRECIPITATION_MODEL_VERSION } from "../utils/precipitationSeasonality";
import { climateDeltaX, climateNeighbors, ensureClimateGeography, geographyKey } from "./cellClimateGeography";
import { ensureCellWindClimate } from "./cellWindClimate";

interface MoisturePaths {
  key: string;
  supply: Float32Array;
  terrain: Float32Array;
  confidence: Float32Array;
}
export interface CellPrecipitationClimate {
  key: string;
  dailyScores: Float32Array;
  confidence: Float32Array;
  monthlyMoistureSupply: Float32Array;
  outsideEarthlikeTilt: boolean;
}
const pathsCache = new WeakMap<WorldContext, MoisturePaths>();
const cache = new WeakMap<WorldContext, CellPrecipitationClimate>();
const REACH_KM = 1500;

/** Eight upwind paths, rebuilt only for geography / physical scale edits. Lakes never supply ocean moisture. */
function ensurePaths(world: WorldContext): MoisturePaths {
  const exponent = normalizeHeightExponent(optionsStore.getState().heightExponent);
  const key = `${geographyKey(world)}:${world.distanceScale}:${exponent}`;
  const old = pathsCache.get(world);
  if (old?.key === key) return old;
  const { grid } = world;
  const n = grid.cells.i.length;
  const supply = new Float32Array(n * 8);
  const terrain = new Float32Array(n * 8).fill(1);
  const confidence = new Float32Array(n * 8);
  const meters = Float32Array.from(grid.cells.h ?? new Uint8Array(n), h => heightToMeters(h, exponent));
  const ocean = (i: number) => grid.cells.h?.[i] < 20 && grid.features?.[grid.cells.f?.[i]]?.type === "ocean";
  const scale = world.distanceScale;
  const visited = new Int32Array(n);
  let pathId = 0;
  if (scale > 0 && grid.cells.c && grid.features?.some(f => f?.type === "ocean")) {
    for (let start = 0; start < n; start++)
      for (let direction = 0; direction < 8; direction++) {
        const index = start * 8 + direction;
        const dx = Math.cos((direction * Math.PI) / 4);
        const dy = Math.sin((direction * Math.PI) / 4);
        let cell = start,
          distance = 0,
          highest = meters[start];
        pathId++;
        visited[cell] = pathId;
        for (let step = 0; step < 96; step++) {
          if (ocean(cell)) {
            supply[index] = Math.exp(-distance / 750) * Math.exp(-Math.max(0, highest - meters[start]) / 2000);
            confidence[index] = 1;
            break;
          }
          let best = -1,
            bestDot = 0.5,
            length = 0;
          const neighbors = climateNeighbors(world, cell);
          for (const other of neighbors) {
            if (visited[other] === pathId || !grid.points[other]) continue;
            const x = climateDeltaX(world, grid.points[other][0] - grid.points[cell][0]);
            const y = grid.points[other][1] - grid.points[cell][1];
            const len = Math.hypot(x, y);
            const dot = len > 0 ? (dx * x + dy * y) / len : 0;
            if (dot > bestDot) {
              best = other;
              bestDot = dot;
              length = len;
            }
          }
          if (best < 0) break; // Unknown territory, not an ocean or a dry confirmed path.
          distance += length * scale;
          if (distance >= REACH_KM) {
            confidence[index] = 1;
            break;
          }
          if (step === 0)
            terrain[index] = Math.exp(Math.max(-0.69, Math.min(0.69, (meters[start] - meters[best]) / 1200)));
          highest = Math.max(highest, meters[best]);
          visited[best] = pathId;
          cell = best;
        }
      }
  }
  const result = { key, supply, terrain, confidence };
  pathsCache.set(world, result);
  return result;
}

/** Runtime-only normals. No random draws, monthly anomalies, or writes to annual generation outputs. */
export function ensureCellPrecipitationClimate(world: WorldContext): CellPrecipitationClimate {
  const paths = ensurePaths(world);
  const wind = ensureCellWindClimate(world);
  const key = `${PRECIPITATION_MODEL_VERSION}:${paths.key}:${wind.key}`;
  const old = cache.get(world);
  if (old?.key === key) return old;
  const n = world.grid.cells.i.length;
  const dailyScores = new Float32Array(n * 12);
  const monthlyMoistureSupply = new Float32Array(n * 12);
  const confidence = new Float32Array(n);
  const geography = ensureClimateGeography(world);
  for (let cell = 0; cell < n; cell++) {
    const moisture = new Float64Array(12),
      terrain = new Float64Array(12);
    let q = 1;
    for (let m = 0; m < 12; m++) {
      const index = cell * 12 + m;
      const u = wind.u[index],
        v = wind.v[index];
      let pathConfidence = 0;
      if (Math.hypot(u, v) < 1e-6) {
        for (let d = 0; d < 8; d++) {
          moisture[m] += paths.supply[cell * 8 + d] / 8;
          terrain[m] += paths.terrain[cell * 8 + d] / 8;
          pathConfidence += paths.confidence[cell * 8 + d] / 8;
        }
      } else {
        // Wind blows east/north; its upwind direction in screen space is west/south.
        const direction = ((Math.atan2(v, -u) * 4) / Math.PI + 8) % 8;
        const lo = Math.floor(direction),
          t = direction - lo;
        for (const [d, weight] of [
          [lo, 1 - t],
          [(lo + 1) % 8, t]
        ]) {
          moisture[m] += paths.supply[cell * 8 + d] * weight;
          terrain[m] += paths.terrain[cell * 8 + d] * weight;
          pathConfidence += paths.confidence[cell * 8 + d] * weight;
        }
      }
      const speed = Math.hypot(u, v);
      if (speed >= 1e-6 && speed < 0.5) {
        // Fade direction out near calm: tiny component errors must not select a different wet season.
        const directional = speed / 0.5;
        let meanSupply = 0,
          meanTerrain = 0,
          meanConfidence = 0;
        for (let d = 0; d < 8; d++) {
          meanSupply += paths.supply[cell * 8 + d] / 8;
          meanTerrain += paths.terrain[cell * 8 + d] / 8;
          meanConfidence += paths.confidence[cell * 8 + d] / 8;
        }
        moisture[m] = directional * moisture[m] + (1 - directional) * meanSupply;
        terrain[m] = directional * terrain[m] + (1 - directional) * meanTerrain;
        pathConfidence = directional * pathConfidence + (1 - directional) * meanConfidence;
      }
      q = Math.min(q, pathConfidence);
      monthlyMoistureSupply[index] = moisture[m];
    }
    confidence[cell] =
      q *
      wind.monsoonConfidence[cell] *
      Math.min(1, 250 / Math.max(1, (world.grid.spacing ?? 1) * world.distanceScale));
    const coordinates = getEarthCoordinatesAtMapPoint(world, world.grid.points[cell]);
    dailyScores.set(
      getPrecipitationDailyScores({
        latitudeDeg: coordinates?.latitude ?? 0,
        axialTiltDeg: world.options.axialTilt ?? 23.5,
        continentality: geography.continentality[cell],
        landFraction: wind.landFraction[cell],
        moisture,
        orographic: terrain
      }),
      cell * 12
    );
  }
  const result = {
    key,
    dailyScores,
    confidence,
    monthlyMoistureSupply,
    outsideEarthlikeTilt: Math.abs(world.options.axialTilt) > 45
  };
  cache.set(world, result);
  return result;
}
