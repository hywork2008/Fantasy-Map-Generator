import { getIsolines } from "@fmg/shared/pathUtils";

export function drawCulturesRenderer() {
  TIME && console.time("drawCultures");
  const {cells, cultures} = pack;

  const bodyPaths = new Array(cultures.length - 1);
  const isolines = getIsolines(pack, cellId => cells.culture[cellId], {fill: true, waterGap: true}) as Record<
    string,
    {fill: unknown; waterGap: unknown}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap}]) => {
    const color = cultures[index].color;
    bodyPaths.push(getGappedFillPaths("culture", fill, waterGap, color, index));
  });

  ensureEl("cults").innerHTML = bodyPaths.join("");

  TIME && console.timeEnd("drawCultures");
}

function getGappedFillPaths(elementName, fill, waterGap, color, index) {
  let html = "";
  if (fill) html += /* html */ `<path d="${fill}" fill="${color}" id="${elementName}${index}" />`;
  if (waterGap)
    html += /* html */ `<path d="${waterGap}" fill="none" stroke="${color}" stroke-width="3" id="${elementName}-gap${index}" />`;
  return html;
}
