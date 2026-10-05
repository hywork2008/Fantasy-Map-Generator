import { outerWallRing } from "../core/concealStreets";
import { featureGroupVertices } from "../core/features";
import { nearestOnPolyline, pointInPolygon } from "../core/gen/geom";
import { makeRng } from "../core/gen/prng";
import type { BurgSiteBiome } from "../core/gen/site/burgSiteDescriptor";
import type { CityDocument, Point } from "../core/types";
import { waterPolygons } from "../core/waterGeometry";
import type { RenderQuality } from "./svg";

export type LandscapeCategory =
  | "forest"
  | "conifer"
  | "tropical"
  | "savanna"
  | "desert"
  | "wetland"
  | "tundra"
  | "glacier"
  | "grassland";

export interface LandscapeTheme {
  category: LandscapeCategory;
  groundFill: string;
  suburbFaceFill: string;
  featureDensity: number;
  label: string;
}

/** Resolve landscape visual theme from optional burg biome. */
export function resolveLandscapeTheme(biome?: BurgSiteBiome): LandscapeTheme {
  if (!biome) {
    return {
      category: "grassland",
      groundFill: "#d5cfbf",
      suburbFaceFill: "#d5cfbf",
      featureDensity: 0.6,
      label: "Default"
    };
  }

  const key = biome.key ?? "";
  const name = (biome.name ?? "").toLowerCase();
  const tags = new Set(biome.tags ?? []);

  // ── Step 1: Explicit mapping by standard / known biome key ─────────────────
  if (key) {
    switch (key) {
      case "hotDesert":
      case "coldDesert":
      case "xericShrubland":
        return {
          category: "desert",
          groundFill: "#e8ddba",
          suburbFaceFill: "#e4d8b2",
          featureDensity: 0.45,
          label: biome.name
        };
      case "glacier":
        return {
          category: "glacier",
          groundFill: "#d8e5e8",
          suburbFaceFill: "#d2dfe3",
          featureDensity: 0.35,
          label: biome.name
        };
      case "tundra":
      case "alpineTundra":
        return {
          category: "tundra",
          groundFill: "#c9beaa",
          suburbFaceFill: "#c4b8a3",
          featureDensity: 0.4,
          label: biome.name
        };
      case "taiga":
      case "temperateConiferousForest":
      case "montaneForest":
        return {
          category: "conifer",
          groundFill: "#b5c4a7",
          suburbFaceFill: "#afbfa0",
          featureDensity: 0.75,
          label: biome.name
        };
      case "savanna":
      case "tropicalDryForest":
        return {
          category: "savanna",
          groundFill: "#ded8aa",
          suburbFaceFill: "#d8d1a1",
          featureDensity: 0.5,
          label: biome.name
        };
      case "tropicalRainforest":
      case "tropicalSeasonalForest":
      case "mangrove":
      case "cloudForest":
        return {
          category: "tropical",
          groundFill: "#b9cca0",
          suburbFaceFill: "#b2c598",
          featureDensity: 0.8,
          label: biome.name
        };
      case "wetland":
      case "borealPeatland":
      case "floodedForest":
        return {
          category: "wetland",
          groundFill: "#b4c5a5",
          suburbFaceFill: "#adbe9e",
          featureDensity: 0.65,
          label: biome.name
        };
      case "temperateDeciduousForest":
      case "temperateRainforest":
      case "centralEuropeanGreatForest":
        return {
          category: "forest",
          groundFill: "#c2d4ac",
          suburbFaceFill: "#bbcda4",
          featureDensity: 0.8,
          label: biome.name
        };
      case "grassland":
      case "coldSteppe":
      case "heathMoorland":
      case "mediterraneanWoodlandScrub":
        return {
          category: "grassland",
          groundFill: "#d2dab2",
          suburbFaceFill: "#ccd4aa",
          featureDensity: 0.55,
          label: biome.name
        };
    }
  }

  // ── Step 2: Fallback inference from tags and name (e.g. custom biomes) ──────
  // Specific multi-word patterns before generic substrings
  if (name.includes("temperate rainforest")) {
    return {
      category: "forest",
      groundFill: "#c2d4ac",
      suburbFaceFill: "#bbcda4",
      featureDensity: 0.8,
      label: biome.name
    };
  }

  if (tags.has("savanna") || name.includes("savanna") || name.includes("dry forest")) {
    return {
      category: "savanna",
      groundFill: "#ded8aa",
      suburbFaceFill: "#d8d1a1",
      featureDensity: 0.5,
      label: biome.name
    };
  }

  if (tags.has("desert") || name.includes("desert") || name.includes("dune")) {
    return {
      category: "desert",
      groundFill: "#e8ddba",
      suburbFaceFill: "#e4d8b2",
      featureDensity: 0.45,
      label: biome.name
    };
  }

  if (tags.has("snow") || name.includes("glacier") || name.includes("snowfield")) {
    return {
      category: "glacier",
      groundFill: "#d8e5e8",
      suburbFaceFill: "#d2dfe3",
      featureDensity: 0.35,
      label: biome.name
    };
  }

  if (name.includes("tundra")) {
    return {
      category: "tundra",
      groundFill: "#c9beaa",
      suburbFaceFill: "#c4b8a3",
      featureDensity: 0.4,
      label: biome.name
    };
  }

  if (name.includes("taiga") || name.includes("conifer") || name.includes("pine") || name.includes("spruce")) {
    return {
      category: "conifer",
      groundFill: "#b5c4a7",
      suburbFaceFill: "#afbfa0",
      featureDensity: 0.75,
      label: biome.name
    };
  }

  if (
    (tags.has("tropical") && tags.has("forest")) ||
    name.includes("tropical") ||
    name.includes("rainforest") ||
    name.includes("jungle")
  ) {
    return {
      category: "tropical",
      groundFill: "#b9cca0",
      suburbFaceFill: "#b2c598",
      featureDensity: 0.8,
      label: biome.name
    };
  }

  if (
    tags.has("wetland") ||
    name.includes("wetland") ||
    name.includes("peatland") ||
    name.includes("swamp") ||
    name.includes("marsh")
  ) {
    return {
      category: "wetland",
      groundFill: "#b4c5a5",
      suburbFaceFill: "#adbe9e",
      featureDensity: 0.65,
      label: biome.name
    };
  }

  if (tags.has("forest") || name.includes("forest") || name.includes("woodland")) {
    return {
      category: "forest",
      groundFill: "#c2d4ac",
      suburbFaceFill: "#bbcda4",
      featureDensity: 0.8,
      label: biome.name
    };
  }

  return {
    category: "grassland",
    groundFill: "#d2dab2",
    suburbFaceFill: "#ccd4aa",
    featureDensity: 0.55,
    label: biome.name
  };
}

/** Returns the map background / ground fill color based on document biome. */
export function getLandscapeGroundColor(document: CityDocument): string {
  if (document.appearance !== "town") return "#e1dfd4";
  return resolveLandscapeTheme(document.biome).groundFill;
}

/** Returns the fill color for unassigned/empty land faces to blend with the landscape. */
export function getLandscapeSuburbFaceColor(document: CityDocument): string {
  if (document.appearance !== "town") return "#e1dfd4";
  return resolveLandscapeTheme(document.biome).suburbFaceFill;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ─── Symbol Renderers ────────────────────────────────────────────────────────

function renderCopse(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-tree ce-landscape-tree--copse" });
  const r = 9 * scale;
  // Small trunk shadow & stump
  g.append(
    svgElement("path", {
      d: `M${x - r * 0.4} ${y + r * 0.7} Q${x} ${y + r * 0.9} ${x + r * 0.4} ${y + r * 0.7}`,
      stroke: "#382d22",
      "stroke-width": String(Math.max(1, 1.2 * scale)),
      fill: "none"
    }),
    // Main cluster canopy lobes
    svgElement("circle", {
      cx: String(x - r * 0.5),
      cy: String(y - r * 0.2),
      r: String(r * 0.75),
      fill: "#4f7344",
      stroke: "#334f2a",
      "stroke-width": "0.7"
    }),
    svgElement("circle", {
      cx: String(x + r * 0.5),
      cy: String(y - r * 0.2),
      r: String(r * 0.75),
      fill: "#4a6e3e",
      stroke: "#334f2a",
      "stroke-width": "0.7"
    }),
    svgElement("circle", {
      cx: String(x),
      cy: String(y - r * 0.5),
      r: String(r * 0.85),
      fill: "#557849",
      stroke: "#334f2a",
      "stroke-width": "0.7"
    }),
    svgElement("circle", {
      cx: String(x),
      cy: String(y - r * 0.55),
      r: String(r * 0.45),
      fill: "#6b915b",
      stroke: "none",
      opacity: "0.8"
    })
  );
  return g;
}

function renderBroadleaf(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-tree ce-landscape-tree--broadleaf" });
  const r = 7 * scale;
  g.append(
    svgElement("line", {
      x1: String(x),
      y1: String(y + r * 0.8),
      x2: String(x),
      y2: String(y),
      stroke: "#4a3c2c",
      "stroke-width": String(Math.max(1, 1.3 * scale)),
      "stroke-linecap": "round"
    }),
    svgElement("circle", {
      cx: String(x),
      cy: String(y - r * 0.3),
      r: String(r),
      fill: "#5a7f4c",
      stroke: "#38542e",
      "stroke-width": "0.7"
    }),
    svgElement("circle", {
      cx: String(x - r * 0.2),
      cy: String(y - r * 0.45),
      r: String(r * 0.45),
      fill: "#6f965e",
      stroke: "none",
      opacity: "0.8"
    })
  );
  return g;
}

function renderConifer(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-tree ce-landscape-tree--conifer" });
  const w = 6 * scale;
  const h = 14 * scale;
  g.append(
    svgElement("line", {
      x1: String(x),
      y1: String(y + h * 0.1),
      x2: String(x),
      y2: String(y + h * 0.3),
      stroke: "#3b3024",
      "stroke-width": String(Math.max(1, 1.2 * scale)),
      "stroke-linecap": "round"
    }),
    // 3 tiered triangles
    svgElement("polygon", {
      points: `${x},${y - h * 0.2} ${x - w * 0.9},${y + h * 0.2} ${x + w * 0.9},${y + h * 0.2}`,
      fill: "#324e35",
      stroke: "#203423",
      "stroke-width": "0.6"
    }),
    svgElement("polygon", {
      points: `${x},${y - h * 0.55} ${x - w * 0.75},${y - h * 0.15} ${x + w * 0.75},${y - h * 0.15}`,
      fill: "#3a593e",
      stroke: "#203423",
      "stroke-width": "0.6"
    }),
    svgElement("polygon", {
      points: `${x},${y - h * 0.9} ${x - w * 0.55},${y - h * 0.5} ${x + w * 0.55},${y - h * 0.5}`,
      fill: "#45694a",
      stroke: "#203423",
      "stroke-width": "0.6"
    })
  );
  return g;
}

function renderPalm(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-tree ce-landscape-tree--palm" });
  const h = 13 * scale;
  // Curved trunk
  g.append(
    svgElement("path", {
      d: `M${x} ${y + h * 0.2} Q${x + 3 * scale} ${y - h * 0.3} ${x + 1 * scale} ${y - h * 0.7}`,
      stroke: "#544331",
      "stroke-width": String(Math.max(1, 1.4 * scale)),
      fill: "none",
      "stroke-linecap": "round"
    })
  );
  const topX = x + 1 * scale;
  const topY = y - h * 0.7;
  // Fronds
  const fronds = [
    `M${topX} ${topY} Q${topX - 8 * scale} ${topY - 4 * scale} ${topX - 10 * scale} ${topY + 3 * scale}`,
    `M${topX} ${topY} Q${topX + 8 * scale} ${topY - 4 * scale} ${topX + 10 * scale} ${topY + 3 * scale}`,
    `M${topX} ${topY} Q${topX - 6 * scale} ${topY - 9 * scale} ${topX - 8 * scale} ${topY - 6 * scale}`,
    `M${topX} ${topY} Q${topX + 6 * scale} ${topY - 9 * scale} ${topX + 8 * scale} ${topY - 6 * scale}`,
    `M${topX} ${topY} Q${topX} ${topY - 11 * scale} ${topX} ${topY - 8 * scale}`
  ];
  for (const d of fronds) {
    g.appendChild(
      svgElement("path", {
        d,
        stroke: "#3d6b33",
        "stroke-width": String(Math.max(1, 1.1 * scale)),
        fill: "none",
        "stroke-linecap": "round"
      })
    );
  }
  return g;
}

function renderAcacia(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-tree ce-landscape-tree--acacia" });
  const w = 11 * scale;
  const h = 11 * scale;
  // Branching trunk
  g.append(
    svgElement("path", {
      d: `M${x} ${y + h * 0.2} L${x} ${y - h * 0.3} M${x} ${y - h * 0.3} L${x - w * 0.4} ${y - h * 0.6} M${x} ${y - h * 0.3} L${x + w * 0.4} ${y - h * 0.6}`,
      stroke: "#4a3c2c",
      "stroke-width": String(Math.max(1, 1.2 * scale)),
      fill: "none",
      "stroke-linecap": "round"
    }),
    // Flat-topped horizontal canopy
    svgElement("ellipse", {
      cx: String(x),
      cy: String(y - h * 0.75),
      rx: String(w * 0.85),
      ry: String(h * 0.35),
      fill: "#6f7d43",
      stroke: "#485428",
      "stroke-width": "0.7"
    }),
    svgElement("ellipse", {
      cx: String(x),
      cy: String(y - h * 0.8),
      rx: String(w * 0.55),
      ry: String(h * 0.18),
      fill: "#849454",
      stroke: "none",
      opacity: "0.85"
    })
  );
  return g;
}

function renderCactus(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-feature ce-landscape-feature--cactus" });
  const h = 10 * scale;
  const w = 5 * scale;
  g.append(
    // Central stem
    svgElement("line", {
      x1: String(x),
      y1: String(y + h * 0.3),
      x2: String(x),
      y2: String(y - h * 0.7),
      stroke: "#5d784a",
      "stroke-width": String(Math.max(1.2, 1.8 * scale)),
      "stroke-linecap": "round"
    }),
    // Left arm
    svgElement("path", {
      d: `M${x} ${y - h * 0.1} L${x - w} ${y - h * 0.1} L${x - w} ${y - h * 0.45}`,
      stroke: "#5d784a",
      "stroke-width": String(Math.max(1, 1.4 * scale)),
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }),
    // Right arm
    svgElement("path", {
      d: `M${x} ${y - h * 0.25} L${x + w} ${y - h * 0.25} L${x + w} ${y - h * 0.55}`,
      stroke: "#5d784a",
      "stroke-width": String(Math.max(1, 1.4 * scale)),
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    })
  );
  return g;
}

function renderDune(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-feature ce-landscape-feature--dune" });
  const w = 18 * scale;
  const h = 4 * scale;
  g.append(
    // Dune crescent ridge
    svgElement("path", {
      d: `M${x - w} ${y + h * 0.5} Q${x} ${y - h} ${x + w} ${y + h * 0.5}`,
      stroke: "#c4a96b",
      "stroke-width": String(Math.max(1, 1.2 * scale)),
      fill: "none",
      "stroke-linecap": "round"
    }),
    svgElement("path", {
      d: `M${x - w * 0.6} ${y + h * 0.8} Q${x + w * 0.1} ${y} ${x + w * 0.8} ${y + h * 0.8}`,
      stroke: "#d4bc7e",
      "stroke-width": String(Math.max(0.8, scale)),
      fill: "none",
      "stroke-linecap": "round",
      opacity: "0.7"
    })
  );
  return g;
}

function renderReeds(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-feature ce-landscape-feature--reeds" });
  const h = 8 * scale;
  // Cluster of 4 slender reed stalks
  g.append(
    svgElement("line", {
      x1: String(x - 2 * scale),
      y1: String(y + 2 * scale),
      x2: String(x - 3 * scale),
      y2: String(y - h * 0.8),
      stroke: "#4a6c42",
      "stroke-width": String(Math.max(0.7, 0.9 * scale)),
      "stroke-linecap": "round"
    }),
    svgElement("line", {
      x1: String(x),
      y1: String(y + 2 * scale),
      x2: String(x + 0.5 * scale),
      y2: String(y - h),
      stroke: "#45663d",
      "stroke-width": String(Math.max(0.8, 1.1 * scale)),
      "stroke-linecap": "round"
    }),
    svgElement("line", {
      x1: String(x + 2 * scale),
      y1: String(y + 2 * scale),
      x2: String(x + 3 * scale),
      y2: String(y - h * 0.75),
      stroke: "#4a6c42",
      "stroke-width": String(Math.max(0.7, 0.9 * scale)),
      "stroke-linecap": "round"
    }),
    // Reed heads
    svgElement("circle", {
      cx: String(x + 0.5 * scale),
      cy: String(y - h),
      r: String(0.9 * scale),
      fill: "#63503a"
    })
  );
  return g;
}

function renderMarshPuddle(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-feature ce-landscape-feature--marsh" });
  const rx = 10 * scale;
  const ry = 4.5 * scale;
  g.append(
    svgElement("ellipse", {
      cx: String(x),
      cy: String(y),
      rx: String(rx),
      ry: String(ry),
      fill: "#456d7f",
      opacity: "0.45",
      stroke: "#385c6d",
      "stroke-width": "0.6"
    })
  );
  return g;
}

function renderRock(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-feature ce-landscape-feature--rock" });
  const s = 6 * scale;
  g.append(
    svgElement("polygon", {
      points: `${x - s * 0.8},${y + s * 0.4} ${x - s * 0.3},${y - s * 0.7} ${x + s * 0.7},${y - s * 0.4} ${x + s * 0.9},${y + s * 0.5}`,
      fill: "#8c8577",
      stroke: "#4a453b",
      "stroke-width": "0.7"
    }),
    svgElement("line", {
      x1: String(x - s * 0.3),
      y1: String(y - s * 0.7),
      x2: String(x + s * 0.1),
      y2: String(y + s * 0.45),
      stroke: "#5c574c",
      "stroke-width": "0.6"
    })
  );
  return g;
}

function renderCrevasse(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-feature ce-landscape-feature--crevasse" });
  const len = 12 * scale;
  g.append(
    svgElement("path", {
      d: `M${x - len} ${y - len * 0.2} L${x - len * 0.3} ${y} L${x + len * 0.2} ${y - len * 0.3} L${x + len} ${y + len * 0.1}`,
      stroke: "#688d9c",
      "stroke-width": String(Math.max(1, 1.2 * scale)),
      fill: "none",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    })
  );
  return g;
}

function renderGrassTuft(x: number, y: number, scale: number): SVGElement {
  const g = svgElement("g", { class: "ce-landscape-feature ce-landscape-feature--grass" });
  const h = 5 * scale;
  g.append(
    svgElement("path", {
      d: `M${x - 3 * scale} ${y} Q${x - 4 * scale} ${y - h} ${x - 5 * scale} ${y - h * 0.9} M${x} ${y} Q${x} ${y - h * 1.1} ${x - 1 * scale} ${y - h} M${x + 3 * scale} ${y} Q${x + 4 * scale} ${y - h} ${x + 5 * scale} ${y - h * 0.9}`,
      stroke: "#5d7e48",
      "stroke-width": String(Math.max(0.7, 0.9 * scale)),
      fill: "none",
      "stroke-linecap": "round"
    })
  );
  return g;
}

// ─── Layer Generator ─────────────────────────────────────────────────────────

/**
 * Procedurally generates the landscape scenery layer for the outskirts/suburbs
 * of the city matching its FMG biome.
 */
export function renderLandscapeLayer(
  document: CityDocument,
  town: boolean,
  quality: RenderQuality = "detailed"
): SVGGElement {
  const layer = svgElement("g", {
    class: "ce-landscape-layer",
    "data-scene-layer": "landscape",
    "pointer-events": "none"
  }) as SVGGElement;

  if (!town) return layer;

  const theme = resolveLandscapeTheme(document.biome);
  const extent = document.frame.extentMeters;
  const half = extent / 2;
  const cityRadius = document.frame.cityRadiusMeters;

  // 1. Collect exclusion geometry
  const waters = waterPolygons(document);
  const waterAreas = document.waterAreas ?? [];
  const wallRing = outerWallRing(document);

  // Road paths for clearance
  const roadPolylines: Point[][] = [];
  if (document.frameRoads) {
    for (const fr of document.frameRoads) {
      for (const p of fr.pieces) {
        if (p.points.length >= 2) roadPolylines.push(p.points);
      }
    }
  }
  for (const group of document.featureGroups) {
    if (group.kind === "road") {
      const vIds = featureGroupVertices(document, group);
      const pts = vIds.map(id => document.mesh.vertices[id]?.point).filter((pt): pt is Point => !!pt);
      if (pts.length >= 2) roadPolylines.push(pts);
    }
  }

  // Wall clearance lines
  const wallLines: Point[][] = [];
  for (const group of document.featureGroups) {
    if (group.kind === "wall") {
      const vIds = featureGroupVertices(document, group);
      const pts = vIds.map(id => document.mesh.vertices[id]?.point).filter((pt): pt is Point => !!pt);
      if (pts.length >= 2) wallLines.push(pts);
    }
  }

  // Regional settlement clearances
  const otherSettlements = document.sceneRegions?.regionalContext.settlements ?? [];

  // 2. Exclusion checker
  function isExcluded(pt: Point, buffer = 0): boolean {
    // Water exclusion
    if (waters.some(poly => pointInPolygon(pt, poly))) return true;
    if (waterAreas.some(w => pointInPolygon(pt, w.polygon))) return true;
    for (const group of document.featureGroups) {
      if (group.kind === "river") {
        const pts = group.vertices.map(id => document.mesh.vertices[id]?.point).filter((p): p is Point => !!p);
        if (pts.length >= 2) {
          const hit = nearestOnPolyline(pt, pts);
          const w = group.style.widthMeters || 12;
          if (hit.dist < w / 2 + 14 + buffer) return true;
        }
      }
    }

    // Outer wall and urban core exclusion
    if (wallRing) {
      if (pointInPolygon(pt, wallRing)) return true;
      if (nearestOnPolyline(pt, [...wallRing, wallRing[0]]).dist < 42 + buffer) return true;
    } else {
      if (Math.hypot(pt[0], pt[1]) < cityRadius * 0.9 + buffer) return true;
    }

    // Separate wall line check
    for (const wl of wallLines) {
      if (nearestOnPolyline(pt, wl).dist < 38 + buffer) return true;
    }

    // Road clearance (22m)
    for (const rl of roadPolylines) {
      if (nearestOnPolyline(pt, rl).dist < 20 + buffer) return true;
    }

    // Neighboring regional settlements clearance
    for (const st of otherSettlements) {
      const dist = Math.hypot(pt[0] - st.center[0], pt[1] - st.center[1]);
      if (dist < (st.radiusMeters ?? 20) + 30 + buffer) return true;
    }

    return false;
  }

  // 3. Grid-based sampling with jitter
  const seedString = `${document.generationSeed ?? document.format}:${extent}:${theme.category}`;
  const rng = makeRng(seedString);

  // Adjust cell spacing & density by quality and biome
  const baseSpacing = extent >= 2400 ? 56 : 42;
  const qualityFactor = quality === "minimal" ? 0.35 : quality === "light" ? 0.65 : 1.0;
  const targetProbability = theme.featureDensity * qualityFactor;

  const minX = -half + baseSpacing * 0.5;
  const maxX = half - baseSpacing * 0.5;
  const minY = -half + baseSpacing * 0.5;
  const maxY = half - baseSpacing * 0.5;

  for (let gx = minX; gx <= maxX; gx += baseSpacing) {
    for (let gy = minY; gy <= maxY; gy += baseSpacing) {
      if (rng() > targetProbability) continue;

      // Jitter candidate position
      const jx = gx + (rng() - 0.5) * baseSpacing * 0.8;
      const jy = gy + (rng() - 0.5) * baseSpacing * 0.8;
      const cand: Point = [jx, jy];

      if (isExcluded(cand)) continue;

      const scale = 0.8 + rng() * 0.45;
      const svgX = jx;
      const svgY = -jy;

      // Render category-specific landscape elements
      switch (theme.category) {
        case "forest": {
          const roll = rng();
          if (roll < 0.6) {
            layer.appendChild(renderCopse(svgX, svgY, scale));
            // Cluster companion
            if (rng() < 0.5) {
              const cx = svgX + (rng() - 0.5) * 16 * scale;
              const cy = svgY + (rng() - 0.5) * 16 * scale;
              if (!isExcluded([cx, -cy], 6)) layer.appendChild(renderBroadleaf(cx, cy, scale * 0.75));
            }
          } else if (roll < 0.88) {
            layer.appendChild(renderBroadleaf(svgX, svgY, scale));
          } else {
            layer.appendChild(renderGrassTuft(svgX, svgY, scale));
          }
          break;
        }
        case "conifer": {
          const roll = rng();
          if (roll < 0.65) {
            layer.appendChild(renderConifer(svgX, svgY, scale));
            if (rng() < 0.55) {
              const cx = svgX + (rng() - 0.5) * 14 * scale;
              const cy = svgY + (rng() - 0.5) * 14 * scale;
              if (!isExcluded([cx, -cy], 5)) layer.appendChild(renderConifer(cx, cy, scale * 0.7));
            }
          } else if (roll < 0.85) {
            layer.appendChild(renderRock(svgX, svgY, scale));
          } else {
            layer.appendChild(renderGrassTuft(svgX, svgY, scale));
          }
          break;
        }
        case "tropical": {
          const roll = rng();
          if (roll < 0.5) {
            layer.appendChild(renderPalm(svgX, svgY, scale));
            if (rng() < 0.6) {
              const cx = svgX + (rng() - 0.5) * 12 * scale;
              const cy = svgY + (rng() - 0.5) * 12 * scale;
              if (!isExcluded([cx, -cy], 5)) layer.appendChild(renderPalm(cx, cy, scale * 0.8));
            }
          } else if (roll < 0.85) {
            layer.appendChild(renderCopse(svgX, svgY, scale * 1.1));
          } else {
            layer.appendChild(renderGrassTuft(svgX, svgY, scale));
          }
          break;
        }
        case "savanna": {
          const roll = rng();
          if (roll < 0.45) {
            layer.appendChild(renderAcacia(svgX, svgY, scale));
          } else if (roll < 0.8) {
            layer.appendChild(renderGrassTuft(svgX, svgY, scale * 1.1));
          } else {
            layer.appendChild(renderRock(svgX, svgY, scale * 0.8));
          }
          break;
        }
        case "desert": {
          const roll = rng();
          if (roll < 0.4) {
            layer.appendChild(renderDune(svgX, svgY, scale * 1.2));
          } else if (roll < 0.75) {
            layer.appendChild(renderCactus(svgX, svgY, scale));
          } else {
            layer.appendChild(renderRock(svgX, svgY, scale));
          }
          break;
        }
        case "wetland": {
          const roll = rng();
          if (roll < 0.45) {
            layer.appendChild(renderReeds(svgX, svgY, scale));
            if (rng() < 0.5) {
              const cx = svgX + (rng() - 0.5) * 10 * scale;
              const cy = svgY + (rng() - 0.5) * 10 * scale;
              if (!isExcluded([cx, -cy])) layer.appendChild(renderReeds(cx, cy, scale * 0.8));
            }
          } else if (roll < 0.75) {
            layer.appendChild(renderMarshPuddle(svgX, svgY, scale));
          } else {
            layer.appendChild(renderBroadleaf(svgX, svgY, scale * 0.75));
          }
          break;
        }
        case "tundra": {
          const roll = rng();
          if (roll < 0.5) {
            layer.appendChild(renderRock(svgX, svgY, scale));
          } else if (roll < 0.8) {
            layer.appendChild(renderGrassTuft(svgX, svgY, scale * 0.85));
          } else {
            layer.appendChild(renderConifer(svgX, svgY, scale * 0.6));
          }
          break;
        }
        case "glacier": {
          const roll = rng();
          if (roll < 0.55) {
            layer.appendChild(renderCrevasse(svgX, svgY, scale * 1.1));
          } else {
            layer.appendChild(renderRock(svgX, svgY, scale * 1.1));
          }
          break;
        }
        case "grassland":
        default: {
          const roll = rng();
          if (roll < 0.35) {
            layer.appendChild(renderBroadleaf(svgX, svgY, scale));
          } else if (roll < 0.75) {
            layer.appendChild(renderGrassTuft(svgX, svgY, scale));
          } else {
            layer.appendChild(renderRock(svgX, svgY, scale * 0.75));
          }
          break;
        }
      }
    }
  }

  return layer;
}
