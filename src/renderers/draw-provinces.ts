import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { ensureEl, getGappedFillPaths, getIsolines } from "../utils";
import { TIME } from "../utils/debug";

export const drawProvinces = (
  worldContext: Readonly<WorldContext>,
  _viewContext: Readonly<ViewContext>,
  _appServices: AppServices
): void => {
  TIME && console.time("drawProvinces");
  const { pack } = worldContext;
  const { cells, provinces } = pack;

  const bodyPaths = new Array(provinces.length - 1);
  const isolines: Record<string, { fill?: string; waterGap?: string }> = getIsolines(
    pack,
    cellId => cells.province[cellId],
    { fill: true, waterGap: true }
  );
  Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
    const provinceColor = provinces[+index].color;
    bodyPaths.push(getGappedFillPaths("province", fill, waterGap, provinceColor, +index));
  });

  const labels = provinces
    .filter(p => p.i && !p.removed)
    .map(p => {
      const [x, y] = p.pole ?? cells.p[p.center];
      return `<text x="${x}" y="${y}" id="provinceLabel${p.i}">${p.name}</text>`;
    });

  ensureEl("provs").innerHTML = `
    <g id='provincesBody'>${bodyPaths.join("")}</g>
    <g id='provinceLabels'>${labels.join("")}</g>
  `;
  (ensureEl("provinceLabels") as HTMLElement).style.display =
    ensureEl("provs").dataset.labels === "1" ? "block" : "none";

  TIME && console.timeEnd("drawProvinces");
};
