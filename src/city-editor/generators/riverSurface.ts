// Draw-time river and channel surfaces. Cell elevations stay as they are.
// A river is highest upstream, never rises downstream, and never stands above
// the land it touches. The drop is how far the surface sits below that land.

import type { CityDocument, Id, Point } from "../types/document";
import { faceLocator } from "./cellRelief";
import { nearestOnPolyline } from "./geom";
import { incidentFaces } from "./mesh";

/** Flat maps draw the river 1 m under the land. That is the shallow end. */
export const RIVER_DROP_MIN = 1;
/** Enough for an 8× relief on a large frame, and for a high FMG bank. */
export const RIVER_DROP_MAX = 4000;
const SAMPLE_METERS = 10;

export function riverDropMeters(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return RIVER_DROP_MIN;
  return Math.min(RIVER_DROP_MAX, Math.max(RIVER_DROP_MIN, Math.round(value)));
}

/** Slider max: the higher of the written land and the planned preset, so the far end puts the river at 0 m. */
export function riverDropUpperFor(document: CityDocument, plannedMeters = 0): number {
  let land = 0;
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land") continue;
    const elevation = face.properties.elevation;
    if (elevation > land) land = elevation;
  }
  const upper = Math.ceil(Math.max(land, plannedMeters, RIVER_DROP_MIN) - 1e-9);
  return Math.min(RIVER_DROP_MAX, Math.max(RIVER_DROP_MIN, upper));
}

interface Sample {
  point: Point;
  bank: number | null;
  sea: boolean;
}

interface Course {
  points: Point[];
  surface: number[];
  reach: number;
}

export interface TownWaterElevations {
  /** Absolute metres on a river centre line. Null away from every river. */
  riverAt(point: Point): number | null;
  /** One absolute level for a still channel. Null when no land bank is found. */
  channelAt(polygon: readonly Point[]): number | null;
}

/**
 * River and channel surfaces in absolute metres.
 * Along a river the next sample is included, so the surface is already down
 * at the lower bank before the mesh interpolates across that step.
 */
export function townWaterElevations(document: CityDocument, dropMeters?: number): TownWaterElevations {
  const drop = riverDropMeters(dropMeters);
  const locate = faceLocator(document);
  const landAt = (id: Id | null): number | null => {
    if (!id) return null;
    const face = document.mesh.faces[id];
    if (!face || face.properties.water !== "land" || !Number.isFinite(face.properties.elevation)) return null;
    return face.properties.elevation;
  };
  const banksAround = (point: Point, width: number): number | null => {
    let bank = Infinity;
    const consider = (id: Id | null) => {
      const elevation = landAt(id);
      if (elevation !== null && elevation < bank) bank = elevation;
    };
    consider(locate(point));
    const reach = Math.max(3, width / 2 + 2);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * i) / 4;
      consider(locate([point[0] + Math.cos(angle) * 2, point[1] + Math.sin(angle) * 2]));
      consider(locate([point[0] + Math.cos(angle) * reach, point[1] + Math.sin(angle) * reach]));
    }
    return Number.isFinite(bank) ? bank : null;
  };
  const meetsSea = (vertexId: Id): boolean =>
    incidentFaces(document.mesh, vertexId).some(
      face => face.properties.water !== "land" || face.properties.elevation <= 0
    );

  const courses: Course[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "river" || group.vertices.length < 2) continue;
    const width = Math.max(1, group.style.widthMeters);
    const vertices: Sample[] = [];
    for (const vertexId of group.vertices) {
      const point = document.mesh.vertices[vertexId]?.point;
      if (!point) continue;
      let bank = Infinity;
      for (const face of incidentFaces(document.mesh, vertexId)) {
        if (face.properties.water !== "land" || !Number.isFinite(face.properties.elevation)) continue;
        if (face.properties.elevation < bank) bank = face.properties.elevation;
      }
      const around = banksAround(point, width);
      if (around !== null && around < bank) bank = around;
      vertices.push({ point, bank: Number.isFinite(bank) ? bank : null, sea: meetsSea(vertexId) });
    }
    const samples: Sample[] = [];
    const push = (sample: Sample) => {
      const last = samples[samples.length - 1];
      if (last && Math.hypot(last.point[0] - sample.point[0], last.point[1] - sample.point[1]) < 0.5) {
        samples[samples.length - 1] = sample;
        return;
      }
      samples.push(sample);
    };
    for (let index = 0; index < vertices.length; index++) {
      const next = vertices[index];
      const previous = vertices[index - 1];
      if (previous) {
        const length = Math.hypot(next.point[0] - previous.point[0], next.point[1] - previous.point[1]);
        const steps = Math.floor(length / SAMPLE_METERS);
        for (let step = 1; step < steps; step++) {
          const t = step / steps;
          push({
            point: [
              previous.point[0] + (next.point[0] - previous.point[0]) * t,
              previous.point[1] + (next.point[1] - previous.point[1]) * t
            ],
            bank: banksAround(
              [
                previous.point[0] + (next.point[0] - previous.point[0]) * t,
                previous.point[1] + (next.point[1] - previous.point[1]) * t
              ],
              width
            ),
            sea: false
          });
        }
      }
      push(next);
    }
    const points: Point[] = [];
    const surface: number[] = [];
    let running: number | null = null;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      const level = (item: Sample, started: boolean): number | null => {
        if (item.sea && started) return 0;
        if (item.bank === null) return null;
        return Math.max(0, item.bank - drop);
      };
      const own = level(sample, running !== null);
      // One step ahead, skipping a sample that found no land, so the span
      // into a lower bank is already at that bank and cannot overtop it.
      let ahead: number | null = null;
      for (let next = index + 1; next < samples.length && next <= index + 2 && ahead === null; next++)
        ahead = level(samples[next], true);
      let target = own;
      if (ahead !== null) target = target === null ? ahead : Math.min(target, ahead);
      if (target === null && running === null) continue;
      let height: number = target === null ? running! : running === null ? target : Math.min(running, target);
      if (sample.bank !== null) height = Math.min(height, sample.bank);
      running = height;
      points.push(sample.point);
      surface.push(height);
    }
    if (points.length >= 2) courses.push({ points, surface, reach: width * 2 + 4 });
  }

  return {
    riverAt(point) {
      let best: { dist: number; height: number } | null = null;
      for (const course of courses) {
        const hit = nearestOnPolyline(point, course.points);
        if (hit.dist > course.reach) continue;
        if (best && hit.dist >= best.dist) continue;
        const from = course.surface[hit.segIndex];
        const to = course.surface[hit.segIndex + 1];
        best = { dist: hit.dist, height: from + (to - from) * hit.t };
      }
      return best ? best.height : null;
    },
    channelAt(polygon) {
      if (polygon.length < 3) return null;
      let cx = 0;
      let cy = 0;
      for (const point of polygon) {
        cx += point[0];
        cy += point[1];
      }
      cx /= polygon.length;
      cy /= polygon.length;
      let bank = Infinity;
      for (const point of polygon) {
        let dx = point[0] - cx;
        let dy = point[1] - cy;
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
        for (const distance of [1, 3, 6]) {
          const elevation = landAt(locate([point[0] + dx * distance, point[1] + dy * distance]));
          if (elevation !== null && elevation < bank) bank = elevation;
        }
      }
      return Number.isFinite(bank) ? Math.max(0, bank - drop) : null;
    }
  };
}
