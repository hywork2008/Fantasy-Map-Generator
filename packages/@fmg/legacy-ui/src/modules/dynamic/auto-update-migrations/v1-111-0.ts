"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_111_0({ pack, dom, helpers }: AutoUpdateMigrationContext): void {
  // v1.111.0 moved ice data from SVG to data model
  // Migrate old ice SVG elements to new pack.ice structure
  if (!pack.ice.length) {
    pack.ice = [];
    let iceId = 0;

    const iceLayer = dom?.ice ? (dom.ice.node ? dom.ice.node() as Element : dom.ice) : (d3.select("#ice").node() as Element | null);
    if (iceLayer) {
      // Migrate glaciers (type="iceShield")
        iceLayer.querySelectorAll("polygon[type='iceShield']").forEach(polygon => {
          const polygonEl = polygon as SVGPolygonElement;
        // Parse points string "x1,y1 x2,y2 x3,y3 ..." into array [[x1,y1], [x2,y2], ...]
          const points = [...polygonEl.points].map(svgPoint => [svgPoint.x, svgPoint.y]);

        const transform = polygon.getAttribute("transform");
          const iceElement: any = {
          i: iceId++,
          points,
          type: "glacier"
        };
        if (transform) {
          iceElement.offset = parseTransform(transform);
        }
        pack.ice.push(iceElement);
      });

      // Migrate icebergs
        iceLayer.querySelectorAll("polygon:not([type])").forEach(polygon => {
          const polygonEl = polygon as SVGPolygonElement;
        const cellId = +polygon.getAttribute("cell");
        const size = +polygon.getAttribute("size");

        // points string must exist, cell attribute must be present, and size must be non-zero
        if (polygon.getAttribute("cell") === null || !size) return;

        // Parse points string "x1,y1 x2,y2 x3,y3 ..." into array [[x1,y1], [x2,y2], ...]
          const points = [...polygonEl.points].map(svgPoint => [svgPoint.x, svgPoint.y]);

        const transform = polygon.getAttribute("transform");
          const iceElement: any = {
          i: iceId++,
          points,
          type: "iceberg",
          cellId,
          size
        };
        if (transform) {
          iceElement.offset = parseTransform(transform);
        }
        pack.ice.push(iceElement);
      });

      // Clear old SVG elements
      iceLayer.querySelectorAll("*").forEach(el => el.remove());
    } else {
      // If ice layer element doesn't exist, create it
      const ice = dom?.viewbox ? dom.viewbox.insert("g", "#coastline").attr("id", "ice") : undefined;
      if (ice) {
        ice
          .attr("opacity", null)
          .attr("fill", "#e8f0f6")
          .attr("stroke", "#e8f0f6")
          .attr("stroke-width", 1)
          .attr("filter", "url(#dropShadow05)");
      }
    }

    // Re-render ice from migrated data
    if (helpers?.layerIsOn && helpers.layerIsOn("toggleIce")) helpers.iceRenderer?.();
  }
}
