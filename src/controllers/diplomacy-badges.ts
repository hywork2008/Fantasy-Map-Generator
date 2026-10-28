import { arc, interpolateLab, select } from "d3";
import { worldContext } from "../context/worldContext";
import { selectDiplomacyRelation } from "../services/diplomacyEditorService";
import { viewLayerService as view } from "../services/viewLayerService";
import { computeBorderHeat, pairKey } from "../utils/diplomacyHeat";
import { getDiplomacyMilitaryPersonnel, getMilitaryShare } from "../utils/diplomacyMilitary";
import { type RelationKey, relations } from "../utils/diplomacyRelations";

export function clearDiplomacyBadges(): void {
  document.getElementById("diplomacyBadges")?.remove();
}

// Own sibling group just below #debug: editors wipe everything inside #debug on unselect
function createBadgeGroup() {
  const debugNode = view.debug.node();
  const parent = debugNode?.parentNode;
  if (!debugNode || !parent) return view.debug.append("g").attr("id", "diplomacyBadges");
  const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
  node.id = "diplomacyBadges";
  parent.insertBefore(node, debugNode);
  return select(node);
}

// Draws one badge per pair of neighbouring states on their shared border. The badge is split along the
// border like a half-and-half pizza: each half shows how the state on that side regards the other one,
// so mutual relations form a whole symbol (e.g. a heart for mutual friendship).
// Hostile halves and the badge ring heat up with the pair's Relations history, and the burgs fought over
// between the pair glow as scorched battlegrounds beneath the badges.
export function renderDiplomacyBadges(): void {
  clearDiplomacyBadges();
  const { cells, states } = worldContext.pack;
  const cellStates = cells.state;
  if (!cellStates) return;

  // key a * n + b with a < b; normal points from state a towards state b
  const n = states.length;
  const pairs = new Map<number, { points: [number, number][]; nx: number; ny: number }>();
  for (let i = 0; i < cellStates.length; i++) {
    const a = cellStates[i];
    if (!a || states[a]?.removed) continue;
    for (const c of cells.c[i]) {
      const b = cellStates[c];
      if (!b || b <= a || states[b]?.removed) continue;
      const [x1, y1] = cells.p[i];
      const [x2, y2] = cells.p[c];
      const key = a * n + b;
      let pair = pairs.get(key);
      if (!pair) {
        pair = { points: [], nx: 0, ny: 0 };
        pairs.set(key, pair);
      }
      pair.points.push([(x1 + x2) / 2, (y1 + y2) / 2]);
      pair.nx += x2 - x1;
      pair.ny += y2 - y1;
    }
  }

  const personnel = states.map(state => getDiplomacyMilitaryPersonnel(state, worldContext.options));
  const r = 8;
  const heatByPair = computeBorderHeat(states[0].diplomacy);
  const group = createBadgeGroup();
  const defs = group.append("defs");
  const scorch = defs.append("radialGradient").attr("id", "diplomacyScorch");
  scorch.append("stop").attr("offset", "0%").attr("stop-color", "#ff3000").attr("stop-opacity", 0.9);
  scorch.append("stop").attr("offset", "55%").attr("stop-color", "#a00000").attr("stop-opacity", 0.45);
  scorch.append("stop").attr("offset", "100%").attr("stop-color", "#600000").attr("stop-opacity", 0);
  defs
    .append("clipPath")
    .attr("id", "diplomacyBadgeLeft")
    .append("rect")
    .attr("x", -r * 2)
    .attr("y", -r * 2)
    .attr("width", r * 2)
    .attr("height", r * 4);
  defs
    .append("clipPath")
    .attr("id", "diplomacyBadgeRight")
    .append("rect")
    .attr("x", 0)
    .attr("y", -r * 2)
    .attr("width", r * 2)
    .attr("height", r * 4);

  const battlegrounds = group.append("g").attr("pointer-events", "none");
  const sites = new Map<number, number>();
  for (const key of pairs.keys()) {
    const heat = heatByPair.get(pairKey(Math.floor(key / n), key % n));
    for (const [burgId, w] of heat?.sites ?? []) sites.set(burgId, Math.max(sites.get(burgId) || 0, w));
  }
  for (const [burgId, w] of sites) {
    const burg = worldContext.pack.burgs[burgId];
    if (!burg || burg.removed) continue;
    battlegrounds
      .append("circle")
      .attr("cx", burg.x)
      .attr("cy", burg.y)
      .attr("r", 10 + 14 * w)
      .attr("fill", "url(#diplomacyScorch)")
      .attr("opacity", 0.25 + 0.6 * w);
  }

  for (const [key, { points, nx, ny }] of pairs) {
    const heat = heatByPair.get(pairKey(Math.floor(key / n), key % n))?.heat ?? 0;
    let left = Math.floor(key / n);
    let right = key % n;
    let angle = (Math.atan2(ny, nx) * 180) / Math.PI;
    // keep symbols upright: the left half must face the screen's left side
    if (nx < 0) {
      [left, right] = [right, left];
      angle -= 180;
    }

    const mx = points.reduce((acc, p) => acc + p[0], 0) / points.length;
    const my = points.reduce((acc, p) => acc + p[1], 0) / points.length;
    // the mean of a curved border can fall off it, so snap to the nearest border point
    const [x, y] = points.reduce((best, p) =>
      (p[0] - mx) ** 2 + (p[1] - my) ** 2 < (best[0] - mx) ** 2 + (best[1] - my) ** 2 ? p : best
    );

    const badge = group
      .append("g")
      .attr("transform", `translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${angle.toFixed(1)})`)
      .attr("filter", "drop-shadow(0 0 2px rgba(0,0,0,0.7))");

    for (const [subject, object, clip] of [
      [left, right, "diplomacyBadgeLeft"],
      [right, left, "diplomacyBadgeRight"]
    ] as const) {
      const relation = states[subject].diplomacy![object] as RelationKey;
      const rel = relations[relation];
      if (!rel) continue;

      const half = badge
        .append("g")
        .attr("clip-path", `url(#${clip})`)
        .style("cursor", "pointer")
        .on("click", event => {
          event.stopPropagation();
          selectDiplomacyRelation(subject, object, relation);
        });
      const heatNote = heat >= 0.05 ? ` (hostility ${Math.round(heat * 100)}%)` : "";
      half.append("title").text(`${states[subject].name} ${rel.inText} ${states[object].name}${heatNote}`);
      // hostile halves deepen from their relation colour to blood red as the history heats up
      const hostile = relation === "Enemy" || relation === "Rival" || relation === "Suspicion";
      const fill = hostile ? interpolateLab(rel.color, "#8b0000")(heat) : rel.color;
      half.append("circle").attr("r", r).attr("fill", fill);
      half
        .append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("font-size", 11)
        .attr("fill", "#000")
        .attr("stroke", "#fff")
        .attr("stroke-width", 0.6)
        .attr("paint-order", "stroke")
        .text(rel.icon);
    }
    if (heat >= 0.05) {
      const ring = badge
        .append("circle")
        .attr("r", r + 1.5 + heat * 2)
        .attr("fill", "none")
        .attr("stroke", "#d00000")
        .attr("stroke-width", 1 + heat * 3)
        .attr("opacity", 0.3 + 0.7 * heat)
        .attr("pointer-events", "none");
      // an ongoing, heated war pulses
      const atWar = states[left].diplomacy![right] === "Enemy" || states[right].diplomacy![left] === "Enemy";
      if (atWar && heat >= 0.5) {
        ring
          .append("animate")
          .attr("attributeName", "opacity")
          .attr("values", `${0.3 + 0.7 * heat};0.15;${0.3 + 0.7 * heat}`)
          .attr("dur", "1.6s")
          .attr("repeatCount", "indefinite");
      }
    }
    badge
      .append("circle")
      .attr("r", r)
      .attr("fill", "none")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("pointer-events", "none");
    // Centre each country's share on its side of the border normal.
    const share = getMilitaryShare(personnel[left], personnel[right]);
    const start = -Math.PI / 2 - Math.PI * share;
    const split = start + 2 * Math.PI * share;
    const ringArc = arc()
      .innerRadius(r + 0.75)
      .outerRadius(r + 3.25);
    for (const [stateId, startAngle, endAngle] of [
      [left, start, split],
      [right, split, start + 2 * Math.PI]
    ]) {
      badge
        .append("path")
        .attr("d", ringArc({ startAngle, endAngle, innerRadius: r + 0.75, outerRadius: r + 3.25 }))
        .attr("fill", states[stateId].color || "#888")
        .style("cursor", "pointer")
        .on("click", event => {
          event.stopPropagation();
          const otherId = stateId === left ? right : left;
          selectDiplomacyRelation(stateId, otherId, states[stateId].diplomacy![otherId] as string);
        })
        .append("title")
        .text(`${states[stateId].name}: ${personnel[stateId]} military personnel`);
    }
    badge
      .append("line")
      .attr("y1", -r)
      .attr("y2", r)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .attr("pointer-events", "none");
  }
}
