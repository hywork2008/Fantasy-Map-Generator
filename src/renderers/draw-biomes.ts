import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";

export const drawBiomes = (
  worldContext: Readonly<WorldContext>,
  viewContext: Readonly<ViewContext>,
  _appServices: AppServices
): void => {
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
