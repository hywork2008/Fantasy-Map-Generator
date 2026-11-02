import type { Point } from "../../types/primitives";

/** Ground chunks for the freeform measurement. Editing rebuilds one of these, not the whole frame. */
export const FREEFORM_CHUNK_METERS = 64;

/** Distance from the view focus to the chunk centre. Past `MID`, the chunk steps by 4 m. */
export const FREEFORM_LOD_NEAR_METERS = 256;
export const FREEFORM_LOD_MID_METERS = 768;

export type LodStepMeters = 1 | 2 | 4;

export function lodStepMeters(distanceMeters: number): LodStepMeters {
  if (distanceMeters <= FREEFORM_LOD_NEAR_METERS) return 1;
  if (distanceMeters <= FREEFORM_LOD_MID_METERS) return 2;
  return 4;
}

export function samplesForStep(stepMeters: LodStepMeters, chunkMeters = FREEFORM_CHUNK_METERS): number {
  return Math.round(chunkMeters / stepMeters) + 1;
}

const indices = new Map<number, Uint32Array>();

/**
 * Shared triangle indices for an `samples` × `samples` lattice.
 * The first triangle of a cell winds so its normal points up (+Y) when Z is −plan Y.
 */
export function sharedChunkIndices(samples: number): Uint32Array {
  const cached = indices.get(samples);
  if (cached) return cached;
  const cells = samples - 1;
  const built = new Uint32Array(cells * cells * 6);
  let write = 0;
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < cells; column++) {
      const corner = row * samples + column;
      built[write++] = corner;
      built[write++] = corner + 1;
      built[write++] = corner + samples;
      built[write++] = corner + 1;
      built[write++] = corner + samples + 1;
      built[write++] = corner + samples;
    }
  }
  indices.set(samples, built);
  return built;
}

export interface ChunkAddress {
  column: number;
  row: number;
  origin: Point;
  stepMeters: LodStepMeters;
}

/** Covers a centred square. The lattice is a whole number of chunks, so it may extend past the frame. */
export function chunkLayout(extentMeters: number, focus: Point, chunkMeters = FREEFORM_CHUNK_METERS): ChunkAddress[] {
  const count = Math.max(1, Math.ceil(extentMeters / chunkMeters));
  const origin0 = -(count * chunkMeters) / 2;
  const chunks: ChunkAddress[] = [];
  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      const origin: Point = [origin0 + column * chunkMeters, origin0 + row * chunkMeters];
      const center: Point = [origin[0] + chunkMeters / 2, origin[1] + chunkMeters / 2];
      const distance = Math.hypot(center[0] - focus[0], center[1] - focus[1]);
      chunks.push({ column, row, origin, stepMeters: lodStepMeters(distance) });
    }
  }
  return chunks;
}

/** Positions in the city view: X is plan X, Y is height, Z is −plan Y. */
export function buildChunkPositions(
  origin: Point,
  stepMeters: number,
  heightAt: (point: Point) => number,
  chunkMeters = FREEFORM_CHUNK_METERS
): Float32Array {
  const samples = Math.round(chunkMeters / stepMeters) + 1;
  const positions = new Float32Array(samples * samples * 3);
  let vertex = 0;
  for (let row = 0; row < samples; row++) {
    const planY = origin[1] + row * stepMeters;
    for (let column = 0; column < samples; column++) {
      const planX = origin[0] + column * stepMeters;
      positions[vertex++] = planX;
      positions[vertex++] = heightAt([planX, planY]);
      positions[vertex++] = -planY;
    }
  }
  return positions;
}
