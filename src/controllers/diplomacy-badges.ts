import { worldContext } from "../context/worldContext";
import { viewLayerService as view } from "../services/viewLayerService";
import { isDialogOpen } from "../ui/dialogs/dialogService";
import { type RelationKey, relations } from "../utils/diplomacyRelations";
import { diplomacyEditorActions } from "./diplomacy-editor";

export function clearDiplomacyBadges(): void {
  view.debug.select("#diplomacyBadges").remove();
}

// Draws one badge per pair of neighbouring states on their shared border. The badge is split along the
// border like a half-and-half pizza: each half shows how the state on that side regards the other one,
// so mutual relations form a whole symbol (e.g. a heart for mutual friendship).
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

  const r = 8;
  const group = view.debug.append("g").attr("id", "diplomacyBadges");
  const defs = group.append("defs");
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

  for (const [key, { points, nx, ny }] of pairs) {
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
          if (isDialogOpen("diplomacyEditor")) diplomacyEditorActions.selectRelation(subject, object, relation);
        });
      half.append("title").text(`${states[subject].name} ${rel.inText} ${states[object].name}`);
      half.append("circle").attr("r", r).attr("fill", rel.color);
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
    badge
      .append("circle")
      .attr("r", r)
      .attr("fill", "none")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("pointer-events", "none");
    badge
      .append("line")
      .attr("y1", -r)
      .attr("y2", r)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.5)
      .attr("pointer-events", "none");
  }
}
