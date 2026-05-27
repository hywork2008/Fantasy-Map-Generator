import * as d3 from "d3";

export function drawStatesRenderer() {
  TIME && console.time("drawStates");
  const {cells, states} = pack;

  const maxLength = states.length - 1;
  const bodyPaths = new Array(maxLength);
  const clipPaths = new Array(maxLength);
  const haloPaths = new Array(maxLength);

  const renderHalo = shapeRendering.value === "geometricPrecision";
  const isolines = getIsolines(pack, cellId => cells.state[cellId], {fill: true, waterGap: true, halo: renderHalo}) as Record<
    string,
    {fill: unknown; waterGap: unknown; halo: unknown}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap, halo}]) => {
    const color = states[index].color;
    bodyPaths.push(getGappedFillPaths("state", fill, waterGap, color, index));

    if (renderHalo) {
      const haloColor = d3.color(color)?.darker().hex() || "#666666";
      clipPaths.push(/* html */ `<clipPath id="state-clip${index}"><use href="#state${index}"/></clipPath>`);
      haloPaths.push(
        /* html */ `<path id="state-border${index}" d="${halo}" clip-path="url(#state-clip${index})" stroke="${haloColor}"/>`
      );
    }
  });

  ensureEl("statesBody").innerHTML = bodyPaths.join("");
  ensureEl("statePaths").innerHTML = renderHalo ? clipPaths.join("") : "";
  ensureEl("statesHalo").innerHTML = renderHalo ? haloPaths.join("") : "";

  TIME && console.timeEnd("drawStates");
}

function getGappedFillPaths(elementName, fill, waterGap, color, index) {
  let html = "";
  if (fill) html += /* html */ `<path d="${fill}" fill="${color}" id="${elementName}${index}" />`;
  if (waterGap)
    html += /* html */ `<path d="${waterGap}" fill="none" stroke="${color}" stroke-width="3" id="${elementName}-gap${index}" />`;
  return html;
}
