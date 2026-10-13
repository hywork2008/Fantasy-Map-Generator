import { editorText } from "../../i18n/editorMessages";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../core/gen/geom";
import { bounds } from "../core/gen/parcelGeometry";
import type { CityDocument, Point } from "../core/types";
import { renderCultureCemetery } from "./cultureCemeterySvg";
import { element, line, polygon } from "./svgPrimitives";
import { resolveCemeteryPlans } from "./townFacts";
export function renderCemeteries(document: CityDocument, inspectedId?: string | number | null): SVGGElement {
  const layer = element("g", { class: "ce-cemeteries" }) as SVGGElement;
  const plans = resolveCemeteryPlans(document);
  for (const cemetery of plans) {
    const pick = {
      layer: "cemetery",
      kind: "cemetery",
      id: cemetery.id,
      label: editorText("cityEditor.messages.cemetery", { value0: cemetery.form }),
      locked: cemetery.locked
    };
    const group = element("g", {
      "data-pick": encodeURIComponent(JSON.stringify(pick)),
      class: inspectedId === cemetery.id ? "ce-is-selected cg-is-selected" : "",
      style: "cursor:pointer"
    });

    if (cemetery.burialProfile) {
      group.appendChild(renderCultureCemetery(cemetery));
      layer.appendChild(group);
      continue;
    }

    // 1. Outer precinct stone wall
    if (cemetery.boundary.length >= 3) {
      group.appendChild(
        element("path", {
          d: polygon(cemetery.boundary),
          fill: "none",
          stroke: "#49483f",
          "stroke-width": "1.0"
        })
      );
    }

    // 2. Courtyards / lawns (vibrant grass matching park lawns)
    for (const court of cemetery.courtyards) {
      group.appendChild(
        element("path", {
          d: polygon(court),
          fill: "#7ea867",
          stroke: "#4d733b",
          "stroke-width": "0.8"
        })
      );
    }

    // 3. Pathways (clean gravel paths matching park walks)
    for (const access of cemetery.accesses) {
      group.appendChild(
        element("path", {
          d: line(access.points),
          fill: "none",
          stroke: "#d8d1bf",
          "stroke-width": String(access.widthMeters),
          "stroke-linecap": "round",
          "stroke-linejoin": "round"
        })
      );
    }

    // 4. Parts: buildings, calvary cross, graves
    for (const part of cemetery.parts) {
      if (part.role === "calvary") {
        group.appendChild(
          element("path", {
            d: polygon(part.footprint),
            fill: "#edeae2",
            stroke: "#5d584e",
            "stroke-width": "0.8"
          })
        );
        const center = polygonCentroid(part.footprint);
        const crossSize = 1.8;
        group.appendChild(
          element("line", {
            x1: String(center[0]),
            y1: String(-center[1] - crossSize),
            x2: String(center[0]),
            y2: String(-center[1] + crossSize),
            stroke: "#3d3932",
            "stroke-width": "1.0",
            "stroke-linecap": "round"
          })
        );
        group.appendChild(
          element("line", {
            x1: String(center[0] - crossSize * 0.7),
            y1: String(-center[1] - crossSize * 0.3),
            x2: String(center[0] + crossSize * 0.7),
            y2: String(-center[1] - crossSize * 0.3),
            stroke: "#3d3932",
            "stroke-width": "1.0",
            "stroke-linecap": "round"
          })
        );
      } else if (part.role === "graves") {
        // Individual stone headstones and grave slabs dotted neatly over the green lawn
        const [minX, minY, maxX, maxY] = bounds(part.footprint);
        const stepX = 2.2;
        const stepY = 2.4;
        const calvaryPart = cemetery.parts.find(p => p.role === "calvary");
        const calvaryCenter = calvaryPart ? polygonCentroid(calvaryPart.footprint) : null;

        let plotIndex = 0;
        for (let gx = minX + 1.2; gx <= maxX - 1.2; gx += stepX) {
          for (let gy = minY + 1.0; gy <= maxY - 1.0; gy += stepY) {
            plotIndex++;
            const p: Point = [gx, gy];
            if (!pointInPolygon(p, part.footprint)) continue;

            // Keep graves off paths / accesses
            let hitsPath = false;
            for (const acc of cemetery.accesses) {
              const halfW = (acc.widthMeters ?? 1.8) / 2 + 0.45;
              if (nearestOnPolyline(p, acc.points).dist < halfW) {
                hitsPath = true;
                break;
              }
            }
            if (hitsPath) continue;

            // Keep off calvary monument
            if (calvaryCenter && Math.hypot(gx - calvaryCenter[0], gy - calvaryCenter[1]) < 2.0) {
              continue;
            }

            // Keep off tree canopies
            if (cemetery.trees.some(tp => Math.hypot(gx - tp[0], gy - tp[1]) < 2.2)) {
              continue;
            }

            // Authentic European burial field:
            // Every plot has an upright headstone.
            // Alternating plots feature flat stone slabs (ledger stones) or kerb borders.
            const hasSlab = plotIndex % 3 !== 0;

            if (hasSlab) {
              // 1. Flat horizontal grave slab / stone kerb
              group.appendChild(
                element("rect", {
                  x: String(gx - 0.28),
                  y: String(-gy - 0.5),
                  width: "0.56",
                  height: "1.05",
                  rx: "0.12",
                  fill: "#ded9cd",
                  stroke: "#666157",
                  "stroke-width": "0.3"
                })
              );
            }

            // 2. Upright headstone at the head of the plot (facing east/pathway)
            group.appendChild(
              element("rect", {
                x: String(gx - 0.32),
                y: String(-gy + 0.38),
                width: "0.64",
                height: "0.26",
                rx: "0.08",
                fill: "#edeae2",
                stroke: "#49453c",
                "stroke-width": "0.35"
              })
            );

            // Optional carved cross relief on select headstones
            if (plotIndex % 2 === 0) {
              group.appendChild(
                element("line", {
                  x1: String(gx),
                  y1: String(-gy + 0.41),
                  x2: String(gx),
                  y2: String(-gy + 0.61),
                  stroke: "#787265",
                  "stroke-width": "0.2"
                })
              );
              group.appendChild(
                element("line", {
                  x1: String(gx - 0.12),
                  y1: String(-gy + 0.47),
                  x2: String(gx + 0.12),
                  y2: String(-gy + 0.47),
                  stroke: "#787265",
                  "stroke-width": "0.2"
                })
              );
            }
          }
        }
      } else {
        // Stone buildings: slate / limestone masonry
        const isChapel = part.role === "chapel";
        group.appendChild(
          element("path", {
            d: polygon(part.footprint),
            fill: isChapel ? "#726b5f" : part.role === "ossuary" ? "#888072" : "#989082",
            stroke: "#3d3932",
            "stroke-width": isChapel ? "1.4" : "1.0"
          })
        );
        for (const entrance of part.entrances) {
          group.appendChild(
            element("circle", {
              cx: String(entrance[0]),
              cy: String(-entrance[1]),
              r: "1.2",
              fill: "#f3efe4"
            })
          );
        }
      }
    }

    // 5. Yew Trees: fluffy multi-circle tree canopy matching park foliage
    for (const tree of cemetery.trees) {
      const treeGroup = element("g", { class: "ce-cemetery-tree" });
      const cx = tree[0];
      const cy = -tree[1];
      const radius = 3.2;

      // 6 surrounding canopy lobes
      const lobeCount = 6;
      for (let i = 0; i < lobeCount; i++) {
        const angle = (i * 2 * Math.PI) / lobeCount;
        const ox = Math.cos(angle) * (radius * 0.45);
        const oy = Math.sin(angle) * (radius * 0.45);
        treeGroup.appendChild(
          element("circle", {
            cx: String(cx + ox),
            cy: String(cy + oy),
            r: String(radius * 0.55),
            fill: "#557849",
            stroke: "#385230",
            "stroke-width": "0.6"
          })
        );
      }

      // Main center canopy
      treeGroup.appendChild(
        element("circle", {
          cx: String(cx),
          cy: String(cy),
          r: String(radius),
          fill: "#557849",
          stroke: "#385230",
          "stroke-width": "0.6"
        })
      );

      // Top highlight
      treeGroup.appendChild(
        element("circle", {
          cx: String(cx),
          cy: String(cy),
          r: String(radius * 0.55),
          fill: "#688e5b",
          stroke: "none",
          opacity: "0.85"
        })
      );

      group.appendChild(treeGroup);
    }

    layer.appendChild(group);
  }
  return layer;
}
