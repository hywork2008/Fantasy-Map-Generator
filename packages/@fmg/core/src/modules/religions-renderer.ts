import { getIsolines } from "@fmg/shared/pathUtils";

export function drawReligionsRenderer() {
  TIME && console.time("drawReligions");
  const {cells, religions} = pack;

  const bodyPaths = new Array(religions.length - 1);
  const isolines = getIsolines(pack, cellId => cells.religion[cellId], {fill: true, waterGap: true}) as Record<
    string,
    {fill: unknown; waterGap: unknown}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap}]) => {
    const color = religions[index].color;
    bodyPaths.push(getGappedFillPaths("religion", fill, waterGap, color, index));
  });

  ensureEl("relig").innerHTML = bodyPaths.join("");

  TIME && console.timeEnd("drawReligions");
}

function getGappedFillPaths(elementName, fill, waterGap, color, index) {
  let html = "";
  if (fill) html += /* html */ `<path d="${fill}" fill="${color}" id="${elementName}${index}" />`;
  if (waterGap)
    html += /* html */ `<path d="${waterGap}" fill="none" stroke="${color}" stroke-width="3" id="${elementName}-gap${index}" />`;
  return html;
}
