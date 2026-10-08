import { circuitRing } from "../core/fortifications";
import { polygonCentroid } from "../core/gen/geom";
import type { CastlePlan, CityDocument, Point } from "../core/types";
import { buildFortressPlan, type FortressPlan } from "./castleLayoutBuilder";
import { type CastleStyleProfile, resolveCastleStyle } from "./castlePatterns";

const NS = "http://www.w3.org/2000/svg";

function element<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

const line = (points: Point[]) => points.map(([x, y], i) => `${i ? "L" : "M"}${x},${-y}`).join(" ");
const polygon = (points: Point[]) => `${line(points)} Z`;

/**
 * Computes bounding rectangle or major axis for footprint polygon.
 */
function footprintBox(points: Point[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2] as Point,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Draws a closed wall as a thick masonry band: dark outline underneath, stone fill on top.
 */
function appendMasonryBand(
  parent: SVGElement,
  pts: Point[],
  width: number,
  fill: string,
  outline: string,
  className: string
): void {
  const d = polygon(pts);
  const common = { d, fill: "none", "stroke-linejoin": "miter" };
  parent.appendChild(
    element("path", { ...common, stroke: outline, "stroke-width": String(width + 1.2), class: className })
  );
  parent.appendChild(
    element("path", { ...common, stroke: fill, "stroke-width": String(width), class: `${className}-core` })
  );
}

/**
 * Renders multiple ramparts, slopes, stone revetments, and palisades.
 */
function renderRamparts(parent: SVGElement, plan: FortressPlan, profile: CastleStyleProfile): void {
  const { palette } = profile;

  for (const rampart of plan.ramparts) {
    const pts = rampart.polygon;
    if (pts.length < 3) continue;

    if (rampart.kind === "stone_slope") {
      // 1. Japanese stone rampart (高石垣・武者返し) or revetment
      parent.appendChild(
        element("path", {
          d: polygon(pts),
          fill: palette.rampartFill,
          stroke: palette.rampartStroke,
          "stroke-width": "1.2",
          class: "ce-stone-rampart-slope"
        })
      );

      // Hatching lines showing the fan slope / batter (扇の勾配・目地)
      const c = polygonCentroid(pts);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        // Corner stone line (算木積み)
        parent.appendChild(
          element("line", {
            x1: String(p[0]),
            y1: String(-p[1]),
            x2: String(p[0] + (c[0] - p[0]) * 0.35),
            y2: String(-(p[1] + (c[1] - p[1]) * 0.35)),
            stroke: palette.rampartStroke,
            "stroke-width": "0.8",
            opacity: "0.8"
          })
        );
      }
    } else if (rampart.kind === "motte_slope") {
      // 2. Motte earthen mound slope (モットの盛土段差)
      parent.appendChild(
        element("path", {
          d: polygon(pts),
          fill: palette.rampartFill,
          stroke: palette.rampartStroke,
          "stroke-width": "1.2",
          class: "ce-motte-mound-slope"
        })
      );
      // Concentric slope terrace rings
      const c = polygonCentroid(pts);
      for (const scale of [0.8, 0.6, 0.4]) {
        const inner = pts.map(([x, y]) => [c[0] + (x - c[0]) * scale, c[1] + (y - c[1]) * scale] as Point);
        parent.appendChild(
          element("path", {
            d: polygon(inner),
            fill: "none",
            stroke: palette.rampartStroke,
            "stroke-width": "0.6",
            "stroke-dasharray": "3 1.5",
            opacity: "0.7"
          })
        );
      }
      // Radial hachure slope lines (法面の放射状ケバ線・立体段差)
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const next = pts[(i + 1) % pts.length];
        const mid: Point = [(p[0] + next[0]) / 2, (p[1] + next[1]) / 2];
        parent.appendChild(
          element("line", {
            x1: String(mid[0]),
            y1: String(-mid[1]),
            x2: String(mid[0] + (c[0] - mid[0]) * 0.48),
            y2: String(-(mid[1] + (c[1] - mid[1]) * 0.48)),
            stroke: palette.rampartStroke,
            "stroke-width": "0.8",
            opacity: "0.65"
          })
        );
      }
    } else if (rampart.kind === "bastion_glacis") {
      // 3. Glacis slope around star bastions
      parent.appendChild(
        element("path", {
          d: polygon(pts),
          fill: palette.rampartFill,
          stroke: palette.rampartStroke,
          "stroke-width": "0.8",
          class: "ce-bastion-glacis"
        })
      );
    } else if (rampart.kind === "palisade") {
      // 4. Timber palisade line
      parent.appendChild(
        element("path", {
          d: polygon(pts),
          fill: "none",
          stroke: palette.keepStroke,
          "stroke-width": "1.8",
          "stroke-dasharray": "1.2 0.8",
          class: "ce-timber-palisade"
        })
      );
    } else if (rampart.kind === "inner_wall") {
      // 5. Heavy inner curtain wall
      appendMasonryBand(
        parent,
        pts,
        rampart.strokeWidth ?? 2.8,
        palette.keepWall,
        palette.keepStroke,
        "ce-inner-curtain-wall"
      );
    } else {
      // 6. Outer curtain wall
      parent.appendChild(
        element("path", {
          d: polygon(pts),
          fill: palette.groundFill,
          "fill-opacity": "0.35",
          stroke: palette.groundStroke,
          "stroke-width": "1.2",
          class: "ce-outer-curtain-ground"
        })
      );
      // 市壁と同等以上の厚みを持つ石造カーテンウォール
      appendMasonryBand(
        parent,
        pts,
        rampart.strokeWidth ?? 1.2,
        palette.rampartFill,
        palette.rampartStroke,
        "ce-outer-curtain-wall"
      );
    }
  }
}

/**
 * Renders towers, corner yaguras, star bastions, and watchtowers.
 */
function renderTowersAndBastions(parent: SVGElement, plan: FortressPlan, profile: CastleStyleProfile): void {
  const { palette } = profile;

  for (const tower of plan.towers) {
    if (tower.kind === "star_bastion" && tower.polygon) {
      // Five-sided star bastion
      parent.appendChild(
        element("path", {
          d: polygon(tower.polygon),
          fill: palette.rampartFill,
          stroke: palette.rampartStroke,
          "stroke-width": "1.4",
          class: "ce-star-bastion"
        })
      );
      // Parapet and cannon embrasures
      const inner = tower.polygon.map(([x, y]) => {
        const dx = x - tower.point[0];
        const dy = y - tower.point[1];
        return [tower.point[0] + dx * 0.7, tower.point[1] + dy * 0.7] as Point;
      });
      parent.appendChild(
        element("path", {
          d: polygon(inner),
          fill: palette.courtFill,
          stroke: palette.keepStroke,
          "stroke-width": "0.8"
        })
      );
    } else if (tower.kind === "drum_tower") {
      // Round drum tower
      const r = tower.radius ?? 4.0;
      parent.appendChild(
        element("circle", {
          cx: String(tower.point[0]),
          cy: String(-tower.point[1]),
          r: String(r),
          fill: palette.keepWall,
          stroke: palette.keepStroke,
          "stroke-width": "1.4",
          class: "ce-drum-tower"
        })
      );
      // Conical cap / crenellations
      parent.appendChild(
        element("circle", {
          cx: String(tower.point[0]),
          cy: String(-tower.point[1]),
          r: String(r * 0.65),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.6"
        })
      );
    } else if (tower.kind === "square_tower") {
      // Square corner / flank tower
      const s = (tower.radius ?? 3.5) * 2;
      parent.appendChild(
        element("rect", {
          x: String(tower.point[0] - s / 2),
          y: String(-tower.point[1] - s / 2),
          width: String(s),
          height: String(s),
          fill: palette.keepWall,
          stroke: palette.keepStroke,
          "stroke-width": "1.2",
          class: "ce-square-tower"
        })
      );
      parent.appendChild(
        element("rect", {
          x: String(tower.point[0] - s * 0.35),
          y: String(-tower.point[1] - s * 0.35),
          width: String(s * 0.7),
          height: String(s * 0.7),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.6"
        })
      );
    } else if (tower.kind === "yagura_corner") {
      // Japanese corner yagura (隅櫓)
      const s = (tower.radius ?? 3.2) * 2;
      parent.appendChild(
        element("rect", {
          x: String(tower.point[0] - s / 2),
          y: String(-tower.point[1] - s / 2),
          width: String(s),
          height: String(s),
          fill: palette.keepWall,
          stroke: palette.keepStroke,
          "stroke-width": "1.0",
          class: "ce-yagura-corner"
        })
      );
      // Multi-tier roof (入母屋屋根)
      parent.appendChild(
        element("rect", {
          x: String(tower.point[0] - s * 0.38),
          y: String(-tower.point[1] - s * 0.38),
          width: String(s * 0.76),
          height: String(s * 0.76),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.6"
        })
      );
    } else if (tower.kind === "wood_watchtower") {
      // Motte timber watchtower
      const r = tower.radius ?? 2.8;
      parent.appendChild(
        element("rect", {
          x: String(tower.point[0] - r),
          y: String(-tower.point[1] - r),
          width: String(r * 2),
          height: String(r * 2),
          fill: palette.keepRoof,
          stroke: palette.keepStroke,
          "stroke-width": "1.0",
          class: "ce-wood-watchtower"
        })
      );
      // Timber cross braces
      parent.appendChild(
        element("line", {
          x1: String(tower.point[0] - r),
          y1: String(-tower.point[1] - r),
          x2: String(tower.point[0] + r),
          y2: String(-tower.point[1] + r),
          stroke: palette.keepStroke,
          "stroke-width": "0.5"
        })
      );
    }
  }
}

/**
 * Renders complex building footprints, tiered roofs, tamon galleries, and palaces.
 */
function renderComplexBuildings(parent: SVGElement, plan: FortressPlan, profile: CastleStyleProfile): void {
  const { palette } = profile;

  for (const b of plan.buildings) {
    const pts = b.polygon;
    if (pts.length < 3) continue;
    const box = footprintBox(pts);

    // Wall base
    const wallColor =
      b.kind === "main_keep" || b.kind === "small_keep"
        ? palette.keepWall
        : b.kind === "chapel"
          ? palette.chapelWall
          : palette.rangeWall;
    const strokeColor = b.kind === "main_keep" || b.kind === "small_keep" ? palette.keepStroke : palette.rangeStroke;

    parent.appendChild(
      element("path", {
        d: polygon(pts),
        fill: wallColor,
        stroke: strokeColor,
        "stroke-width": b.kind === "main_keep" ? "1.8" : "1.2",
        class: `ce-fortress-building ce-building--${b.kind}`
      })
    );

    // Roof rendering based on roofStyle
    if (b.roofStyle === "tenshu_gables") {
      // 1. Japanese Tenshu Multi-tiered Roofs (大天守・小天守の破風屋根)
      const tier1 = pts.map(([x, y]) => {
        const dx = x - box.center[0];
        const dy = y - box.center[1];
        return [box.center[0] + dx * 0.78, box.center[1] + dy * 0.78] as Point;
      });
      parent.appendChild(
        element("path", {
          d: polygon(tier1),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.8"
        })
      );

      const tier2 = pts.map(([x, y]) => {
        const dx = x - box.center[0];
        const dy = y - box.center[1];
        return [box.center[0] + dx * 0.52, box.center[1] + dy * 0.52] as Point;
      });
      parent.appendChild(
        element("path", {
          d: polygon(tier2),
          fill: palette.keepAccent,
          stroke: palette.keepStroke,
          "stroke-width": "0.8"
        })
      );

      // Shachihoko / Ridge crest (棟瓦と鯱鉾)
      parent.appendChild(
        element("line", {
          x1: String(box.center[0] - box.width * 0.22),
          y1: String(-box.center[1]),
          x2: String(box.center[0] + box.width * 0.22),
          y2: String(-box.center[1]),
          stroke: palette.keepRoof,
          "stroke-width": "1.4",
          "stroke-linecap": "round"
        })
      );
      parent.appendChild(
        element("circle", {
          cx: String(box.center[0] - box.width * 0.22),
          cy: String(-box.center[1]),
          r: "0.8",
          fill: "#c4a35a" // golden shachihoko
        })
      );
      parent.appendChild(
        element("circle", {
          cx: String(box.center[0] + box.width * 0.22),
          cy: String(-box.center[1]),
          r: "0.8",
          fill: "#c4a35a"
        })
      );
    } else if (b.roofStyle === "tenshu_shoin" || b.kind === "tamon_yagura" || b.kind === "watari_yagura") {
      // 2. Tamon-yagura and Shoin Palace roofs (多聞櫓・書院御殿の入母屋屋根)
      const inner = pts.map(([x, y]) => {
        const dx = x - box.center[0];
        const dy = y - box.center[1];
        return [box.center[0] + dx * 0.75, box.center[1] + dy * 0.75] as Point;
      });
      parent.appendChild(
        element("path", {
          d: polygon(inner),
          fill: palette.rangeRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.6"
        })
      );
    } else if (b.roofStyle === "crenellated_open") {
      // 3. Norman Keep crenellated parapet walkway
      const inner = pts.map(([x, y]) => {
        const dx = x - box.center[0];
        const dy = y - box.center[1];
        return [box.center[0] + dx * 0.75, box.center[1] + dy * 0.75] as Point;
      });
      parent.appendChild(
        element("path", {
          d: polygon(inner),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.8"
        })
      );
    } else if (b.roofStyle === "gable" || b.roofStyle === "hip") {
      // 4. Pitched roof with ridge line
      const isH = box.width >= box.height;
      const r1: Point = isH
        ? [box.center[0] - box.width * 0.4, box.center[1]]
        : [box.center[0], box.center[1] - box.height * 0.4];
      const r2: Point = isH
        ? [box.center[0] + box.width * 0.4, box.center[1]]
        : [box.center[0], box.center[1] + box.height * 0.4];

      parent.appendChild(
        element("line", {
          x1: String(r1[0]),
          y1: String(-r1[1]),
          x2: String(r2[0]),
          y2: String(-r2[1]),
          stroke: palette.rangeRoof,
          "stroke-width": "1.0",
          "stroke-linecap": "round"
        })
      );
    }
  }
}

/**
 * Renders gates, masugata enclosures, barbicans, and ramps.
 */
function renderDefensiveGates(parent: SVGElement, plan: FortressPlan, profile: CastleStyleProfile): void {
  const { palette } = profile;

  for (const gate of plan.defensiveGates) {
    if (gate.kind === "masugata" && gate.polygon) {
      // Japanese Masugata Gate (枡形虎口)
      // Stone revetment box
      parent.appendChild(
        element("path", {
          d: polygon(gate.polygon),
          fill: palette.rampartFill,
          stroke: palette.rampartStroke,
          "stroke-width": "1.4",
          class: "ce-masugata-gate"
        })
      );
      // Gravel court inside the masugata
      const inner = gate.polygon.map(([x, y]) => {
        const c = polygonCentroid(gate.polygon!);
        return [c[0] + (x - c[0]) * 0.65, c[1] + (y - c[1]) * 0.65] as Point;
      });
      parent.appendChild(
        element("path", {
          d: polygon(inner),
          fill: palette.courtFill,
          stroke: palette.rampartStroke,
          "stroke-width": "0.6"
        })
      );

      // Gate portals (Outer gate / Inner yagura gate)
      if (gate.outerGate) {
        parent.appendChild(
          element("circle", {
            cx: String(gate.outerGate[0]),
            cy: String(-gate.outerGate[1]),
            r: "1.6",
            fill: palette.keepStroke,
            stroke: palette.keepAccent,
            "stroke-width": "0.5"
          })
        );
      }
      if (gate.innerGate) {
        parent.appendChild(
          element("rect", {
            x: String(gate.innerGate[0] - 2),
            y: String(-gate.innerGate[1] - 1),
            width: "4",
            height: "2",
            fill: palette.keepRoof,
            stroke: palette.keepStroke,
            "stroke-width": "0.6"
          })
        );
      }
    } else if (gate.kind === "barbican" && gate.polygon) {
      // European Barbican / Demi-lune gate
      parent.appendChild(
        element("path", {
          d: polygon(gate.polygon),
          fill: palette.rampartFill,
          stroke: palette.keepStroke,
          "stroke-width": "1.4",
          class: "ce-barbican"
        })
      );
      if (gate.outerGate) {
        parent.appendChild(
          element("circle", {
            cx: String(gate.outerGate[0]),
            cy: String(-gate.outerGate[1]),
            r: "1.6",
            fill: palette.keepStroke,
            stroke: palette.keepAccent,
            "stroke-width": "0.5"
          })
        );
      }
    } else if (gate.kind === "timber_ramp" && gate.approachPoints) {
      // Motte timber bridge / ramp
      parent.appendChild(
        element("path", {
          d: line(gate.approachPoints),
          fill: "none",
          stroke: palette.keepRoof,
          "stroke-width": "3.5",
          "stroke-linecap": "round",
          class: "ce-motte-timber-ramp"
        })
      );
      parent.appendChild(
        element("path", {
          d: line(gate.approachPoints),
          fill: "none",
          stroke: palette.keepStroke,
          "stroke-width": "1.0",
          "stroke-dasharray": "1.5 1.5"
        })
      );
    }
  }
}

/**
 * Renders castle courtyards.
 */
function renderCourtyards(parent: SVGElement, plan: FortressPlan, profile: CastleStyleProfile): void {
  const { palette } = profile;
  for (const court of plan.courtyards) {
    parent.appendChild(
      element("path", {
        d: polygon(court.polygon),
        fill: palette.courtFill,
        stroke: palette.courtStroke,
        "stroke-width": "0.8",
        class: `ce-court--${court.texture}`
      })
    );
  }
}

/**
 * Renders the original single-style classic castle (城の種類がひとつだけだった時の描画):
 * base precinct ground, courtyards, ground access corridors between parts, and keep/wing footprints.
 */
function renderClassicCastle(
  parent: SVGElement,
  document: CityDocument,
  castle: CastlePlan,
  profile: CastleStyleProfile
): void {
  const circuit = document.defenseCircuits?.find(c => c.id === castle.circuitId);
  if (circuit) {
    const ring = circuitRing(document, circuit);
    if (ring.length >= 3) {
      parent.appendChild(
        element("path", {
          d: polygon(ring),
          fill: profile.palette.groundFill,
          "fill-opacity": "0.25",
          stroke: "none"
        })
      );
    }
  }
  for (const court of castle.courtyards) {
    parent.appendChild(
      element("path", {
        d: polygon(court),
        fill: profile.palette.courtFill,
        stroke: profile.palette.courtStroke,
        "stroke-width": "0.6"
      })
    );
  }
  // 種類がひとつだけだった時の、施設間を結ぶ道
  for (const access of castle.accesses) {
    if (!access.points || access.points.length < 2) continue;
    parent.appendChild(
      element("path", {
        d: line(access.points),
        fill: "none",
        stroke: profile.palette.pathStroke,
        "stroke-width": String(access.widthMeters),
        "stroke-linejoin": "round",
        class: "ce-castle-access-path"
      })
    );
  }
  for (const part of castle.parts) {
    parent.appendChild(
      element("path", {
        d: polygon(part.footprint),
        fill: part.role === "keep" ? profile.palette.keepWall : profile.palette.rangeWall,
        stroke: part.role === "keep" ? profile.palette.keepStroke : profile.palette.rangeStroke,
        "stroke-width": part.role === "keep" ? "2" : "1",
        class: `ce-castle-${part.role}`
      })
    );
    for (const entrance of part.entrances) {
      parent.appendChild(
        element("circle", {
          cx: String(entrance[0]),
          cy: String(-entrance[1]),
          r: "1.4",
          fill: profile.palette.keepAccent
        })
      );
    }
  }
}

/**
 * Renders architectural props (wells, reflecting pools, pines, etc.)
 */
function renderProps(parent: SVGElement, plan: FortressPlan, profile: CastleStyleProfile): void {
  const { palette } = profile;
  for (const prop of plan.props) {
    if (prop.kind === "reflecting_pool") {
      // Large rectangular or octagonal reflecting pool / fountain
      parent.appendChild(
        element("rect", {
          x: String(prop.point[0] - 6),
          y: String(-prop.point[1] - 3.5),
          width: "12",
          height: "7",
          fill: "#1f4a61",
          stroke: palette.keepAccent,
          "stroke-width": "0.8",
          rx: "1"
        })
      );
      parent.appendChild(
        element("circle", {
          cx: String(prop.point[0]),
          cy: String(-prop.point[1]),
          r: "1.2",
          fill: palette.keepAccent
        })
      );
    } else if (prop.kind === "stone_well") {
      // Well with rim and cross beam
      parent.appendChild(
        element("circle", {
          cx: String(prop.point[0]),
          cy: String(-prop.point[1]),
          r: "2.2",
          fill: palette.keepStroke,
          stroke: palette.keepAccent,
          "stroke-width": "0.6"
        })
      );
      parent.appendChild(
        element("circle", {
          cx: String(prop.point[0]),
          cy: String(-prop.point[1]),
          r: "1.2",
          fill: "#273f4d"
        })
      );
    } else if (prop.kind === "garden_pines") {
      // Pine tree cluster
      const colors = ["#2d4a36", "#233d2c", "#385c44"];
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 2.5;
        const oy = ((i % 2) - 0.5) * 2;
        parent.appendChild(
          element("circle", {
            cx: String(prop.point[0] + ox),
            cy: String(-prop.point[1] + oy),
            r: "2.6",
            fill: colors[i],
            stroke: "#182c1f",
            "stroke-width": "0.4"
          })
        );
      }
    } else if (prop.kind === "cannon_battery") {
      // Cannon on bastion flank
      parent.appendChild(
        element("circle", {
          cx: String(prop.point[0]),
          cy: String(-prop.point[1]),
          r: "0.9",
          fill: "#292724"
        })
      );
      parent.appendChild(
        element("line", {
          x1: String(prop.point[0]),
          y1: String(-prop.point[1]),
          x2: String(prop.point[0] + 1.8),
          y2: String(-prop.point[1]),
          stroke: "#1c1b19",
          "stroke-width": "0.7",
          "stroke-linecap": "round"
        })
      );
    }
  }
}

/**
 * High-fidelity, historically & culturally informed Castle SVG renderer.
 */
export function renderCastle(
  document: CityDocument,
  castle: CastlePlan,
  inspectedId?: string | number | null
): SVGElement {
  const circuit = document.defenseCircuits?.find(c => c.id === castle.circuitId);
  if (!circuit && castle.courtyards.length === 0) return element("g", {});

  const profile = resolveCastleStyle(document, castle);

  const pick = {
    layer: "fortifications",
    kind: "castle",
    id: castle.id,
    label: `城 (${profile.label})`,
    style: profile.style,
    locked: castle.locked
  };

  const group = element("g", {
    "data-pick": encodeURIComponent(JSON.stringify(pick)),
    class: `ce-castle-precinct ce-castle--${profile.style} ${inspectedId === castle.id ? "ce-is-selected cg-is-selected" : ""}`,
    style: "cursor:pointer"
  });

  // 1. 従来のクラシックスタイル（城の種類が1種類だけだった時）：
  // 旧パーツと旧来の施設間連絡路（castle.accesses）を描画する
  if (profile.style === "classic") {
    renderClassicCastle(group, document, castle, profile);
    return group;
  }

  // 2. 新しく追加された城郭様式（日本式城郭、西洋同心円城、星形要塞、モット＆ベイリー等）：
  // 様式固有の縄張・立体幾何学を構築して描画する。
  // ★重要：城の種類がひとつだけだった時の「施設間を結ぶ道（castle.accesses）」は、
  // 追加された城郭の建物や石垣と整合しない旧パーツ位置に向かって城を横切ってしまうため、
  // 追加された城郭の上には描画しない。
  const plan = buildFortressPlan(document, castle, profile);

  // Layer 1: Courtyards (曲輪内庭・白砂利・石畳・練兵広場・ベイリー土間)
  renderCourtyards(group, plan, profile);

  // Layer 2: Ramparts, Stone Slopes, Motte Mounds, and Curtains (縄張・多重囲壁・石垣・盛土)
  renderRamparts(group, plan, profile);

  // Layer 3: Gates, Masugata Enclosures, Barbicans, and Timber Ramps (枡形虎口・大双塔門・出構え・登城木橋)
  renderDefensiveGates(group, plan, profile);

  // Layer 4: Complex Buildings (連立式天守群・多聞櫓・大広間・書院御殿・礼拝堂・兵舎)
  renderComplexBuildings(group, plan, profile);

  // Layer 5: Towers, Star Bastions, and Corner Yaguras (塔・星形稜堡・隅櫓)
  renderTowersAndBastions(group, plan, profile);

  // Layer 6: Architectural Props (井戸・水盤・庭木・大砲など)
  renderProps(group, plan, profile);

  return group;
}
