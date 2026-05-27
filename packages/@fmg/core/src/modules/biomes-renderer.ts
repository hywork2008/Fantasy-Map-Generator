import { getIsolines } from "@fmg/shared/pathUtils";

export function drawBiomesRenderer() {
  TIME && console.time("drawBiomes");

  const cells = pack.cells;
  const bodyPaths = new Array(biomesData.i.length - 1);
  const isolines = getIsolines(pack, cellId => cells.biome[cellId], {fill: true, waterGap: true}) as Record<
    string,
    {fill: unknown; waterGap: unknown}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap}]) => {
    const color = biomesData.color[index];
    bodyPaths.push(getGappedFillPaths("biome", fill, waterGap, color, index));
  });

  ensureEl("biomes").innerHTML = bodyPaths.join("");
  TIME && console.timeEnd("drawBiomes");
}

function getGappedFillPaths(elementName, fill, waterGap, color, index) {
  let html = "";
  if (fill) html += /* html */ `<path d="${fill}" fill="${color}" id="${elementName}${index}" />`;
  if (waterGap)
    html += /* html */ `<path d="${waterGap}" fill="none" stroke="${color}" stroke-width="3" id="${elementName}-gap${index}" />`;
  return html;
}
