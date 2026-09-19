/** Average residents per urban dwelling used by FMG and city generation. */
export const URBAN_DWELLING_SIZE = 4.5;

/** Required urban dwellings for an absolute (display) population. */
export function getUrbanDwellings(population: number): number {
  return Math.max(1, Math.ceil(Math.max(0, population) / URBAN_DWELLING_SIZE));
}
