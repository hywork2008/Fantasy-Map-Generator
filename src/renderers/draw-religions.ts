import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";

declare global {
  var drawReligions: () => void;
}

const religionsRenderer = (): void => {
  TIME && console.time("drawReligions");
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

window.drawReligions = religionsRenderer;
