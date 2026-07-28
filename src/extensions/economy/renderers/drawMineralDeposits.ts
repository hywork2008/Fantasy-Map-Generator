import { rn, TIME } from "../../hostUtils";
import {
  getGoods,
  getMineOperations,
  getMineralDeposits,
  getMineralDepositsLayer,
  getWorldContext
} from "../economyContext";

const SIZE = 7;
const HALF = SIZE / 2;
const RING_RADIUS = HALF + 1;
const EXHAUSTED_OPACITY = 0.35;
const INACTIVE_OPACITY = 0.6;

/**
 * Draws discovered mineral deposits at their real geological cell (mineralResources.ts),
 * so the map's mining iconography stops being decoupled from where mine production
 * actually happens (docs/plan/mineral-resource-circulation-fixes.md Fix 3). Undiscovered
 * deposits are intentionally omitted — discovery is what "Prospect mines" is for.
 */
export function drawMineralDeposits(): void {
  TIME && console.time("drawMineralDeposits");
  const layer = getMineralDepositsLayer();
  if (!layer) return;

  layer.html(buildMineralDepositsContent());
  layer.style("display", null);
  TIME && console.timeEnd("drawMineralDeposits");
}

function buildMineralDepositsContent(): string {
  const deposits = getMineralDeposits();
  if (!deposits.length) return "";

  const { cells } = getWorldContext().pack;
  const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
  const operationByDeposit = new Map(getMineOperations().map(operation => [operation.depositId, operation]));

  let html = "";
  for (const deposit of deposits) {
    if (!deposit.discovered) continue;
    const good = goodsByName.get(deposit.primaryCommodity);
    if (!good) continue;

    const point = cells.p[deposit.cell];
    if (!point) continue;
    const [x, y] = point;

    const operation = operationByDeposit.get(deposit.i);
    const opacity = deposit.exhausted ? EXHAUSTED_OPACITY : operation?.active ? 1 : INACTIVE_OPACITY;
    const status = deposit.exhausted ? "exhausted" : operation?.active ? "active" : "inactive";
    const commodities = deposit.commodities.join(", ");
    const title = `${good.name} deposit (${commodities}) — ${deposit.depth}, richness ${deposit.richness}/5, ${status}`;

    html +=
      `<g data-i="${deposit.i}" data-x="${rn(x, 1)}" data-y="${rn(y, 1)}" opacity="${opacity}">` +
      `<title>${title}</title>` +
      `<circle cx="${x}" cy="${y}" r="${RING_RADIUS}" fill="${good.color}" fill-opacity="0.25" stroke="${good.color}" stroke-width="0.5"/>` +
      `<use href="#${good.icon}" x="${rn(x - HALF, 1)}" y="${rn(y - HALF, 1)}" width="${SIZE}" height="${SIZE}"/>` +
      `</g>`;
  }
  return html;
}
