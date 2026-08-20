import { rn } from "../../hostUtils";
import { getDamSites, getDams, getDamsLayer } from "../economyContext";

const SIZE = 8;
const HALF = SIZE / 2;
const INACTIVE_OPACITY = 0.45;
const TRIAL_OPACITY = 0.7;

/**
 * Draws every dam at its real river site (damSites.ts/dams.ts), same "own SVG layer, emoji icon"
 * shape as drawFrontierFort() (no dedicated sprite). 🌊 marks a flood-control weir; a ⚡ badge is
 * added once the dam is electrified (hydroelectric). Trial dams are dimmed, inactive ones dimmer
 * still — same INACTIVE_OPACITY/EXHAUSTED_OPACITY idea as drawMineralDeposits.ts.
 * Design: docs/plan/dam-flood-control-and-hydropower.md §3.
 */
export function drawDams(): void {
  const layer = getDamsLayer();
  if (!layer) return;

  layer.html(buildDamsContent());
  layer.style("display", null);
}

function buildDamsContent(): string {
  const dams = getDams();
  if (!dams.length) return "";

  const sitesById = new Map(getDamSites().map(site => [site.i, site]));

  let html = "";
  for (const dam of dams) {
    const site = sitesById.get(dam.siteId);
    if (!site) continue;

    const opacity = !dam.active ? INACTIVE_OPACITY : dam.role === "trial" ? TRIAL_OPACITY : 1;
    const status = !dam.active ? "idle" : dam.role;
    const power = dam.electrified ? `, ${dam.generationCapacity} generation` : "";
    const title = `Dam — ${status}, ${rn(dam.floodProtectionRating * 100, 0)}% flood protection${power}`;
    const icon = dam.electrified ? "🌊⚡" : "🌊";

    html +=
      `<g data-i="${dam.i}" data-x="${site.x}" data-y="${site.y}" opacity="${opacity}">` +
      `<title>${title}</title>` +
      `<circle cx="${site.x}" cy="${site.y}" r="${HALF + 1}" fill="#2f6fa8" fill-opacity="0.25" stroke="#2f6fa8" stroke-width="0.5"/>` +
      `<text x="${site.x}" y="${rn(site.y + HALF / 2, 1)}" font-size="${SIZE}px" text-anchor="middle">${icon}</text>` +
      `</g>`;
  }
  return html;
}
