import { color } from "d3";
import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";

declare global {
  var drawStates: () => void;
}

const statesRenderer = (): void => {
  TIME && console.time("drawStates");
  const { cells, states } = pack;

  const maxLength = states.length - 1;
  const bodyPaths = new Array(maxLength);
  const clipPaths = new Array(maxLength);
  const haloPaths = new Array(maxLength);

  const renderHalo = shapeRendering.value === "geometricPrecision";
  const isolines: Record<string, { fill?: string; waterGap?: string; halo?: string }> = getIsolines(
    pack,
    cellId => cells.state[cellId],
    { fill: true, waterGap: true, halo: renderHalo }
  );

  Object.entries(isolines).forEach(([index, { fill, waterGap, halo }]) => {
    const stateColor = states[+index].color ?? "#999";
    bodyPaths.push(getGappedFillPaths("state", fill, waterGap, stateColor, +index));

    if (renderHalo) {
      const haloColor = color(stateColor)?.darker().hex() ?? "#666666";
      clipPaths.push(`<clipPath id="state-clip${index}"><use href="#state${index}"/></clipPath>`);
      haloPaths.push(
        `<path id="state-border${index}" d="${halo}" clip-path="url(#state-clip${index})" stroke="${haloColor}"/>`
      );
    }
  });

  ensureEl("statesBody").innerHTML = bodyPaths.join("");
  ensureEl("statePaths").innerHTML = renderHalo ? clipPaths.join("") : "";
  ensureEl("statesHalo").innerHTML = renderHalo ? haloPaths.join("") : "";

  TIME && console.timeEnd("drawStates");
};

window.drawStates = statesRenderer;
