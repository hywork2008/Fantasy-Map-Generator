export function drawProvincesRenderer() {
  TIME && console.time("drawProvinces");
  const {cells, provinces} = pack;

  const bodyPaths = new Array(provinces.length - 1);
  const isolines = getIsolines(pack, cellId => cells.province[cellId], {fill: true, waterGap: true}) as Record<
    string,
    {fill?: string; waterGap?: string}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap}]) => {
    const color = provinces[index].color;
    bodyPaths.push(getGappedFillPaths("province", fill, waterGap, color, index));
  });

  const labels = provinces
    .filter(p => p.i && !p.removed)
    .map(p => {
      const [x, y] = p.pole || cells.p[p.center];
      return /* html */ `<text x="${x}" y="${y}" id="provinceLabel${p.i}">${p.name}</text>`;
    });

  ensureEl("provs").innerHTML = /* html */ `
    <g id='provincesBody'>${bodyPaths.join("")}</g>
    <g id='provinceLabels'>${labels.join("")}</g>
  `;
  ensureEl("provinceLabels").style.display = ensureEl("provs").dataset.labels === "1" ? "block" : "none";

  TIME && console.timeEnd("drawProvinces");
}

function getGappedFillPaths(elementName: string, fill?: string, waterGap?: string, color?: string, index?: string | number) {
  let html = "";
  if (fill) html += /* html */ `<path d="${fill}" fill="${color}" id="${elementName}${index}" />`;
  if (waterGap)
    html += /* html */ `<path d="${waterGap}" fill="none" stroke="${color}" stroke-width="3" id="${elementName}-gap${index}" />`;
  return html;
}
