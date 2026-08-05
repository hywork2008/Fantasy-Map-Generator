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

    // Exposure: how much of each ocean cell's BFS neighborhood is open water vs. land, using the
    // same blocked-neighbor-ratio technique as FeatureModule.calculateEnclosure() (features.ts),
    // run on `grid` instead of `pack`. 1 = open ocean, 0 = fully enclosed (dead-end bay). Computed
    // once, upfront, so both the relaxation loop below and the final speed pass can use it.
    const openness = this.computeOpenness(isOceanCell);

    // Land distance: exact hop count to the nearest land/lake cell (capped at PIN_DISTANCE), via a
    // single multi-source BFS from every land cell at once — O(n), not O(n * radius) like
    // computeOpenness above, since we only need a threshold comparison, not a ratio. Drives which
    // cells are pinned to the seeded wind (§2's "free stream" far-field condition) vs. left free to
    // relax in the near-shore influence zone below.
    const landDistance = this.computeLandDistance(isOceanCell);

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

    // Relax: deflect around land and diffuse with ocean neighbors to smooth the field. Two
    // distinct, exposure-scaled mechanisms make the field respond to local coastline shape rather
    // than only to wind:
    //  - Reflection off land neighbors (mirror bounce, not a plain clip) injects a genuine
    //    perpendicular component, letting flow curve around a headland's tip over several passes.
    //  - Exit-funneling steers enclosed cells (bays, straits) toward whichever ocean neighbor is
    //    most open, i.e. toward the mouth/exit, instead of stalling into a vector-cancelling knot.
    // Cells at or beyond PIN_DISTANCE from any coast are pinned to the seeded wind every pass — a
    // "free stream" far-field boundary condition. Without it, a large open ocean has nothing
    // stable to relax toward, and reflection/funneling near one coast would (over enough passes)
    // eventually bleed all the way across to an unrelated coast on the far side of the same ocean.
    // Repeated passes let deflection propagate inland from the coast through the influence zone;
    // SMOOTHING_PASSES needs to be at least PIN_DISTANCE-sized for that propagation to actually
    // reach the edge of the zone (see SMOOTHING_PASSES's doc comment).
    for (let pass = 0; pass < OceanCurrentConstants.SMOOTHING_PASSES; pass++) {
      const nvx = new Float32Array(n);
      const nvy = new Float32Array(n);

      for (let i = 0; i < n; i++) {
        if (!isOceanCell[i]) continue;

        if (landDistance[i] >= OceanCurrentConstants.PIN_DISTANCE) {
          nvx[i] = vx[i];
          nvy[i] = vy[i];
          continue;
        }

        let sumX = vx[i] * OceanCurrentConstants.SELF_WEIGHT;
        let sumY = vy[i] * OceanCurrentConstants.SELF_WEIGHT;
        let weight = OceanCurrentConstants.SELF_WEIGHT;

        let openestNeighbor = -1;
        let openestNeighborValue = -1;

        // Reflections off every land neighbor are averaged, not summed, before folding into the
        // weighted blend below — a cell boxed in by several land neighbors at once must not have
        // each one's reflection stack additively (that would repeatedly re-inject the same vector's
        // magnitude and blow the field up over many passes); averaging keeps every reflected copy
        // the same magnitude as the cell's own current vector (mirror reflection is length-
        // preserving), so the whole weighted blend stays bounded by the field's existing scale.
        let reflectSumX = 0;
        let reflectSumY = 0;
        let reflectCount = 0;

        for (const neighborId of cells.c[i]) {
          if (isOceanCell[neighborId]) {
            sumX += vx[neighborId];
            sumY += vy[neighborId];
            weight += 1;
            if (openness[neighborId] > openestNeighborValue) {
              openestNeighborValue = openness[neighborId];
              openestNeighbor = neighborId;
            }
            continue;
          }

          // Land (or a lake, which does not carry a current either): mirror-reflect this cell's own
          // vector off the boundary toward that neighbor, instead of merely cancelling the
          // land-directed component.
          const dx = points[neighborId][0] - points[i][0];
          const dy = points[neighborId][1] - points[i][1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = dx / len;
          const ny = dy / len;
          const dot = vx[i] * nx + vy[i] * ny;
          if (dot > 0) {
            reflectSumX += vx[i] - 2 * dot * nx * OceanCurrentConstants.DEFLECT_WEIGHT;
            reflectSumY += vy[i] - 2 * dot * ny * OceanCurrentConstants.DEFLECT_WEIGHT;
            reflectCount++;
          }
        }

        if (reflectCount > 0) {
          sumX += reflectSumX / reflectCount;
          sumY += reflectSumY / reflectCount;
          weight += 1;
        }

        let bx = sumX / weight;
        let by = sumY / weight;

        // Exit-funneling: an enclosed cell's reflected vectors can partially cancel each other
        // out (e.g. land on three sides), leaving a weak, near-zero remainder — using that
        // collapsed magnitude as the funnel target would make funneling powerless to redirect
        // anything (a lerp toward a near-zero vector is still near zero). Instead, drive the
        // target's magnitude from the incoming vector this pass started from: water isn't created
        // by funneling, it's redirected from whatever was already flowing in. Steer that magnitude
        // toward the most open neighbor — the water's actual way out — scaled by how enclosed this
        // cell is, so open-ocean cells are left untouched.
        if (openestNeighbor >= 0 && openness[i] < OceanCurrentConstants.FUNNEL_OPENNESS_THRESHOLD) {
          const dx = points[openestNeighbor][0] - points[i][0];
          const dy = points[openestNeighbor][1] - points[i][1];
          const len = Math.hypot(dx, dy) || 1;
          const speedMag = Math.hypot(vx[i], vy[i]);
          const funnelWeight =
            OceanCurrentConstants.FUNNEL_STRENGTH * (1 - openness[i] / OceanCurrentConstants.FUNNEL_OPENNESS_THRESHOLD);
          const targetX = (dx / len) * speedMag;
          const targetY = (dy / len) * speedMag;
          bx += (targetX - bx) * funnelWeight;
          by += (targetY - by) * funnelWeight;
        }

        nvx[i] = bx;
        nvy[i] = by;
      }

      vx = nvx;
      vy = nvy;
    }

    // Damp: enclosed water (low openness) has little room for wind-driven flow to develop, so
    // scale speed down toward EXPOSURE_MIN_SPEED_FACTOR as openness approaches 0. Direction is
    // left untouched — only magnitude shrinks — so a dead-end bay reads as calm water rather than
    // a discontinuity in the field. Applied before advection so sluggish enclosed cells also mix
    // heat more slowly, consistent with their reduced flow.
    for (let i = 0; i < n; i++) {
      if (!isOceanCell[i]) continue;
      const factor = lerp(OceanCurrentConstants.EXPOSURE_MIN_SPEED_FACTOR, 1, openness[i]);
      vx[i] *= factor;
      vy[i] *= factor;
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

  /**
   * Scores how exposed to open water each ocean cell is (1 = open ocean, 0 = fully enclosed dead
   * end), via the same BFS blocked-neighbor-ratio technique as `FeatureModule.calculateEnclosure()`
   * (`features.ts`), run here on `grid.cells` instead of `pack.cells` so it can drive the
   * relaxation/damping steps above. For every ocean cell, flood-fills outward through ocean-only
   * neighbors up to `EXPOSURE_BFS_RADIUS` hops and tracks the fraction of neighbor lookups that
   * were blocked by land (or a lake, which does not carry a current either). A narrow bay or
   * strait quickly runs out of open water to expand into, so most lookups hit land and openness
   * stays low; open ocean keeps discovering new water cells, so it stays close to 1.
   * O(oceanCells * radius * avgDegree) — comparable cost to one relaxation pass.
   */
  private computeOpenness(isOceanCell: Uint8Array): Float32Array {
    const { grid } = this.worldContext;
    const { cells } = grid;
    const n = cells.i.length;
    const openness = new Float32Array(n);
    const visitedStamp = new Int32Array(n).fill(-1);

    for (let cellId = 0; cellId < n; cellId++) {
      if (!isOceanCell[cellId]) continue;

      let frontier = [cellId];
      visitedStamp[cellId] = cellId;
      let blocked = 0;
      let total = 0;

      for (let depth = 0; depth < OceanCurrentConstants.EXPOSURE_BFS_RADIUS && frontier.length; depth++) {
        const nextFrontier: number[] = [];

        for (const currentId of frontier) {
          for (const neighborId of cells.c[currentId]) {
            total++;
            if (!isOceanCell[neighborId]) {
              blocked++;
            } else if (visitedStamp[neighborId] !== cellId) {
              visitedStamp[neighborId] = cellId;
              nextFrontier.push(neighborId);
            }
          }
        }

        frontier = nextFrontier;
      }

      openness[cellId] = total > 0 ? 1 - blocked / total : 1;
    }

    return openness;
  }

  /**
   * Exact hop distance from every ocean cell to the nearest land/lake cell, capped at
   * `PIN_DISTANCE` (cells farther than that only ever need to be known as "at least
   * PIN_DISTANCE," never their precise distance). A single multi-source BFS seeded from every
   * land/lake cell at once — O(n) total, since each cell is enqueued and its neighbors scanned
   * exactly once, unlike computeOpenness's per-cell bounded BFS above (which needs a ratio, not
   * just a threshold, so it re-explores around every ocean cell individually).
   */
  private computeLandDistance(isOceanCell: Uint8Array): Int32Array {
    const { grid } = this.worldContext;
    const { cells } = grid;
    const n = cells.i.length;
    const cap = OceanCurrentConstants.PIN_DISTANCE;
    const distance = new Int32Array(n).fill(-1);
    const queue: number[] = [];

    for (let i = 0; i < n; i++) {
      if (!isOceanCell[i]) {
        distance[i] = 0;
        queue.push(i);
      }
    }

    let head = 0;
    while (head < queue.length) {
      const cellId = queue[head++];
      const nextDistance = distance[cellId] + 1;
      if (nextDistance > cap) continue;

      for (const neighborId of cells.c[cellId]) {
        if (distance[neighborId] !== -1) continue;
        distance[neighborId] = nextDistance;
        queue.push(neighborId);
      }
    }

    // Ocean cells the BFS never reached within `cap` hops (deep open ocean) are at least that far.
    for (let i = 0; i < n; i++) {
      if (isOceanCell[i] && distance[i] === -1) distance[i] = cap;
    }

    return distance;
  }
}

export const OceanCurrents = new OceanCurrentsModule();
