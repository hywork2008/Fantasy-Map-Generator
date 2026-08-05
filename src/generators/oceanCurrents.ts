import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { FluidSolverConstants, OceanCurrentConstants } from "../data/constants";
import type { WorldState } from "../types/WorldState";
import { lerp, minmax } from "../utils";
import { TIME } from "../utils/debug";
import { createLattice, run } from "./fluidSolver";

const HEIGHT_LAND_THRESHOLD = 20;

/**
 * Generates surface ocean circulation on `grid.cells` (not `pack.cells`): a per-cell current
 * direction/speed field, plus a surface water temperature field derived from advecting the
 * latitude-baseline sea temperature along that field. See `docs/simulation/ocean-currents.md`
 * for the full algorithm and its rationale.
 *
 * The current/speed field is produced by a real D2Q9 Lattice Boltzmann fluid solve
 * (`src/generators/fluidSolver.ts`): land/lake cells are bounce-back obstacles and the
 * latitude-tier prevailing wind (`options.winds`) is a standing body force applied every
 * iteration. Because a bounce-back boundary can never absorb or destroy fluid, mass conservation
 * forces a current blocked head-on by land to redirect tangentially and *keep flowing along the
 * coast* instead of dissipating at the point of impact — a genuine boundary-current mechanism
 * (Gulf Stream/Kuroshio-like), not a heuristic. There is deliberately no "far field pin" resetting
 * distant cells back to the seeded wind (the previous heuristic's limiting factor): every cell,
 * however far from shore, is governed by the same collision+streaming+forcing rule every
 * iteration, so a bend can propagate along the entire length of a coastline given enough
 * iterations (`FluidSolverConstants.ITERATIONS_FULL_GENERATION`/`ITERATIONS_LIVE_RECOMPUTE`).
 *
 * Deliberately built on `grid` rather than `pack`: `pack` thins open-ocean sample points
 * during `reGraph()`, leaving irregular, oversized cells far from any coast, while `grid`
 * keeps uniform density across the whole map (see `docs/plan/ocean-current-system-investigation.md`).
 * This uniform density is also what makes `grid` usable directly as the solver's raster lattice —
 * `grid.cells` are laid out in exact row-major `cellsX * cellsY` order by construction
 * (`src/utils/graphUtils.ts`'s `placePoints()`/`getJitteredGrid()`), the same invariant
 * `generatePrecipitation()`'s row/column scans already rely on — so no separate lattice
 * resolution or resampling step is needed: lattice index `i` corresponds exactly to
 * `grid.cells` index `i`.
 *
 * Consumers that need a value per `pack` cell look it up via `pack.cells.g[i]`, the same
 * pattern already used for `grid.cells.temp`/`grid.cells.prec`.
 *
 * Also derives `grid.cells.ambientCurrentSpeed` (`computeAmbientCurrentSpeed()`) — `currentSpeed`
 * smoothed across nearby ocean cells so a coastal cell reflects the speed a short distance
 * offshore instead of the near-zero value the solve's no-slip boundary layer gives almost every
 * shoreline cell regardless of how sheltered it actually is. Used by the `"oceanCurrentsAmbient"`
 * enclosure calculation mode (`FeatureModule.applyOceanCurrentEnclosure()`).
 *
 * Disclosed simplifications: the solver's boundary condition is periodic on both axes (the map
 * wraps for flow purposes only — a standard, well-behaved LBM boundary treatment, not a physics
 * shortcut); wind itself stays the flat, user-configurable `options.winds` latitude belts (no
 * heightmap-driven wind simulation); lakes carry no current, matching upstream behavior; and
 * Coriolis-driven gyres / thermohaline circulation remain out of scope.
 */
class OceanCurrentsModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;

  public generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState,
    iterationTier: "full" | "live" = "full"
  ): void {
    TIME && console.time("OceanCurrents.generate");
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;

    const { grid, options } = state;
    const { cells, points, cellsX, cellsY } = grid;
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
      grid.cells.ambientCurrentSpeed = new Uint8Array(n);
      TIME && console.timeEnd("OceanCurrents.generate");
      return;
    }

    const { latN, latT } = this.worldContext.mapCoordinates;
    const { graphHeight } = this.worldContext;

    // Lattice: matches grid's own cellsX*cellsY raster layout 1:1 (see class doc comment).
    const lattice = createLattice(cellsX, cellsY);

    // Obstacle field: every non-ocean cell (land or lake) is a solid bounce-back boundary. This
    // is the entire "land shape deflects current" mechanism — no separate exposure/openness BFS
    // heuristic is needed, the solver's own mass conservation does the work.
    for (let i = 0; i < n; i++) {
      if (!isOceanCell[i]) lattice.obstacle[i] = 1;
    }

    // Forcing: latitude-tier prevailing wind (options.winds), applied as a standing body force
    // every iteration (not a one-time seed) so the solve can organize coherent large-scale
    // circulation — including along-shore boundary currents — instead of only perturbing a fixed
    // starting field. Same 6-tier latitude lookup generatePrecipitation() uses for the same
    // wind belts.
    for (let i = 0; i < n; i++) {
      if (!isOceanCell[i]) continue;
      const latitude = latN! - (points[i][1] / graphHeight) * latT!;
      const tier = ((Math.abs(latitude - 89) / 30) | 0) as 0 | 1 | 2 | 3 | 4 | 5;
      const angleRad = (options.winds[tier] * Math.PI) / 180;
      lattice.forceX[i] = Math.cos(angleRad) * OceanCurrentConstants.WIND_FORCE_MAGNITUDE;
      lattice.forceY[i] = Math.sin(angleRad) * OceanCurrentConstants.WIND_FORCE_MAGNITUDE;
    }

    const iterations =
      iterationTier === "live"
        ? FluidSolverConstants.ITERATIONS_LIVE_RECOMPUTE
        : FluidSolverConstants.ITERATIONS_FULL_GENERATION;
    run(lattice, iterations, FluidSolverConstants.RELAXATION_TIME, OceanCurrentConstants.DRAG_COEFFICIENT);

    // Convert the solver's internal lattice-unit velocity into the app's 0-255-ish speed scale
    // (the same scale the previous heuristic's BASE_SPEED-seeded vectors already used, so
    // TEMP_ADVECTION_WEIGHT/BASE_SPEED normalization below needs no changes).
    const speedScale = OceanCurrentConstants.BASE_SPEED / OceanCurrentConstants.LATTICE_SPEED_REFERENCE;
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (!isOceanCell[i]) continue;
      vx[i] = lattice.ux[i] * speedScale;
      vy[i] = lattice.uy[i] * speedScale;
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
    grid.cells.ambientCurrentSpeed = this.computeAmbientCurrentSpeed(currentSpeed, isOceanCell);

    TIME && console.timeEnd("OceanCurrents.generate");
  }

  /**
   * Derives `grid.cells.ambientCurrentSpeed` from `currentSpeed` by repeatedly averaging each
   * ocean cell toward the mean of itself and its ocean-only neighbors
   * (`OceanCurrentConstants.AMBIENT_SMOOTHING_PASSES` passes; land/lake neighbors are excluded,
   * so the average never leaks across the coastline). `currentSpeed` alone reads near-zero on
   * almost every cell touching land — a sheltered bay and an exposed straight coastline look
   * identical there, since it's the LBM solve's no-slip boundary layer, not a measure of
   * shelter. A few passes of this diffusion let a cell "see" the speed a short distance
   * offshore: still low deep inside a genuinely enclosed bay (whose neighbors are also slow),
   * picked back up within a couple of hops on an open coast (whose neighbors are fast). See
   * `docs/simulation/ocean-currents.md` §6.
   */
  private computeAmbientCurrentSpeed(currentSpeed: Uint8Array, isOceanCell: Uint8Array): Uint8Array {
    const { cells } = this.worldContext.grid;
    const n = cells.i.length;
    let ambient = Float32Array.from(currentSpeed);

    for (let pass = 0; pass < OceanCurrentConstants.AMBIENT_SMOOTHING_PASSES; pass++) {
      const next = ambient.slice();

      for (let i = 0; i < n; i++) {
        if (!isOceanCell[i]) continue;

        let sum = ambient[i];
        let count = 1;
        for (const neighborId of cells.c[i]) {
          if (!isOceanCell[neighborId]) continue;
          sum += ambient[neighborId];
          count++;
        }
        next[i] = sum / count;
      }

      ambient = next;
    }

    return Uint8Array.from(ambient, value => Math.round(minmax(value, 0, 255)));
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
