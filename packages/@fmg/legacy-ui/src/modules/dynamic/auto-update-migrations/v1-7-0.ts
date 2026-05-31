"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";
import { rn } from "@fmg/shared";

export function migrateToV1_7_0({ pack, dom, helpers }: AutoUpdateMigrationContext): void {
  // v1.7 changed markers data
  const defs = dom?.defs ? ((dom.defs.node ? (dom.defs.node() as Element) : dom.defs).querySelector("#defs-markers")) : (d3.select("#defs-markers").node() as Element | null);
  const markersGroup = dom?.markersGroup && (dom.markersGroup.node ? dom.markersGroup.node() : null) || (d3.select("#markers").node() as Element | null);

  if (defs && markersGroup) {
    const markerElements = markersGroup.querySelectorAll("use") as any;
    const rescale = +markersGroup.getAttribute("rescale");

    pack.markers = Array.from(markerElements).map((el: any, i: number) => {
      const id = el.getAttribute("id");
      const note = notes.find(note => note.id === id);
      if (note) note.id = `marker${i}`;

      let x = +el.dataset.x;
      let y = +el.dataset.y;

      const transform = el.getAttribute("transform");
      if (transform) {
        const [dx, dy] = parseTransform(transform);
        if (dx) x += +dx;
        if (dy) y += +dy;
      }
      const cell = helpers?.findPackCell ? helpers.findPackCell(x, y) : undefined;
      const size = rn(rescale ? Number(el.dataset.size) * 30 : Number(el.getAttribute("width")), 1);

      const href = el.href.baseVal;
      const type = href.replace("#marker_", "");
      const symbol = defs?.querySelector(`symbol${href}`);
      const text = symbol?.querySelector("text");
      const circle = symbol?.querySelector("circle");

      const icon = text?.innerHTML;
      const px = text && Number(text.getAttribute("font-size")?.replace("px", ""));
      const dx = text && Number(text.getAttribute("x")?.replace("%", ""));
      const dy = text && Number(text.getAttribute("y")?.replace("%", ""));
      const fill = circle && circle.getAttribute("fill");
      const stroke = circle && circle.getAttribute("stroke");

      const marker: any = { i, icon, type, x, y, size, cell };
      if (size && size !== 30) marker.size = size;
      if (!isNaN(px) && px !== 12) marker.px = px;
      if (!isNaN(dx) && dx !== 50) marker.dx = dx;
      if (!isNaN(dy) && dy !== 50) marker.dy = dy;
      if (fill && fill !== "#ffffff") marker.fill = fill;
      if (stroke && stroke !== "#000000") marker.stroke = stroke;
      if (circle?.getAttribute("opacity") === "0") marker.pin = "no";

      return marker;
    });

    markersGroup.style.display = null;
    defs?.remove();
    markerElements.forEach(el => el.remove());
    if (helpers?.layerIsOn && helpers.layerIsOn("markers")) helpers.markersRenderer?.();
  }
}
