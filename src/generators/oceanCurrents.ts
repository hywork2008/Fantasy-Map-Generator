import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { OceanCurrentConstants } from "../data/constants";
import type { WorldState } from "../types/WorldState";
import { lerp, minmax } from "../utils";
import { TIME } from "../utils/debug";

const HEIGHT_LAND_THRESHOLD = 20;

/**
 * Generates a rough, stylized approximation of surface ocean circulation on `grid.cells`
 * (not `pack.cells`): a per-cell current direction/speed field, plus a surface water
 * temperature field derived from advecting the latitude-baseline sea temperature along that
 * field. See `docs/simulation/ocean-currents.md` for the algorithm and its rationale.
 *
 * Deliberately built on `grid` rather than `pack`: `pack` thins open-ocean sample points
 * during `reGraph()`, leaving irregular, oversized cells far from any coast, while `grid`
 * keeps uniform density across the whole map (see `docs/plan/ocean-current-system-investigation.md`).
 * Consumers that need a value per `pack` cell look it up via `pack.cells.g[i]`, the same
 * pattern already used for `grid.cells.temp`/`grid.cells.prec`.
 */
class OceanCurrentsModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;

  public generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState
  ): void {
    TIME && console.time("OceanCurrents.generate");
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;

    const { grid, options } = state;
    const { cells, points } = grid;
    const n = cells.i.length;

    const currentAngle = new Uint16Array(n);
    const currentSpeed = new Uint8Array(n);
    const waterTemp = new Int8Array(n);

    // Land/lake cells carry no current, and mirror the already-computed air/sea-level
    // temperature so consumers get a sensible "surface temperature" everywhere.
    waterTemp.set(cells.temp);

    const isOceanCell = this.classifyOceanCells();
    const hasOcean = isOceanCell.some(Boolean);
    if (!hasOcean) {
      grid.cells.currentAngle = currentAngle;
      grid.cells.currentSpeed = currentSpeed;
      grid.cells.waterTemp = waterTemp;
      TIME && console.timeEnd("OceanCurrents.generate");
      return;
    }

    const { latN, latT } = this.worldContext.mapCoordinates;
    const { graphHeight } = this.worldContext;

    // Seed: wind-belt-driven vectors, matching the 6 latitude tiers `options.winds` already
    // exposes to the user (WorldConfiguratorDialog's globe widget) and that `generatePrecipitation()`
    // uses for the same tiering. This is the Ekman-transport-style approximation: currents start
    // out following the prevailing wind at their latitude.
    let vx = new Float32Array(n);
    let vy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (!isOceanCell[i]) continue;
      const latitude = latN! - (points[i][1] / graphHeight) * latT!;
      const tier = ((Math.abs(latitude - 89) / 30) | 0) as 0 | 1 | 2 | 3 | 4 | 5;
      const angleRad = (options.winds[tier] * Math.PI) / 180;
      vx[i] = Math.cos(angleRad) * OceanCurrentConstants.BASE_SPEED;
      vy[i] = Math.sin(angleRad) * OceanCurrentConstants.BASE_SPEED;
    }

    // Relax: deflect around land (cancel the component of each vector pointing into a land
    // neighbor, i.e. keep flow tangential to the coastline) and diffuse with ocean neighbors
    // to smooth the field. Repeated passes let the deflection propagate a few cells inland
    // from the coast, producing coastal boundary-current-like bends instead of a hard corner.
    for (let pass = 0; pass < OceanCurrentConstants.SMOOTHING_PASSES; pass++) {
      const nvx = new Float32Array(n);
      const nvy = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        if (!isOceanCell[i]) continue;
        let sumX = vx[i] * OceanCurrentConstants.SELF_WEIGHT;
        let sumY = vy[i] * OceanCurrentConstants.SELF_WEIGHT;
        let weight = OceanCurrentConstants.SELF_WEIGHT;

        for (const neighborId of cells.c[i]) {
          if (isOceanCell[neighborId]) {
            sumX += vx[neighborId];
            sumY += vy[neighborId];
            weight += 1;
            continue;
          }

          // Land (or a lake, which does not carry a current either): deflect by removing the
          // component of this cell's vector directed toward that neighbor.
          const dx = points[neighborId][0] - points[i][0];
          const dy = points[neighborId][1] - points[i][1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = dx / len;
          const ny = dy / len;
          const dot = vx[i] * nx + vy[i] * ny;
          if (dot > 0) {
            sumX -= dot * nx * OceanCurrentConstants.DEFLECT_WEIGHT;
            sumY -= dot * ny * OceanCurrentConstants.DEFLECT_WEIGHT;
          }
        }

        nvx[i] = sumX / weight;
        nvy[i] = sumY / weight;
      }

      vx = nvx;
      vy = nvy;
    }

    // Advect: carry the latitude-baseline sea temperature along the resolved current field so
    // warm equatorial water is pulled poleward and cold polar water is pulled equatorward,
    // matching how real boundary currents redistribute heat, without simulating heat transfer
    // physics. Faster currents mix more with their upstream neighbor per pass.
    let temp = Float32Array.from(cells.temp);
    for (let pass = 0; pass < OceanCurrentConstants.TEMP_ADVECTION_PASSES; pass++) {
      const next = temp.slice();

      for (let i = 0; i < n; i++) {
        if (!isOceanCell[i]) continue;
        let upstream = -1;
        let bestAlignment = 0;

        for (const neighborId of cells.c[i]) {
          if (!isOceanCell[neighborId]) continue;
          // Direction from the neighbor to this cell: positive alignment with this cell's
          // current means the water at `i` is arriving from `neighborId`.
          const dx = points[i][0] - points[neighborId][0];
          const dy = points[i][1] - points[neighborId][1];
          const len = Math.hypot(dx, dy) || 1;
          const alignment = (vx[i] * dx + vy[i] * dy) / len;
          if (alignment > bestAlignment) {
            bestAlignment = alignment;
            upstream = neighborId;
          }
        }

        if (upstream < 0) continue;
        const speed = Math.hypot(vx[i], vy[i]);
        const speedNorm = minmax(speed / OceanCurrentConstants.BASE_SPEED, 0, 1);
        const weight = OceanCurrentConstants.TEMP_ADVECTION_WEIGHT * speedNorm;
        next[i] = lerp(temp[i], temp[upstream], weight);
      }

      temp = next;
    }

    for (let i = 0; i < n; i++) {
      if (!isOceanCell[i]) continue;
      const speed = Math.hypot(vx[i], vy[i]);
      const angleDeg = (Math.atan2(vy[i], vx[i]) * 180) / Math.PI;
      currentAngle[i] = Math.round((angleDeg + 360) % 360);
      currentSpeed[i] = Math.round(minmax(speed, 0, 255));
      waterTemp[i] = Math.round(minmax(temp[i], -128, 127));
    }

    grid.cells.currentAngle = currentAngle;
    grid.cells.currentSpeed = currentSpeed;
    grid.cells.waterTemp = waterTemp;

    TIME && console.timeEnd("OceanCurrents.generate");
  }

  /** True for water cells belonging to an "ocean" feature — excludes land and lakes. */
  private classifyOceanCells(): Uint8Array {
    const { grid } = this.worldContext;
    const { cells, features } = grid;
    const n = cells.i.length;
    const isOceanCell = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      if (cells.h[i] >= HEIGHT_LAND_THRESHOLD) continue;
      const feature = features[cells.f[i]];
      if (feature && feature.type === "ocean") isOceanCell[i] = 1;
    }

    return isOceanCell;
  }
}

export const OceanCurrents = new OceanCurrentsModule();
