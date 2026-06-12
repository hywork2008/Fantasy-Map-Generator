import { worldContext } from "../context/worldContext";
import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";

export const drawBiomes = (): void => {
  TIME && console.time("drawBiomes");

  const { pack, biomesData } = worldContext;
  const cells = pack.cells;
  const bodyPaths = new Array(biomesData.i.length - 1);
  const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
    pack,
    cellId => cells.biome[cellId],
    { fill: true, waterGap: true }
  );
  Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
    const color = biomesData.color[+index];
    bodyPaths.push(getGappedFillPaths("biome", fill, waterGap, color, +index));
  });

  ensureEl("biomes").innerHTML = bodyPaths.join("");

  TIME && console.timeEnd("drawBiomes");
};
