import { circuitRing } from "../core/fortifications";
import { polygonCentroid } from "../core/gen/geom";
import type { CastlePart, CastlePlan, CityDocument, Point } from "../core/types";
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
 * Scales polygon outward from its centroid by a factor or absolute margin.
 */
function expandPolygon(points: Point[], marginMeters: number): Point[] {
  const c = polygonCentroid(points);
  return points.map(([x, y]) => {
    const dx = x - c[0];
    const dy = y - c[1];
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return [x, y];
    const factor = (dist + marginMeters) / dist;
    return [c[0] + dx * factor, c[1] + dy * factor];
  });
}

/**
 * Renders decorative ground details (flagstones, gravel, motte hatching, well, etc.)
 */
function renderCourtDetails(parent: SVGElement, castle: CastlePlan, profile: CastleStyleProfile): void {
  const { courtFeatures, palette } = profile;

  // 1. Motte hatching for motte-bailey
  if (courtFeatures.hasMotteHatching && castle.courtyards.length > 0) {
    const mainCourt = castle.courtyards[0];
    const c = polygonCentroid(mainCourt);
    // Draw concentric terrace rings around keep or center
    for (const radius of [8, 14, 20]) {
      parent.appendChild(
        element("circle", {
          cx: String(c[0]),
          cy: String(-c[1]),
          r: String(radius),
          fill: "none",
          stroke: palette.groundStroke,
          "stroke-width": "0.6",
          "stroke-dasharray": "2.5 1.5",
          opacity: "0.6"
        })
      );
    }
  }

  // 2. Court interior elements (Well, Fountain/Pool, Trees)
  for (const court of castle.courtyards) {
    if (court.length < 3) continue;
    const center = polygonCentroid(court);

    if (courtFeatures.hasWell) {
      // Draw stone well / cistern
      const wellG = element("g", { class: "ce-castle-well" });
      wellG.appendChild(
        element("circle", {
          cx: String(center[0]),
          cy: String(-center[1]),
          r: "1.8",
          fill: palette.keepStroke,
          stroke: palette.keepAccent,
          "stroke-width": "0.5"
        })
      );
      wellG.appendChild(
        element("circle", {
          cx: String(center[0]),
          cy: String(-center[1]),
          r: "1.0",
          fill: "#2b404d" // water
        })
      );
      // Well crossbeam
      wellG.appendChild(
        element("line", {
          x1: String(center[0] - 1.5),
          y1: String(-center[1]),
          x2: String(center[0] + 1.5),
          y2: String(-center[1]),
          stroke: palette.keepAccent,
          "stroke-width": "0.4"
        })
      );
      parent.appendChild(wellG);
    }

    if (courtFeatures.hasFountainPool) {
      // Islamic riad pool or Renaissance fountain
      const poolG = element("g", { class: "ce-castle-pool" });
      const poolW = profile.style === "islamic-qalat" ? 4.5 : 3.5;
      poolG.appendChild(
        element("rect", {
          x: String(center[0] - poolW),
          y: String(-center[1] - poolW * 0.6),
          width: String(poolW * 2),
          height: String(poolW * 1.2),
          fill: "#25536b",
          stroke: palette.keepAccent,
          "stroke-width": "0.6",
          rx: profile.style === "islamic-qalat" ? "0.5" : "1.8"
        })
      );
      poolG.appendChild(
        element("circle", {
          cx: String(center[0]),
          cy: String(-center[1]),
          r: "0.8",
          fill: palette.keepAccent
        })
      );
      parent.appendChild(poolG);
    }

    if (courtFeatures.hasGardenTrees) {
      // Garden / courtyard trees (pine for Japanese shiro, cypress for Islamic/Renaissance)
      const treeColor = profile.style === "japanese-shiro" ? "#314f3b" : "#3e5c38";
      for (const [dx, dy] of [
        [-5, -4],
        [6, 5],
        [-6, 4]
      ]) {
        const tx = center[0] + dx;
        const ty = center[1] + dy;
        parent.appendChild(
          element("circle", {
            cx: String(tx),
            cy: String(-ty),
            r: "2.2",
            fill: treeColor,
            stroke: "#203024",
            "stroke-width": "0.4",
            opacity: "0.85"
          })
        );
      }
    }
  }
}

/**
 * Renders keep (主塔 / 天守 / ドンジョン) with historical architectural details.
 */
function renderKeep(parent: SVGElement, part: CastlePart, profile: CastleStyleProfile): void {
  const { keepFeatures, palette } = profile;
  const fp = part.footprint;
  const box = footprintBox(fp);
  const center = box.center;

  // 1. Rampart Base / 石垣天守台 / モット基壇
  if (keepFeatures.hasRampartBase) {
    const baseMargin = profile.style === "japanese-shiro" ? 2.8 : 2.0;
    const baseFp = expandPolygon(fp, baseMargin);
    parent.appendChild(
      element("path", {
        d: polygon(baseFp),
        fill: palette.rampartFill,
        stroke: palette.rampartStroke,
        "stroke-width": "1.0",
        class: "ce-keep-rampart-base"
      })
    );

    // Stone rampart corner / fan slope hatch lines for Japanese shiro
    if (profile.style === "japanese-shiro") {
      for (let i = 0; i < baseFp.length; i++) {
        const p1 = baseFp[i];
        const p2 = fp[i % fp.length];
        parent.appendChild(
          element("line", {
            x1: String(p1[0]),
            y1: String(-p1[1]),
            x2: String(p2[0]),
            y2: String(-p2[1]),
            stroke: palette.rampartStroke,
            "stroke-width": "0.6",
            opacity: "0.75"
          })
        );
      }
    }
  }

  // 2. Keep main body
  parent.appendChild(
    element("path", {
      d: polygon(fp),
      fill: palette.keepWall,
      stroke: palette.keepStroke,
      "stroke-width": "1.6",
      class: "ce-keep-body"
    })
  );

  // 3. Buttresses (控え壁) for Norman keep / Castra
  if (keepFeatures.hasButtresses && fp.length >= 4) {
    for (let i = 0; i < fp.length; i++) {
      const a = fp[i];
      const b = fp[(i + 1) % fp.length];
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 6) continue;
      const normal: Point = [-dy / len, dx / len];
      // Buttress projection
      const buttressW = 1.2;
      const buttressD = 0.9;
      parent.appendChild(
        element("rect", {
          x: String(mid[0] + normal[0] * buttressD * 0.5 - buttressW / 2),
          y: String(-mid[1] - normal[1] * buttressD * 0.5 - buttressW / 2),
          width: String(buttressW),
          height: String(buttressW),
          fill: palette.keepAccent,
          stroke: palette.keepStroke,
          "stroke-width": "0.6"
        })
      );
    }
  }

  // 4. Corner turrets (Bartizans / 角塔 / 隅櫓)
  if (keepFeatures.turretType === "square") {
    const turretSize = 2.4;
    for (const [x, y] of fp) {
      parent.appendChild(
        element("rect", {
          x: String(x - turretSize / 2),
          y: String(-y - turretSize / 2),
          width: String(turretSize),
          height: String(turretSize),
          fill: palette.keepAccent,
          stroke: palette.keepStroke,
          "stroke-width": "0.8",
          class: "ce-keep-turret"
        })
      );
    }
  } else if (keepFeatures.turretType === "round") {
    const turretRadius = 1.8;
    for (const [x, y] of fp) {
      parent.appendChild(
        element("circle", {
          cx: String(x),
          cy: String(-y),
          r: String(turretRadius),
          fill: palette.keepAccent,
          stroke: palette.keepStroke,
          "stroke-width": "0.8",
          class: "ce-keep-turret-round"
        })
      );
    }
  } else if (keepFeatures.turretType === "tenshu_corner") {
    // Japanese shiro corner hip/gable roof accent
    const cornerSize = 2.2;
    for (const [x, y] of fp) {
      parent.appendChild(
        element("rect", {
          x: String(x - cornerSize / 2),
          y: String(-y - cornerSize / 2),
          width: String(cornerSize),
          height: String(cornerSize),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.6",
          class: "ce-keep-tenshu-yagura"
        })
      );
    }
  }

  // 5. Roof / Upper terrace
  if (keepFeatures.roofStyle === "tenshu_gables") {
    // Tiered roofs (重なり合う屋根)
    const tier1 = expandPolygon(fp, -1.8);
    if (tier1.length >= 3) {
      parent.appendChild(
        element("path", {
          d: polygon(tier1),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.8"
        })
      );
    }
    const tier2 = expandPolygon(fp, -3.6);
    if (tier2.length >= 3) {
      parent.appendChild(
        element("path", {
          d: polygon(tier2),
          fill: palette.keepAccent,
          stroke: palette.keepStroke,
          "stroke-width": "0.8"
        })
      );
      // Ridge line / 棟瓦
      const tBox = footprintBox(tier2);
      parent.appendChild(
        element("line", {
          x1: String(tBox.center[0] - tBox.width * 0.35),
          y1: String(-tBox.center[1]),
          x2: String(tBox.center[0] + tBox.width * 0.35),
          y2: String(-tBox.center[1]),
          stroke: palette.keepRoof,
          "stroke-width": "1.0",
          "stroke-linecap": "round"
        })
      );
    }
  } else if (keepFeatures.roofStyle === "crenellated_open") {
    // Open parapet walkway & inner roof
    const inner = expandPolygon(fp, -1.4);
    if (inner.length >= 3) {
      parent.appendChild(
        element("path", {
          d: polygon(inner),
          fill: palette.keepRoof,
          stroke: palette.keepAccent,
          "stroke-width": "0.6"
        })
      );
    }
  } else if (keepFeatures.roofStyle === "round_conical") {
    // Conical roof cap with center finial
    parent.appendChild(
      element("circle", {
        cx: String(center[0]),
        cy: String(-center[1]),
        r: String(Math.min(box.width, box.height) * 0.35),
        fill: palette.keepRoof,
        stroke: palette.keepStroke,
        "stroke-width": "0.8"
      })
    );
    parent.appendChild(
      element("circle", {
        cx: String(center[0]),
        cy: String(-center[1]),
        r: "0.8",
        fill: palette.keepAccent
      })
    );
  } else if (keepFeatures.roofStyle === "timber_deck") {
    // Wood plank deck texture
    const inner = expandPolygon(fp, -0.8);
    parent.appendChild(
      element("path", {
        d: polygon(inner),
        fill: palette.keepRoof,
        stroke: palette.keepStroke,
        "stroke-width": "0.6"
      })
    );
  } else if (keepFeatures.roofStyle === "flat_dome") {
    // Central dome (Qubba) or bastion deck
    parent.appendChild(
      element("circle", {
        cx: String(center[0]),
        cy: String(-center[1]),
        r: String(Math.min(box.width, box.height) * 0.28),
        fill: palette.keepRoof,
        stroke: palette.keepStroke,
        "stroke-width": "0.6"
      })
    );
  }

  // 6. Arrow slits (狭間)
  if (keepFeatures.hasArrowSlits) {
    for (const [x, y] of fp) {
      const sx = x + (center[0] - x) * 0.2;
      const sy = y + (center[1] - y) * 0.2;
      parent.appendChild(
        element("circle", {
          cx: String(sx),
          cy: String(-sy),
          r: "0.4",
          fill: palette.keepStroke
        })
      );
    }
  }
}

/**
 * Renders ranges, halls, chapels, and service wings with pitched roofs, chimneys, or arcades.
 */
function renderRangeOrWing(parent: SVGElement, part: CastlePart, profile: CastleStyleProfile): void {
  const { rangeFeatures, palette } = profile;
  const isHall = part.role === "hall";
  const isChapel = part.role === "chapel";
  const isService = part.role === "service";

  const wallFill = isChapel ? palette.chapelWall : isService ? palette.serviceWall : palette.rangeWall;
  const strokeColor = isChapel ? palette.chapelStroke : isService ? palette.serviceStroke : palette.rangeStroke;

  const fp = part.footprint;
  const box = footprintBox(fp);

  // Main building footprint
  parent.appendChild(
    element("path", {
      d: polygon(fp),
      fill: wallFill,
      stroke: strokeColor,
      "stroke-width": isHall ? "1.2" : "0.9",
      class: `ce-castle-${part.role}`
    })
  );

  // Roof ridge line (棟線)
  if (box.width > 2 && box.height > 2) {
    const isHorizontal = box.width >= box.height;
    const ridgeStart: Point = isHorizontal
      ? [box.center[0] - box.width * 0.4, box.center[1]]
      : [box.center[0], box.center[1] - box.height * 0.4];
    const ridgeEnd: Point = isHorizontal
      ? [box.center[0] + box.width * 0.4, box.center[1]]
      : [box.center[0], box.center[1] + box.height * 0.4];

    parent.appendChild(
      element("line", {
        x1: String(ridgeStart[0]),
        y1: String(-ridgeStart[1]),
        x2: String(ridgeEnd[0]),
        y2: String(-ridgeEnd[1]),
        stroke: palette.rangeRoof,
        "stroke-width": "0.8",
        "stroke-linecap": "round",
        class: "ce-castle-roof-ridge"
      })
    );

    // Chimneys for residential ranges / great hall
    if (rangeFeatures.hasChimneys && (isHall || part.role === "range")) {
      parent.appendChild(
        element("rect", {
          x: String(ridgeStart[0] - 0.5),
          y: String(-ridgeStart[1] - 0.5),
          width: "1.0",
          height: "1.0",
          fill: palette.keepStroke,
          stroke: palette.rangeRoof,
          "stroke-width": "0.3"
        })
      );
    }
  }

  // Chapel Apse (半円形後陣)
  if (isChapel) {
    const apseRadius = Math.min(2.5, Math.min(box.width, box.height) * 0.35);
    parent.appendChild(
      element("circle", {
        cx: String(box.center[0] + (box.width >= box.height ? box.width * 0.5 : 0)),
        cy: String(-(box.center[1] + (box.width < box.height ? box.height * 0.5 : 0))),
        r: String(apseRadius),
        fill: palette.chapelWall,
        stroke: palette.chapelStroke,
        "stroke-width": "0.8"
      })
    );
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
  if (!circuit) return element("g", {});

  const profile = resolveCastleStyle(document, castle);
  const { palette } = profile;

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

  // 1. Castle Precinct Base Ground (内郭・城域地盤)
  const ring = circuitRing(document, circuit);
  if (ring.length >= 3) {
    group.appendChild(
      element("path", {
        d: polygon(ring),
        fill: palette.groundFill,
        "fill-opacity": "0.45",
        stroke: palette.groundStroke,
        "stroke-width": "0.4"
      })
    );
  }

  // 2. Courtyards (中庭・曲輪)
  for (const court of castle.courtyards) {
    group.appendChild(
      element("path", {
        d: polygon(court),
        fill: palette.courtFill,
        stroke: palette.courtStroke,
        "stroke-width": "0.6"
      })
    );
  }

  // 3. Courtyard details (Well, Pool, Trees, Motte)
  renderCourtDetails(group, castle, profile);

  // 4. Access ways & corridors (城内動線・登城路)
  for (const access of castle.accesses) {
    group.appendChild(
      element("path", {
        d: line(access.points),
        fill: "none",
        stroke: palette.pathStroke,
        "stroke-width": String(access.widthMeters),
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        opacity: "0.9"
      })
    );
  }

  // 5. Buildings (Keep, Hall, Range, Service, Chapel)
  for (const part of castle.parts) {
    if (part.role === "keep") {
      renderKeep(group, part, profile);
    } else {
      renderRangeOrWing(group, part, profile);
    }

    // Entrances
    for (const entrance of part.entrances) {
      group.appendChild(
        element("circle", {
          cx: String(entrance[0]),
          cy: String(-entrance[1]),
          r: "1.4",
          fill: palette.keepAccent,
          stroke: palette.keepStroke,
          "stroke-width": "0.4"
        })
      );
    }
  }

  return group;
}
