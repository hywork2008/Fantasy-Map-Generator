"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import { Opisometer, Planimeter, Ruler, Rulers } from "../../ui/measurers";
import * as d3 from "d3";

export function migrateToV1_61_0({ dom, helpers }: AutoUpdateMigrationContext): void {
  // v1.61 changed rulers data
  const ruler = dom?.ruler ?? d3.select("#ruler");
  const rulers = new Rulers();

  ruler.selectAll(".ruler > .white").each(function () {
    const x1 = +this.getAttribute("x1");
    const y1 = +this.getAttribute("y1");
    const x2 = +this.getAttribute("x2");
    const y2 = +this.getAttribute("y2");
    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return;
    const points = [
      [x1, y1],
      [x2, y2]
    ];
    rulers.create(Ruler, points);
  });

  ruler.selectAll("g.opisometer").each(function () {
    const pointsString = (this as HTMLElement).dataset.points;
    if (!pointsString) return;
    const points = JSON.parse(pointsString);
    rulers.create(Opisometer, points);
  });

  ruler.selectAll("path.planimeter").each(function () {
    const length = (this as SVGPathElement).getTotalLength();
    if (length < 30) return;

    const step = length > 1000 ? 40 : length > 400 ? 20 : 10;
    const increment = length / Math.ceil(length / step);
    const points: Array<[number, number]> = [];
    for (let i = 0; i <= length; i += increment) {
      const point = (this as SVGPathElement).getPointAtLength(i);
      points.push([point.x | 0, point.y | 0]);
    }

    rulers.create(Planimeter, points);
  });

  ruler.selectAll("*").remove();

  if (rulers.data.length) {
    helpers?.turnButtonOn?.("toggleRulers");
    rulers.draw();
  } else helpers?.turnButtonOff?.("toggleRulers");

  // 1.61 changed oceanicPattern from rect to image
  const pattern = dom?.oceanic ? (dom.oceanic.node ? (dom.oceanic.node() as Element) : dom.oceanic) : (d3.select("#oceanic").node() as Element | null);
  const filter = pattern?.firstElementChild?.getAttribute("filter") || "";
  const href = filter ? "./images/" + filter.replace("url(#", "").replace(")", "") + ".png" : "";
  if (pattern) pattern.innerHTML = /* html */ `<image id="oceanicPattern" href=${href} width="100" height="100" opacity="0.2"></image>`;
}
