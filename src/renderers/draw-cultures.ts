import { worldContext } from "../context/worldContext";
import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";

declare global {
  var drawCultures: () => void;
}

const culturesRenderer = (): void => {
  TIME && console.time("drawCultures");
  const { pack } = worldContext;
  const { cells, cultures } = pack;

  const bodyPaths = new Array(cultures.length - 1);
  const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
    pack,
    cellId => cells.culture[cellId],
    { fill: true, waterGap: true }
  );
  Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
    const color = cultures[+index].color ?? "#999";
    bodyPaths.push(getGappedFillPaths("culture", fill, waterGap, color, +index));
  });

  ensureEl("cults").innerHTML = bodyPaths.join("");

  TIME && console.timeEnd("drawCultures");
};

window.drawCultures = culturesRenderer;
