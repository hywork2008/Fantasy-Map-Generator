import { worldContext } from "../context/worldContext";
import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";

export const drawReligions = (): void => {
  TIME && console.time("drawReligions");
  const { pack } = worldContext;
  const { cells, religions } = pack;

  const bodyPaths = new Array(religions.length - 1);
  const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
    pack,
    cellId => cells.religion[cellId],
    { fill: true, waterGap: true }
  );
  Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
    const color = religions[+index].color;
    bodyPaths.push(getGappedFillPaths("religion", fill, waterGap, color, +index));
  });

  ensureEl("relig").innerHTML = bodyPaths.join("");

  TIME && console.timeEnd("drawReligions");
};
