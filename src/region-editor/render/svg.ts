import { curveCatmullRom, line } from "d3";
import { getCoastalHabitatDefinition } from "../../data/coastalHabitatCatalog";
import { resolveSettlementLabelPlacements } from "../core/gen/labelPlacement";
import { isForestBiome } from "../core/gen/landscapeBiomes";
import { pointInPolygon } from "../core/geometry";
import { type Point, type RegionDocument, WETLAND_LEVELS } from "../core/types";
import {
  DEFAULT_RENDER_QUALITY,
  forestCrownPattern,
  mixHex,
  type RenderQuality,
  renderForestCrowns,
  renderWetlandMarks,
  WETLAND_WATER_LEVEL,
  wetlandLevelStyle,
  wetlandMarkPattern,
  wetlandPatchLevel
} from "./biomeArt";
import { generateCoastalRipples } from "./coastalRipples";
import { extendRiversToCoast, smoothCoastlines } from "./coastline";
import { FOREST_KINDS, forestKindOf, forestMassFor, ringsToSvgPath } from "./forestMass";
import { renderSettlementIcon } from "./styles/settlementIcons";
import { SYMBOL_DEFINITIONS } from "./styles/symbols";
import { THEMES } from "./styles/themes";

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function polyToSvgPath(points: Point[], closed = true): string {
  if (points.length === 0) return "";
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  return closed ? `${d} Z` : d;
}

const FIELD_TONES = ["#d9c56b", "#cdbb5f", "#bfc266", "#d3b66b", "#b0bd63", "#c6aa62"];
const MEADOW_TONES = ["#bbc58e", "#b3c088", "#c2c994", "#aebe87"];
const FIELD_ANGLES = [8, 31, 57, 84, 112, 146];
/** Stable per-patch variation so neighbouring fields differ without any randomness at render time. */
function patchVariant(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/**
 * FMG準拠のベジェ曲線（Catmull-Rom スプライン）による街道経路SVGパスを生成
 */
export function createCurvedRoutePath(points: Point[], alpha = 0.1): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)} L ${points[1][0].toFixed(2)} ${points[1][1].toFixed(2)}`;
  }
  const lineGen = line<Point>()
    .x(p => p[0])
    .y(p => p[1])
    .curve(curveCatmullRom.alpha(alpha));
  const res = lineGen(points);
  return res || polyToSvgPath(points, false);
}

/**
 * FMG準拠のベジェ曲線（Catmull-Rom スプライン）と水理川幅による河川ポリゴンSVGパスを生成
 */
export function createCurvedRiverPolygon(
  points: Point[],
  widthsMeters: number[],
  metersPerUnit: number,
  alpha = 0.1
): string {
  if (points.length < 2) return "";

  const leftPoints: Point[] = [];
  const rightPoints: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[i - 1] || points[i];
    const curr = points[i];
    const next = points[i + 1] || points[i];

    const wMeters = widthsMeters[i] ?? widthsMeters[0] ?? 40;
    const baseUnits = wMeters / metersPerUnit;
    const visualWidth = Math.max(1.6, Math.min(24, 1.2 + baseUnits * 0.95));
    const halfWidth = visualWidth / 2;

    const angle = Math.atan2(prev[1] - next[1], prev[0] - next[0]);
    const sinOffset = Math.sin(angle) * halfWidth;
    const cosOffset = Math.cos(angle) * halfWidth;

    leftPoints.push([curr[0] - sinOffset, curr[1] + cosOffset]);
    rightPoints.push([curr[0] + sinOffset, curr[1] - cosOffset]);
  }

  if (points.length === 2) {
    const p0 = rightPoints[1];
    const p1 = rightPoints[0];
    const p2 = leftPoints[0];
    const p3 = leftPoints[1];
    return `M ${p0[0].toFixed(2)} ${p0[1].toFixed(2)} L ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} L ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} L ${p3[0].toFixed(2)} ${p3[1].toFixed(2)} Z`;
  }

  const lineGen = line<Point>()
    .x(p => p[0])
    .y(p => p[1])
    .curve(curveCatmullRom.alpha(alpha));

  const rightPath = lineGen([...rightPoints].reverse()) || "";
  const leftPath = lineGen(leftPoints) || "";

  const firstC = leftPath.indexOf("C");
  const leftSegments =
    firstC !== -1
      ? leftPath.substring(firstC)
      : `L ${leftPoints.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ")}`;

  return `${rightPath} L ${leftPoints[0][0].toFixed(2)} ${leftPoints[0][1].toFixed(2)} ${leftSegments} Z`;
}

/** RE の初期ズーム。FMG の「全体表示=scale 1」に相当する基準。 */
export const RE_BASE_ZOOM = 0.85;
/** 基準ズームでの画面上の文字サイズ ÷ 描画上の素の文字サイズ。 */
const TEXT_BASE_SCREEN_RATIO = 3;

/**
 * FMG の dampenStateLabelSize と同じ曲線で、ズームに応じた文字サイズ倍率（素のサイズに掛ける）を返す。
 * 画面上の文字サイズ = 基準 × (s + 1) / 2（s = zoom / 基準ズーム）。
 * キャンバスは CSS で scale(zoom) されるので、描画側のサイズは 画面サイズ / zoom になる。0.1刻みに丸める。
 */
export function textScaleForZoom(zoom: number): number {
  if (!(zoom > 0)) return TEXT_BASE_SCREEN_RATIO;
  const s = zoom / RE_BASE_ZOOM;
  return Math.round(((TEXT_BASE_SCREEN_RATIO * (s + 1)) / (2 * zoom)) * 10) / 10;
}

export function renderRegionSvg(
  doc: RegionDocument,
  selectedId?: string | null,
  options: { zoom?: number; quality?: RenderQuality } = {}
): string {
  const zoom = options.zoom ?? 1;
  const highQuality = (options.quality ?? DEFAULT_RENDER_QUALITY) === "high";
  const detail = zoom < 0.65 ? 0 : zoom < 1.6 ? 1 : 2;
  const textScale = textScaleForZoom(zoom);
  const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
  const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;

  const routeScale = Math.max(0.5, doc.decoration.routeWidthScale ?? 1);
  const riverScale = Math.max(0.5, doc.decoration.riverWidthScale ?? 1);
  const themeName = doc.decoration.theme;
  const theme = THEMES[themeName] ?? THEMES.schley;

  // 海岸線: 断片を連結し FMG と同じ B スプラインで丸める。直線のセル境界と曲線の間は辺ごとのパッチで塗り分ける
  // 海向けの港を持つ集落の岸壁は、丸めで陸側へ引っ込まないよう頂点を残す
  const portPins = doc.settlements.filter(st => st.hasPort).map(st => st.position);
  const coasts = smoothCoastlines(doc.terrain.coastlinePolygons, portPins);
  // 河口は丸めた海岸曲線まで延長する（直線のセル境界で止まると海に届かない）
  const rivers = extendRiversToCoast(doc.rivers, coasts);
  const coastPatchD = coasts
    .flatMap(c => c.patches)
    .map(poly => polyToSvgPath(poly))
    .join(" ");
  const isSeaBiome = (b: RegionDocument["biomes"][number]) => Boolean(b.isWater) || b.kind === "ocean";
  const seaClipD = doc.biomes
    .filter(isSeaBiome)
    .map(b => polyToSvgPath(b.polygon))
    .join(" ");
  const landClipD = doc.biomes
    .filter(b => !isSeaBiome(b))
    .map(b => polyToSvgPath(b.polygon))
    .join(" ");
  // 湿地・畑などの地表の模様は丸めた海岸線より海側へ出さない: 海セルと、曲線が陸側へ食い込んだ部分（陸セル内のパッチ）を隠す
  const hasCoastMask = Boolean(seaClipD || coastPatchD);
  const coastClipDefs = hasCoastMask
    ? `<clipPath id="re-sea-clip" clipPathUnits="userSpaceOnUse"><path d="${seaClipD}" /></clipPath>
      <clipPath id="re-land-clip" clipPathUnits="userSpaceOnUse"><path d="${landClipD}" /></clipPath>
      <mask id="re-wetland-coast-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${widthUnits}" height="${heightUnits}">
        <rect x="0" y="0" width="${widthUnits}" height="${heightUnits}" fill="#ffffff" />
        <path d="${seaClipD}" fill="#000000" />
        ${coastPatchD ? `<g clip-path="url(#re-land-clip)"><path d="${coastPatchD}" fill="#000000" /></g>` : ""}
      </mask>`
    : "";
  const coastMaskAttr = hasCoastMask ? ' mask="url(#re-wetland-coast-mask)"' : "";

  const mapAreaKm2 = (doc.bounds.widthMeters * doc.bounds.heightMeters) / 1e6;
  const forestBiomes = doc.biomes.filter(b => isForestBiome(b.kind));
  const hasForest = forestBiomes.length > 0;

  let forestDefs = "";
  let forestLayer = "";

  if (hasForest) {
    const canopyColors = theme.forestCanopy;

    // Physical land-use polygons are shared with ground rendering. Icon halos remain symbols only.
    const landUseClearing = (doc.landUse?.patches ?? [])
      .filter(
        p =>
          p.kind === "built" ||
          (p.kind === "cultivation" && doc.terrain.showCultivation === true) ||
          p.kind === "pasture" ||
          p.kind === "hay_meadow" ||
          p.kind === "wood_pasture" ||
          p.kind === "agroforestry" ||
          p.kind === "abandoned"
      )
      .map(p => {
        const opacity =
          p.kind === "abandoned"
            ? Math.max(
                0,
                1 -
                  Math.max(0, (doc.landUse?.year ?? 0) - (p.abandonedYear ?? doc.landUse?.year ?? 0)) /
                    (p.recoveryYears ?? 20)
              )
            : 1 - (p.canopyRetention ?? 0);
        return `<path d="${polyToSvgPath(p.polygon)}" fill="#000000" opacity="${opacity}" />`;
      })
      .join("\n");
    const routesClearing = doc.routes
      .map(r => {
        const widthMeters = (r.kind === "highway" ? 8 : r.kind === "trail" ? 2 : 5) * routeScale;
        return `<path d="${createCurvedRoutePath(r.points, 0.1)}" fill="none" stroke="#000000" stroke-width="${widthMeters / doc.bounds.metersPerUnit}" />`;
      })
      .join("\n");
    // 河川（川幅＋緩衝帯）の切り開き
    const riversClearing = rivers
      .map(river => {
        if (river.points.length >= 2) {
          const bufferedWidths = river.widths.map(w => w * riverScale);
          const riverPoly = createCurvedRiverPolygon(river.points, bufferedWidths, doc.bounds.metersPerUnit, 0.1);
          return `<path d="${riverPoly}" fill="#000000" stroke="#000000" stroke-width="0" stroke-linejoin="round" />`;
        }
        return `<path d="${polyToSvgPath(river.points, false)}" fill="none" stroke="#000000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />`;
      })
      .join("\n");

    // 湖および海岸線外側（海洋）の切り開き
    const wetlandWaterClearing = doc.biomes
      .flatMap(b => b.wetlandPatches ?? [])
      .filter(p => wetlandPatchLevel(p) >= WETLAND_WATER_LEVEL)
      .map(
        p =>
          `<path d="${polyToSvgPath(p.polygon)}" fill="#000000" stroke="#000000" stroke-width="0.3" stroke-linejoin="round" />`
      )
      .join("\n");
    const lakesClearing = doc.terrain.lakePolygons
      .map(poly => `<path d="${polyToSvgPath(poly, true)}" fill="#000000" />`)
      .join("\n");
    // 海: 海セルと、曲線が陸側へ食い込んだ部分
    const coastlinesClearing = `${seaClipD ? `<path d="${seaClipD}" fill="#000000" />` : ""}${
      coastPatchD ? `<path d="${coastPatchD}" fill="#000000" />` : ""
    }`;

    forestDefs = `
      <!-- 森林クリアリングマスク: 街道・都市・ダンジョン・水域をくり抜き、それ以外に森を広げる -->
      <mask id="re-forest-clearing-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${widthUnits}" height="${heightUnits}">
        <rect x="0" y="0" width="${widthUnits}" height="${heightUnits}" fill="#ffffff" />
        ${coastlinesClearing}
        ${lakesClearing}
        ${wetlandWaterClearing}
        ${riversClearing}
        ${routesClearing}
        ${landUseClearing}
      </mask>
      ${highQuality ? "" : (["deciduous", "coniferous", "tropical"] as const).map(k => forestCrownPattern(k, canopyColors, mapAreaKm2)).join("\n")}
    `;

    // 隣接する森林セルを 1 つの森林塊にまとめ、セル頂点の角を持たない滑らかな外形で描く
    // 水辺（海・湖・湿地の開放水面）には森をはみ出させない
    const forestWater = [
      ...coasts.flatMap(c => c.patches),
      ...doc.biomes.filter(b => b.isWater || b.kind === "ocean").map(b => b.polygon),
      ...doc.terrain.lakePolygons,
      ...doc.biomes
        .flatMap(b => b.wetlandPatches ?? [])
        .filter(p => wetlandPatchLevel(p) >= WETLAND_WATER_LEVEL)
        .map(p => p.polygon)
    ];
    const mass = forestMassFor(doc.biomes, forestBiomes, forestWater);
    const outlineD = mass ? ringsToSvgPath(mass.outline) : "";
    if (outlineD) {
      forestDefs += `<clipPath id="re-forest-outline" clipPathUnits="userSpaceOnUse"><path d="${outlineD}" clip-rule="evenodd" /></clipPath>`;
    }
    const kindRegions = mass
      ? FOREST_KINDS.filter(k => mass.regions[k]?.length).map(k => ({
          kind: k,
          d: ringsToSvgPath(mass.regions[k] ?? []),
          stock: mass.stock[k] ?? 1
        }))
      : [];

    // 林床: 樹冠の隙間から見える暗い地面。種類ごとの支配領域を外形で切り抜き、継ぎ目は同色の細い縁取りで塗り潰す
    const forestFloor = kindRegions
      .map(({ kind, d, stock }) => {
        const color = mixHex(canopyColors[kind], canopyColors.shadow, 0.5);
        const biomeClasses = [
          ...new Set(forestBiomes.filter(b => forestKindOf(b.kind) === kind).map(b => `forest-${b.kind}`))
        ];
        return `<path class="forest-canopy-cell ${biomeClasses.join(" ")}" data-kind="${kind}" d="${d}" fill="${color}" fill-rule="evenodd" opacity="${(0.5 + stock * 0.5).toFixed(2)}" stroke="${color}" stroke-width="0.6" stroke-linejoin="round" />`;
      })
      .join("\n");
    const forestPatterns = highQuality
      ? ""
      : kindRegions
          .map(
            ({ kind, d }) =>
              `<path class="forest-pattern-overlay" d="${d}" fill="url(#re-forest-crowns-${kind})" fill-rule="evenodd" />`
          )
          .join("\n");

    forestLayer = outlineD
      ? `
      <g class="re-forest-layer" id="re-forest-layer" mask="url(#re-forest-clearing-mask)">
        <g class="re-forest-floor" clip-path="url(#re-forest-outline)">${forestFloor}${forestPatterns}</g>
        ${highQuality && mass ? renderForestCrowns(mass, canopyColors, detail, mapAreaKm2) : ""}
      </g>
    `
      : "";
  }

  // 1. Defs (パーチメント風テクスチャ、フィルター、森林マスク・シェーディング)
  const defs = `
    <defs>
      <filter id="re-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.25" />
      </filter>
      <filter id="re-halo">
        <feMorphology operator="dilate" radius="2" in="SourceAlpha" result="dilated" />
        <feFlood flood-color="${theme.background}" result="flood" />
        <feComposite in="flood" in2="dilated" operator="in" result="outline" />
        <feMerge>
          <feMergeNode in="outline" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <!-- パーチメント風ノイズテクスチャ（オプション） -->
      <filter id="re-paper-texture">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="noise" />
        <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.05 0" />
        <feBlend mode="multiply" in="SourceGraphic" />
      </filter>
      ${
        highQuality
          ? `<filter id="re-wetland-bank" x="-2%" y="-2%" width="104%" height="104%">
        <feMorphology operator="dilate" radius="0.8" in="SourceAlpha" result="bank" />
        <feFlood flood-color="${mixHex(theme.riverFill, "#2f3d2a", 0.45)}" result="bankColor" />
        <feComposite in="bankColor" in2="bank" operator="in" result="rim" />
        <feMerge><feMergeNode in="rim" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>`
          : wetlandMarkPattern("#4f6b3a")
      }
      ${coastClipDefs}
      ${forestDefs}
    </defs>
  `;

  // 2. 背景
  const background = `<rect width="${widthUnits}" height="${heightUnits}" fill="${theme.background}" />`;

  // 3. バイオーム領域
  const biomePath = (b: RegionDocument["biomes"][number]): { isSea: boolean; svg: string } => {
    const color = b.color ?? theme.biomes[b.kind] ?? theme.biomes.grassland;
    const isSea = b.isWater || b.kind === "ocean";
    const cls = isSea ? "biome-polygon biome-ocean ce-face--sea" : `biome-polygon biome-${b.kind} ce-face--land`;
    return {
      isSea,
      svg: `<path class="${cls}" data-id="${b.id}" d="${polyToSvgPath(b.polygon)}" fill="${color}" stroke="${color}" stroke-width="0.7" stroke-linejoin="round" />`
    };
  };
  const biomeParts = doc.biomes.map(biomePath);
  let biomesLayerBase = biomeParts.map(part => part.svg).join("\n");
  // 森・湿地のセルは、地面色（FMG の群系色）が出ていると丸めた海岸や森の外形の隙間で浮いてしまう。
  // そうした隙間は、頂点を共有する「開けた陸」（森・湿地・水域でないセル）で最も多い色で埋める
  const isOpenLand = (b: RegionDocument["biomes"][number]) =>
    !(isSeaBiome(b) || isForestBiome(b.kind) || b.wetlandPatches !== undefined);
  const vertexKey = (p: Point) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const openColorAt = new Map<string, string[]>();
  for (const b of doc.biomes) {
    if (!isOpenLand(b)) continue;
    const color = b.color ?? theme.biomes[b.kind] ?? theme.biomes.grassland;
    for (const p of b.polygon) {
      const key = vertexKey(p);
      const list = openColorAt.get(key);
      if (list) list.push(color);
      else openColorAt.set(key, [color]);
    }
  }
  const openLandColorFor = (b: RegionDocument["biomes"][number]): string => {
    const counts = new Map<string, number>();
    for (const p of b.polygon)
      for (const c of openColorAt.get(vertexKey(p)) ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
    return (
      [...counts].sort((x, y) => y[1] - x[1])[0]?.[0] ??
      theme.biomes[b.terrainKind && !isForestBiome(b.terrainKind) ? b.terrainKind : "grassland"] ??
      theme.biomes.grassland
    );
  };
  if (forestLayer) {
    // 森林セルの地面色は滑らかな森林外形の内側だけに塗る。外形が引っ込んだ所にセルの角が出ないよう下地を敷く
    const underlay = forestBiomes
      .map(b => {
        const color = openLandColorFor(b);
        return `<path class="forest-ground-underlay" d="${polyToSvgPath(b.polygon)}" fill="${color}" stroke="${color}" stroke-width="0.7" stroke-linejoin="round" />`;
      })
      .join("\n");
    const forestGround = biomeParts
      .filter((_, i) => isForestBiome(doc.biomes[i].kind))
      .map(part => part.svg)
      .join("\n");
    biomesLayerBase = `${biomeParts
      .filter((_, i) => !isForestBiome(doc.biomes[i].kind))
      .map(part => part.svg)
      .join("\n")}\n${underlay}\n<g class="forest-ground" clip-path="url(#re-forest-outline)">${forestGround}</g>`;
  }
  const seaPolys = doc.biomes.filter(isSeaBiome).map(bm => bm.polygon);
  const isSeaPoint = (pt: Point) => seaPolys.some(poly => pointInPolygon(pt, poly));
  const landColorAt = (pt: Point): string => {
    const land = doc.biomes.find(bm => !isSeaBiome(bm) && pointInPolygon(pt, bm.polygon));
    return land?.color ?? theme.biomes[land?.kind ?? "grassland"] ?? theme.biomes.grassland;
  };
  const seaBiome = doc.biomes.find(isSeaBiome);
  const seaColor = seaBiome?.color ?? theme.biomes.ocean ?? "#9ec3d6";
  // 陸セルの辺 → 地面色（海岸の辺がどの陸セルに属するかを引く）
  const edgeKey = (a: Point, b: Point) => {
    const ka = `${a[0].toFixed(2)},${a[1].toFixed(2)}`;
    const kb = `${b[0].toFixed(2)},${b[1].toFixed(2)}`;
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  const landEdgeColor = new Map<string, string>();
  for (const bm of doc.biomes) {
    if (isSeaBiome(bm)) continue;
    // 森・湿地セルの隙間は、そのセルの地面色ではなく周囲の開けた陸の色で埋める
    const color = isOpenLand(bm) ? (bm.color ?? theme.biomes[bm.kind] ?? theme.biomes.grassland) : openLandColorFor(bm);
    for (let i = 0; i < bm.polygon.length; i++)
      landEdgeColor.set(edgeKey(bm.polygon[i], bm.polygon[(i + 1) % bm.polygon.length]), color);
  }
  const patchLandColor = (patch: Point[]): string => {
    const a = patch[0];
    const b = patch[patch.length - 1];
    const known = landEdgeColor.get(edgeKey(a, b));
    if (known) return known;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const off = Math.min(0.5, len * 0.1);
    const nx = (-(b[1] - a[1]) / len) * off;
    const ny = ((b[0] - a[0]) / len) * off;
    const side: Point = isSeaPoint([mid[0] + nx, mid[1] + ny])
      ? [mid[0] - nx, mid[1] - ny]
      : [mid[0] + nx, mid[1] + ny];
    return landColorAt(side);
  };
  // 曲線が海側へ膨らんだ所は陸色、陸側へ食い込んだ所は海色。1 本の辺の中で曲線が弦を横切る（S 字）ことがあるので、
  // パッチを弦で海側・陸側の 2 つに割り、海側を陸色、陸側を海色で塗る
  /**
   * パッチの輪郭（弦 a→b と曲線）のうち、弦の sign 側にある部分を、曲線が弦を横切る所で切り分けて返す。
   * 凹んだ多角形を半平面で一括して切ると、弦に沿った面積ゼロの橋ができ、縁取りが線として出てしまう。
   */
  const lobesOnSide = (patch: Point[], a: Point, b: Point, sign: number): Point[][] => {
    const side = (q: Point) => sign * ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
    const lobes: Point[][] = [];
    let run: Point[] | null = null;
    const finish = () => {
      if (run && run.length >= 3) lobes.push(run);
      run = null;
    };
    for (let i = 0; i < patch.length; i++) {
      const cur = patch[i];
      const d = side(cur);
      if (i > 0) {
        const last = patch[i - 1];
        const prev = side(last);
        if ((prev > 0 && d < 0) || (prev < 0 && d > 0)) {
          const t = prev / (prev - d);
          const x: Point = [last[0] + t * (cur[0] - last[0]), last[1] + t * (cur[1] - last[1])];
          if (d > 0) run = [x];
          else {
            run?.push(x);
            finish();
          }
        } else if (prev === 0 && d > 0) run = [last];
      }
      if (d > 0) {
        if (!run) run = [];
        run.push(cur);
      } else if (d === 0 && run) {
        run.push(cur);
        finish();
      }
    }
    finish();
    return lobes;
  };
  /** 弦の海側が cross の正負どちらか。判定できなければ 0 */
  const seaSideSign = (a: Point, b: Point): number => {
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const off = Math.min(0.5, len * 0.1);
    // cross > 0 の側は (-dy, dx) 方向
    const positive: Point = [mid[0] - ((b[1] - a[1]) / len) * off, mid[1] + ((b[0] - a[0]) / len) * off];
    const negative: Point = [mid[0] + ((b[1] - a[1]) / len) * off, mid[1] - ((b[0] - a[0]) / len) * off];
    const pos = isSeaPoint(positive);
    const neg = isSeaPoint(negative);
    return pos === neg ? 0 : pos ? 1 : -1;
  };
  const MIN_LOBE_AREA = 0.5;
  const lobeArea = (poly: Point[]): number => {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i];
      const p1 = poly[(i + 1) % poly.length];
      area += p0[0] * p1[1] - p1[0] * p0[1];
    }
    return Math.abs(area) / 2;
  };
  const landByColor = new Map<string, string[]>();
  for (const patch of coasts.flatMap(c => c.patches)) {
    if (patch.length < 4) continue;
    const a = patch[0];
    const b = patch[patch.length - 1];
    const sign = seaSideSign(a, b);
    // 面積がほぼゼロの面は、陸色の縁取りだけが海へ細い線としてはみ出すので塗らない
    const seaLobes = sign ? lobesOnSide(patch, a, b, sign).filter(l => lobeArea(l) > MIN_LOBE_AREA) : [];
    if (!seaLobes.length) continue;
    const color = patchLandColor(patch);
    const ds = seaLobes.map(l => polyToSvgPath(l));
    const list = landByColor.get(color);
    if (list) list.push(...ds);
    else landByColor.set(color, ds);
  }
  // まずパッチ全体を海色で塗り（弦の両側に出る陸セルの縁取りを覆う）、弦の海側（膨らんだ）の面だけを陸色で塗り直す。
  // 陸色のほうの縁取りを太くして、弦に沿って海色の細線が残らないようにする
  const coastPatches = coastPatchD
    ? `<path class="coast-fill-sea" d="${coastPatchD}" fill="${seaColor}" stroke="${seaColor}" stroke-width="0.8" stroke-linejoin="round" />
      <g class="coast-fill-land">${[...landByColor]
        .map(
          ([color, ds]) =>
            `<path d="${ds.join(" ")}" fill="${color}" stroke="${color}" stroke-width="1.2" stroke-linejoin="round" />`
        )
        .join("")}</g>`
    : "";
  // 異なる地面色のセルが接する辺には、両側の色を繋ぐ細い線形グラデーションの帯を敷く（フィルタは使わず、帯 1 本につき 1 要素）
  const groundBlend = (() => {
    type Side = { color: string; a: Point; b: Point; center: Point };
    const sides = new Map<string, Side[]>();
    for (const bm of doc.biomes) {
      if (isSeaBiome(bm) || bm.polygon.length < 3) continue;
      // 森林セルの地面色は森林の外形の内側にしか出ないので、外形の外は周囲の開けた陸の色として扱う
      const color = isForestBiome(bm.kind)
        ? openLandColorFor(bm)
        : (bm.color ?? theme.biomes[bm.kind] ?? theme.biomes.grassland);
      const n = bm.polygon.length;
      const center: Point = [
        bm.polygon.reduce((t, q) => t + q[0], 0) / n,
        bm.polygon.reduce((t, q) => t + q[1], 0) / n
      ];
      for (let i = 0; i < n; i++) {
        const a = bm.polygon[i];
        const b = bm.polygon[(i + 1) % n];
        const key = edgeKey(a, b);
        const entry: Side = { color, a, b, center };
        const list = sides.get(key);
        if (list) list.push(entry);
        else sides.set(key, [entry]);
      }
    }
    const defs: string[] = [];
    const strips: string[] = [];
    for (const [, pair] of sides) {
      if (pair.length !== 2 || pair[0].color === pair[1].color) continue;
      const [from, to] = pair;
      const len = Math.hypot(from.b[0] - from.a[0], from.b[1] - from.a[1]);
      if (len < 1e-6) continue;
      const mid: Point = [(from.a[0] + from.b[0]) / 2, (from.a[1] + from.b[1]) / 2];
      let nx = -(from.b[1] - from.a[1]) / len;
      let ny = (from.b[0] - from.a[0]) / len;
      // 法線は from のセルから to のセルへ向ける
      if ((from.center[0] - mid[0]) * nx + (from.center[1] - mid[1]) * ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const w = len * 0.3;
      const id = `re-ground-blend-${strips.length}`;
      defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${(mid[0] - nx * w).toFixed(2)}" y1="${(mid[1] - ny * w).toFixed(2)}" x2="${(mid[0] + nx * w).toFixed(2)}" y2="${(mid[1] + ny * w).toFixed(2)}"><stop offset="0" stop-color="${from.color}" /><stop offset="1" stop-color="${to.color}" /></linearGradient>`
      );
      const q = [
        [from.a[0] - nx * w, from.a[1] - ny * w],
        [from.b[0] - nx * w, from.b[1] - ny * w],
        [from.b[0] + nx * w, from.b[1] + ny * w],
        [from.a[0] + nx * w, from.a[1] + ny * w]
      ] as Point[];
      strips.push(`<path d="${polyToSvgPath(q)}" fill="url(#${id})" />`);
    }
    return {
      layer: strips.length ? `<g class="ground-blend"><defs>${defs.join("")}</defs>${strips.join("")}</g>` : ""
    };
  })();
  const biomesLayer = `${biomesLayerBase}\n${groundBlend.layer}\n${coastPatches}`;

  const wetlandBiomes = doc.biomes.filter(b => b.wetlandPatches !== undefined);
  const wetlandPatches = wetlandBiomes.flatMap(b => b.wetlandPatches ?? []);
  const sandyWetland = wetlandPatches.some(p => p.kind === "sand");
  // 冠水段階の昇順に重ねる。各段階は「その段階以上」の入れ子の面なので、外側が湿った地面、内側ほど水深が増す。
  const wetlandLayer = Array.from({ length: WETLAND_LEVELS }, (_, level) => {
    const d = wetlandPatches
      .filter(p => wetlandPatchLevel(p) === level)
      .map(p => polyToSvgPath(p.polygon))
      .join(" ");
    if (!d) return "";
    const open = level >= WETLAND_WATER_LEVEL;
    const { color, opacity } = wetlandLevelStyle(level, theme.riverFill, sandyWetland && !open);
    const kind = open ? "water" : sandyWetland ? "sand" : "mud";
    const path = `<path class="wetland-${kind} wetland-level-${level}" d="${d}" fill="${color}" fill-opacity="${opacity}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="0.3" stroke-linejoin="round" />`;
    // 開放水面の外周にだけ暗い岸縁を付ける（最初の水面段階）
    const layered =
      highQuality && level === WETLAND_WATER_LEVEL
        ? `<g class="wetland-bank" filter="url(#re-wetland-bank)">${path}</g>`
        : path;
    // 低品質: 葦のタイルは湿地面（段階 2 以上）の上、開放水面の下に敷く
    if (!highQuality && level === WETLAND_WATER_LEVEL - 1) {
      const marshD = wetlandPatches
        .filter(p => wetlandPatchLevel(p) === 2)
        .map(p => polyToSvgPath(p.polygon))
        .join(" ");
      return `${layered}${marshD ? `<path class="wetland-reeds" d="${marshD}" fill="url(#re-wetland-marks)" />` : ""}`;
    }
    return layered;
  }).join("\n");
  const wetlandMarks = highQuality ? renderWetlandMarks(wetlandBiomes, "#4f6b3a") : "";

  // 3.5. 等高線レイヤー（Elevation Contours）
  let contoursLayer = "";
  if (doc.terrain.showContours !== false && doc.terrain.contours && doc.terrain.contours.length > 0) {
    const contourPaths = doc.terrain.contours
      .map(c => {
        const pathD = polyToSvgPath(c.points, Boolean(c.isClosed));
        const isIndex = Boolean(c.isIndex);
        const stroke = isIndex ? theme.contourIndexStroke : theme.contourStroke;
        const strokeWidth = isIndex ? 1.2 : 0.65;
        const opacity = isIndex ? 0.6 : 0.35;
        return `<path class="contour-line ${isIndex ? "contour-index" : ""}" data-elevation="${c.elevationMeters}" d="${pathD}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
      })
      .join("\n");

    // 標高注記: 主等高線の中点に、線の向きに沿って（上下反転しないよう）配置する
    const elevationLabels =
      doc.terrain.showContourElevations === true
        ? doc.terrain.contours
            .filter(c => c.isIndex && c.points.length >= 2)
            .map(c => {
              const mid = Math.floor(c.points.length / 2);
              const [x, y] = c.points[mid];
              const [x0, y0] = c.points[Math.max(0, mid - 1)];
              const [x1, y1] = c.points[Math.min(c.points.length - 1, mid + 1)];
              let angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
              if (angle > 90) angle -= 180;
              else if (angle < -90) angle += 180;
              return `<text class="contour-elevation" x="${x.toFixed(2)}" y="${y.toFixed(2)}" transform="rotate(${angle.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})" text-anchor="middle" dominant-baseline="central" font-family="'Cinzel', 'Times New Roman', serif" font-size="${8 * textScale}" fill="${theme.contourIndexStroke}" filter="url(#re-halo)">${Math.round(c.elevationMeters)} m</text>`;
            })
            .join("\n")
        : "";

    contoursLayer = `
      <g class="re-contours-layer" id="re-contours-layer">
        ${contourPaths}
        ${elevationLabels}
      </g>
    `;
  }

  // 4. 海岸線 & 波紋ハッチング & 湖
  const smoothCoasts = coasts.map(c => c.curve);
  const ripples = generateCoastalRipples(smoothCoasts, 3, 5);
  const ripplesLayer = ripples
    .map((rip, i) => {
      const opacity = (0.45 - i * 0.12).toFixed(2);
      return `<path class="coastal-ripple" d="${polyToSvgPath(rip, false)}" fill="none" stroke="${theme.coastlineStroke}" stroke-width="0.8" stroke-dasharray="8,4" opacity="${opacity}" />`;
    })
    .join("\n");

  const coastlinesLayer = smoothCoasts
    .map(poly => {
      return `<path class="coastline" d="${polyToSvgPath(poly, false)}" fill="none" stroke="${theme.coastlineStroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("\n");

  // 海岸の辺 → その辺に対応する曲線区間（a→b 向き）
  const coastArcs = new Map<string, Point[]>();
  for (const patch of coasts.flatMap(c => c.patches)) {
    coastArcs.set(edgeKey(patch[0], patch[patch.length - 1]), [
      patch[0],
      ...patch.slice(1, -1),
      patch[patch.length - 1]
    ]);
  }
  const arcFor = (a: Point, b: Point): Point[] | undefined => {
    const arc = coastArcs.get(edgeKey(a, b));
    if (!arc) return undefined;
    const forward = Math.hypot(arc[0][0] - a[0], arc[0][1] - a[1]) <= Math.hypot(arc[0][0] - b[0], arc[0][1] - b[1]);
    return (forward ? arc : [...arc].reverse()).slice(1, -1);
  };
  const habitatDash = (key: string) =>
    key === "rockyIntertidal" ? "2,3" : key === "tidalFlat" ? "8,3,2,3" : key === "coastalDune" ? "6,4" : "1,4";
  // 同じ陸セルの他の海岸の辺も曲線に置き換えないと、帯がセルの角から突き出る
  const smoothedLandPath = (land: Point[]) =>
    polyToSvgPath(
      land.flatMap((p, k) => [p, ...(arcFor(p, land[(k + 1) % land.length]) ?? [])]),
      true
    );
  const habitatBand = (clipId: string, clipD: string, key: string, label: string, color: string, path: string) =>
    `<defs><clipPath id="${clipId}">${clipD}</clipPath></defs>
      <g class="coastal-habitat coastal-habitat-${key}" data-coastal-habitat="${key}" clip-path="url(#${clipId})">
        <title>${escapeXml(label)}</title>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="14" />
        <path d="${path}" fill="none" stroke="${theme.coastlineStroke}" stroke-width="9" stroke-dasharray="${habitatDash(key)}" opacity="0.3" />
      </g>`;
  // 海岸線の鎖ごとに、同じハビタットが続く辺をひとつの帯にまとめる（辺ごとに分けると角で帯が途切れ、破線も辺ごとに仕切り直される）
  const habitatSegments = doc.terrain.coastalHabitats ?? [];
  const segmentByEdge = new Map<string, (typeof habitatSegments)[number]>();
  for (const seg of habitatSegments) {
    if (seg.points.length === 2) segmentByEdge.set(edgeKey(seg.points[0], seg.points[1]), seg);
  }
  const bandedSegments = new Set<(typeof habitatSegments)[number]>();
  const bandLayers: string[] = [];
  let bandCount = 0;
  for (const coast of coasts) {
    const n = coast.closed ? coast.vertices.length - 1 : coast.vertices.length;
    const edgeCount = coast.patches.length;
    const edgeSeg = Array.from({ length: edgeCount }, (_, i) =>
      segmentByEdge.get(edgeKey(coast.vertices[i], coast.vertices[(i + 1) % n]))
    );
    const keyOf = (i: number) => {
      const seg = edgeSeg[i];
      return seg ? getCoastalHabitatDefinition(seg.coastalHabitat).key : "none";
    };
    // 閉じた鎖は、ハビタットが変わる辺から回し始める（全部同じなら 0 から 1 周）
    let start = 0;
    if (coast.closed) {
      const change = Array.from({ length: edgeCount }, (_, i) => i).find(
        i => keyOf(i) !== keyOf((i + edgeCount - 1) % edgeCount)
      );
      start = change ?? 0;
    }
    let run: number[] = [];
    const flush = () => {
      if (!run.length) return;
      const seg0 = edgeSeg[run[0]];
      const key = keyOf(run[0]);
      if (seg0 && key !== "none") {
        const pts: Point[] = [];
        for (const i of run) {
          const arc = coast.patches[i].slice(1, -1);
          pts.push(...(pts.length ? arc.slice(1) : arc));
        }
        const clipD = [...new Set(run.map(i => edgeSeg[i]!))]
          .map(seg => `<path d="${smoothedLandPath(seg.landPolygon)}" />`)
          .join("");
        for (const i of run) bandedSegments.add(edgeSeg[i]!);
        const def = getCoastalHabitatDefinition(seg0.coastalHabitat);
        bandLayers.push(
          habitatBand(
            `re-coastal-habitat-${bandCount++}`,
            clipD,
            key,
            def.label,
            def.color,
            polyToSvgPath(pts, coast.closed && run.length === edgeCount)
          )
        );
      }
      run = [];
    };
    for (let k = 0; k < edgeCount; k++) {
      const i = (start + k) % edgeCount;
      if (run.length && keyOf(i) !== keyOf(run[0])) flush();
      run.push(i);
    }
    flush();
  }
  // 曲線化できなかった（鎖に載らない）区間は従来どおり辺ごとに描く
  habitatSegments.forEach(segment => {
    if (bandedSegments.has(segment)) return;
    const habitat = getCoastalHabitatDefinition(segment.coastalHabitat);
    if (habitat.key === "none") return;
    bandLayers.push(
      habitatBand(
        `re-coastal-habitat-${bandCount++}`,
        `<path d="${polyToSvgPath(segment.landPolygon, true)}" />`,
        habitat.key,
        habitat.label,
        habitat.color,
        polyToSvgPath(segment.points, false)
      )
    );
  });
  const coastalHabitatsLayer = bandLayers.join("\n");

  const lakesLayer = doc.terrain.lakePolygons
    .map(poly => {
      return `<path class="lake" d="${polyToSvgPath(poly, true)}" fill="${theme.riverFill}" stroke="${theme.coastlineStroke}" stroke-width="1.5" />`;
    })
    .join("\n");

  // 5. 河川
  // 5. 河川（太さの変化・水理幅の反映、FMG準拠のベジェ曲線）
  const riversLayer = rivers
    .map(river => {
      const isSel = river.id === selectedId;
      const minW = Math.round(Math.min(...river.widths));
      const maxW = Math.round(Math.max(...river.widths));
      const widthInfo =
        river.widths.length > 0 ? (minW === maxW ? ` (川幅: ${minW}m)` : ` (川幅: ${minW}m〜${maxW}m)`) : "";
      const titleTag = `<title>${escapeXml(river.name)}${widthInfo}</title>`;

      if (river.points.length >= 2) {
        // ベジェ曲線（Catmull-Romスプライン）による川幅変化ポリゴン
        const polyD = createCurvedRiverPolygon(
          river.points,
          river.widths.map(w => w * riverScale),
          doc.bounds.metersPerUnit,
          0.1
        );
        const centerD = createCurvedRoutePath(river.points, 0.1);
        return `
          <g class="river-group ${isSel ? "selected" : ""}" id="${escapeXml(river.id)}" data-kind="river" data-id="${escapeXml(river.id)}">
            ${titleTag}
            <path class="river-polygon" d="${polyD}" fill="${theme.riverFill}" stroke="${isSel ? "#d4a373" : theme.riverStroke}" stroke-width="${isSel ? "2.0" : "1.0"}" stroke-linejoin="round" />
            <path class="river-centerline" d="${centerD}" fill="none" stroke="${theme.riverFill}" stroke-width="0.5" opacity="0.6" />
          </g>
        `;
      }

      // 単一ポイント等のフォールバック
      const pathD = polyToSvgPath(river.points, false);
      return `
        <g class="river-group ${isSel ? "selected" : ""}" id="${escapeXml(river.id)}" data-kind="river" data-id="${escapeXml(river.id)}">
          ${titleTag}
          <path d="${pathD}" fill="none" stroke="${isSel ? "#d4a373" : theme.riverStroke}" stroke-width="2.0" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      `;
    })
    .join("\n");

  // 6. 街道 (Routes) - 都市間接続・種別別描画（FMG準拠のベジェ曲線）
  const routesLayer = doc.routes
    .map(route => {
      const pathD = createCurvedRoutePath(route.points, 0.1);
      const isSel = route.id === selectedId;
      const titleTag = route.name ? `<title>${escapeXml(route.name)}</title>` : "";

      if (route.kind === "highway") {
        return `
          <g class="route-highway ${isSel ? "selected" : ""}" data-kind="route" data-id="${route.id}">
            ${titleTag}
            <path d="${pathD}" fill="none" stroke="${isSel ? "#d4a373" : theme.highwayStroke}" stroke-width="${(isSel ? 4.2 : 3.2) * routeScale}" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${pathD}" fill="none" stroke="${theme.background}" stroke-width="${1.2 * routeScale}" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        `;
      }
      if (route.kind === "trail") {
        return `<path class="route-trail ${isSel ? "selected" : ""}" data-kind="route" data-id="${route.id}" d="${pathD}" fill="none" stroke="${isSel ? "#d4a373" : theme.roadStroke}" stroke-width="${(isSel ? 2.2 : 1.2) * routeScale}" stroke-dasharray="3,3" stroke-linecap="round">${titleTag}</path>`;
      }
      return `<path class="route-road ${isSel ? "selected" : ""}" data-kind="route" data-id="${route.id}" d="${pathD}" fill="none" stroke="${isSel ? "#d4a373" : theme.roadStroke}" stroke-width="${(isSel ? 3.0 : 2) * routeScale}" stroke-dasharray="7,2" stroke-linecap="round" stroke-linejoin="round">${titleTag}</path>`;
    })
    .join("\n");

  // 7. ★直角橋（Perpendicular Bridges）★: 河川接線と厳格に直角な橋梁
  const bridgesLayer = doc.bridges
    .map(b => {
      const halfL = (b.lengthMeters * riverScale) / doc.bounds.metersPerUnit / 2;
      const halfW = (b.widthMeters * routeScale) / doc.bounds.metersPerUnit / 2;
      return `
        <g class="perpendicular-bridge" data-kind="bridge" data-id="${b.id}" transform="translate(${b.center[0].toFixed(2)}, ${b.center[1].toFixed(2)}) rotate(${b.angleDeg.toFixed(2)})">
          <rect x="${(-halfL).toFixed(2)}" y="${(-halfW).toFixed(2)}" width="${(halfL * 2).toFixed(2)}" height="${(halfW * 2).toFixed(2)}" fill="${theme.bridgeDeck}" stroke="${theme.bridgeRail}" stroke-width="1.3" rx="1" />
          <line x1="${(-halfL).toFixed(2)}" y1="${(-halfW).toFixed(2)}" x2="${halfL.toFixed(2)}" y2="${(-halfW).toFixed(2)}" stroke="${theme.bridgeRail}" stroke-width="1.6" />
          <line x1="${(-halfL).toFixed(2)}" y1="${halfW.toFixed(2)}" x2="${halfL.toFixed(2)}" y2="${halfW.toFixed(2)}" stroke="${theme.bridgeRail}" stroke-width="1.6" />
        </g>
      `;
    })
    .join("\n");

  // 8. 地勢シンボル（山岳、丘陵、樹木、湿地等）
  const symbolsLayer = doc.symbols
    .filter(
      sym =>
        !sym.type.startsWith("tree") ||
        !(doc.landUse?.patches ?? []).some(
          p =>
            (p.kind === "built" || (p.kind === "cultivation" && doc.terrain.showCultivation === true)) &&
            pointInPolygon([sym.x, sym.y], p.polygon)
        )
    )
    .map(sym => {
      const def = SYMBOL_DEFINITIONS[sym.type];
      if (!def) return "";
      const highlight = sym.type.includes("snow") ? "#ffffff" : theme.mountainHighlight;
      const fill = sym.type.startsWith("mountain")
        ? theme.mountainFill
        : sym.type.startsWith("hill")
          ? theme.hillFill
          : sym.type.startsWith("tree") || sym.type === "grass_tuft"
            ? theme.treeFill
            : sym.type === "cactus"
              ? "#557d4a"
              : sym.type === "sand_dune"
                ? "#d6c498"
                : sym.type === "rock_cluster"
                  ? "#92897e"
                  : theme.textSecondary;
      const stroke =
        sym.type.startsWith("tree") || sym.type === "grass_tuft" || sym.type === "cactus"
          ? theme.treeStroke
          : theme.mountainStroke;
      const isSel = sym.id === selectedId;

      const innerSvg = def.renderSvg(fill, stroke, highlight);
      return `
        <g class="map-symbol ${isSel ? "selected" : ""}" transform="translate(${sym.x.toFixed(2)}, ${sym.y.toFixed(2)}) scale(${sym.scale.toFixed(2)})" data-kind="symbol" data-id="${sym.id}">
          ${innerSvg}
          ${isSel ? `<circle cx="0" cy="0" r="16" fill="none" stroke="#d4a373" stroke-width="1.8" stroke-dasharray="3,3" />` : ""}
        </g>
      `;
    })
    .join("\n");

  // 9. 集落・拠点シンボル (Settlements) - 衝突回避ラベル配置
  const labelOffsets = resolveSettlementLabelPlacements(doc.settlements, doc.labels);
  const offsetMap = new Map(labelOffsets.map(o => [o.settlementId, o.offset]));

  const iconScale = Math.max(1, Math.round(doc.decoration.settlementIconScale ?? 1));
  const settlementsLayer = doc.settlements
    .map(s => {
      const [x, y] = s.position;
      const isSel = s.id === selectedId;
      const offset = offsetMap.get(s.id) ?? [0, 15];

      const markerSvg = renderSettlementIcon(s.type || s.group, {
        theme,
        isCapital: s.isCapital,
        hasPort: s.hasPort,
        hasWalls: s.hasWalls,
        hasCitadel: s.hasCitadel
      });

      return `
        <g class="settlement-symbol ${isSel ? "selected" : ""}" transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})" data-kind="settlement" data-id="${s.id}">
          <g transform="scale(${iconScale})">
            ${markerSvg}
            ${isSel ? `<circle cx="0" cy="-10" r="18" fill="none" stroke="#d4a373" stroke-width="2" stroke-dasharray="3,3" />` : ""}
          </g>
          <text x="${(offset[0] * iconScale).toFixed(2)}" y="${(offset[1] * iconScale).toFixed(2)}" text-anchor="middle" font-family="'Cinzel', 'Times New Roman', serif" font-size="${11 * textScale}" font-weight="${s.isCapital ? "bold" : "normal"}" fill="${theme.textPrimary}" filter="url(#re-halo)">${escapeXml(s.name)}</text>
        </g>
      `;
    })
    .join("\n");

  // 10. ダンジョン・遺跡・Poi (Landmarks)
  const landmarksLayer = doc.landmarks
    .map(lm => {
      const [x, y] = lm.position;
      const isSel = lm.id === selectedId;
      return `
        <g class="landmark-symbol ${isSel ? "selected" : ""}" transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})" data-kind="landmark" data-id="${lm.id}">
          <polygon points="0,-9 8,5 -8,5" fill="${theme.landmarkFill}" stroke="#ffffff" stroke-width="1.2" />
          <circle cx="0" cy="0" r="2" fill="#ffffff" />
          ${isSel ? `<circle cx="0" cy="0" r="14" fill="none" stroke="#d4a373" stroke-width="2" />` : ""}
          <text x="0" y="14" text-anchor="middle" font-family="'Cinzel', serif" font-size="${9.5 * textScale}" font-style="italic" fill="${theme.textSecondary}" filter="url(#re-halo)">${escapeXml(lm.name)}</text>
        </g>
      `;
    })
    .join("\n");

  // 11. 地名ラベル (Labels)
  const labelsLayer = doc.labels
    .map(l => {
      const fontFam = l.fontStyle === "italic" ? "Georgia, serif" : "'Cinzel', 'Times New Roman', serif";
      const fontStyleAttr = l.fontStyle === "italic" ? "italic" : "normal";
      const color = l.category === "water" ? theme.textWater : theme.textPrimary;
      const tracking = l.category === "region" ? "letter-spacing: 5px;" : "";
      return `
        <text class="map-label label-${l.category}" x="${l.position[0].toFixed(2)}" y="${l.position[1].toFixed(2)}" text-anchor="middle" font-family="${fontFam}" font-size="${l.fontSizePt * textScale}" font-style="${fontStyleAttr}" font-weight="${l.category === "region" ? "bold" : "normal"}" fill="${color}" style="${tracking}" filter="url(#re-halo)">
          ${escapeXml(l.text)}
        </text>
      `;
    })
    .join("\n");

  // 12. 装飾（コンパスローズ、スケールバー、外枠）
  let decorationLayer = "";
  if (doc.decoration.showCompassRose) {
    const [cx, cy] = doc.decoration.compassPosition;
    decorationLayer += `
      <g class="compass-rose" transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) scale(0.7)">
        <circle cx="0" cy="0" r="28" fill="none" stroke="${theme.borderStroke}" stroke-width="1.2" opacity="0.6" />
        <polygon points="0,-38 7,-11 0,0 -7,-11" fill="${theme.settlementFill}" stroke="${theme.borderStroke}" stroke-width="1" />
        <polygon points="0,38 7,11 0,0 -7,11" fill="${theme.textSecondary}" stroke="${theme.borderStroke}" stroke-width="1" />
        <polygon points="-38,0 -11,-7 0,0 -11,7" fill="${theme.textSecondary}" stroke="${theme.borderStroke}" stroke-width="1" />
        <polygon points="38,0 11,-7 0,0 11,7" fill="${theme.textSecondary}" stroke="${theme.borderStroke}" stroke-width="1" />
        <text x="0" y="-42" text-anchor="middle" font-family="'Cinzel', serif" font-size="14" font-weight="bold" fill="${theme.textPrimary}">N</text>
      </g>
    `;
  }

  if (doc.decoration.showScaleBar) {
    const [sx, sy] = doc.decoration.scaleBarPosition;
    const scaleLenMeters = 20_000;
    const scaleLenUnits = scaleLenMeters / doc.bounds.metersPerUnit;
    decorationLayer += `
      <g class="scale-bar" transform="translate(${sx.toFixed(2)}, ${sy.toFixed(2)})">
        <rect x="0" y="0" width="${scaleLenUnits}" height="5" fill="${theme.textPrimary}" />
        <rect x="0" y="0" width="${scaleLenUnits / 2}" height="5" fill="#ffffff" stroke="${theme.textPrimary}" stroke-width="0.8" />
        <text x="0" y="-5" text-anchor="start" font-family="serif" font-size="9.5" fill="${theme.textPrimary}">0</text>
        <text x="${scaleLenUnits / 2}" y="-5" text-anchor="middle" font-family="serif" font-size="9.5" fill="${theme.textPrimary}">10</text>
        <text x="${scaleLenUnits}" y="-5" text-anchor="end" font-family="serif" font-size="9.5" fill="${theme.textPrimary}">20 km</text>
      </g>
    `;
  }

  if (doc.decoration.showBorder) {
    decorationLayer += `
      <rect x="10" y="10" width="${widthUnits - 20}" height="${heightUnits - 20}" fill="none" stroke="${theme.borderStroke}" stroke-width="2.5" />
      <rect x="15" y="15" width="${widthUnits - 30}" height="${heightUnits - 30}" fill="none" stroke="${theme.borderStroke}" stroke-width="1" />
    `;
  }

  const cellBordersSvg =
    doc.terrain.showCellBorders === true && doc.terrain.cellPolygons?.length
      ? `<g id="layer-cell-borders" fill="none" stroke="#000" stroke-opacity="${doc.terrain.cellBorderOpacity ?? 0.6}" stroke-width="${(0.6 * textScale).toFixed(2)}" stroke-linejoin="round" pointer-events="none">${doc.terrain.cellPolygons
          .map(poly => `<path d="M ${poly.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ")} Z" />`)
          .join("")}</g>`
      : "";
  const cellBordersLayer =
    doc.terrain.cellBorderOrder === "bottom"
      ? { bottom: cellBordersSvg, top: "" }
      : { bottom: "", top: cellBordersSvg };

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthUnits} ${heightUnits}" width="100%" height="100%" class="region-map-svg theme-${themeName}">
      ${defs}
      ${background}
      ${cellBordersLayer.bottom}
      <g id="layer-biomes">${biomesLayer}</g>
      <g id="layer-wetlands"${coastMaskAttr}>${wetlandLayer}${wetlandMarks}</g>
      <g id="layer-contours">${contoursLayer}</g>
      <g id="layer-ripples">${ripplesLayer}</g>
      <g id="layer-coastal-habitats">${coastalHabitatsLayer}</g>
      <g id="layer-coastlines">${coastlinesLayer}${lakesLayer}</g>
      <defs>
        ${FIELD_ANGLES.map(
          (
            angle,
            i
          ) => `<pattern id="re-field-${i}" width="${detail === 2 ? 1.8 : 3}" height="${detail === 2 ? 1.8 : 3}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">
          <rect width="${detail === 2 ? 1.8 : 3}" height="${detail === 2 ? 0.7 : 1.2}" fill="#5f6b32" opacity="${detail === 0 ? 0.12 : 0.22}" />
        </pattern>`
        ).join("\n")}
        ${detail > 0 ? '<pattern id="re-sparse-trees" width="19" height="17" patternUnits="userSpaceOnUse"><circle cx="8" cy="7" r="2" fill="#68825b" opacity="0.6"/></pattern>' : ""}
      </defs>
      <g id="layer-land-use" data-detail-level="${detail}"${coastMaskAttr}>${(doc.landUse?.patches ?? [])
        .filter(p => p.kind !== "cultivation" || doc.terrain.showCultivation === true)
        .map(p => {
          const path = polyToSvgPath(p.polygon);
          const variant = patchVariant(p.id);
          const color =
            p.kind === "built"
              ? "#d6c3a2"
              : p.kind === "cultivation"
                ? FIELD_TONES[variant % FIELD_TONES.length]
                : p.kind === "hay_meadow"
                  ? "#c8ce99"
                  : p.kind === "pasture"
                    ? MEADOW_TONES[variant % MEADOW_TONES.length]
                    : p.kind === "abandoned"
                      ? "#aabb94"
                      : "#b5c595";
          const texture =
            p.kind === "cultivation"
              ? `re-field-${(variant >> 3) % FIELD_ANGLES.length}`
              : detail > 0 && ["agroforestry", "wood_pasture", "managed_forest"].includes(p.kind)
                ? "re-sparse-trees"
                : undefined;
          // Hedgerows keep a constant screen width so individual fields stay legible at any zoom.
          const hedge =
            detail > 0
              ? ` stroke="${p.kind === "cultivation" ? "#7d8447" : "#aaae85"}" stroke-width="0.6" stroke-opacity="0.75" stroke-linejoin="round" vector-effect="non-scaling-stroke"`
              : "";
          return `<path class="re-land-use re-land-use-${p.kind}" data-id="${escapeXml(p.id)}" d="${path}" fill="${color}"${hedge} />${texture ? `<path d="${path}" fill="url(#${texture})"/>` : ""}`;
        })
        .join("\n")}</g>
      <g id="layer-forests">${forestLayer}</g>
      <g id="layer-rivers">${riversLayer}</g>
      <g id="layer-routes">${routesLayer}</g>
      <g id="layer-bridges">${bridgesLayer}</g>
      <g id="layer-symbols">${symbolsLayer}</g>
      <g id="layer-settlements">${settlementsLayer}</g>
      <g id="layer-landmarks">${landmarksLayer}</g>
      <g id="layer-labels">${labelsLayer}</g>
      ${cellBordersLayer.top}
      <g id="layer-decorations">${decorationLayer}</g>
      <g id="layer-brush-cursor">
        <circle id="re-brush-cursor" cx="-9999" cy="-9999" r="35" fill="rgba(212, 163, 115, 0.22)" stroke="#d4a373" stroke-width="2" stroke-dasharray="5,4" pointer-events="none" />
      </g>
    </svg>
  `.trim();
}
