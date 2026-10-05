import { curveCatmullRom, line } from "d3";
import { getCoastalHabitatDefinition } from "../../data/coastalHabitatCatalog";
import { resolveSettlementLabelPlacements } from "../core/gen/labelPlacement";
import { isForestBiome } from "../core/gen/landscapeBiomes";
import { pointInPolygon } from "../core/geometry";
import type { Point, RegionDocument } from "../core/types";
import { generateCoastalRipples } from "./coastalRipples";
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

export function renderRegionSvg(
  doc: RegionDocument,
  selectedId?: string | null,
  options: { zoom?: number } = {}
): string {
  const zoom = options.zoom ?? 1;
  const detail = zoom < 0.65 ? 0 : zoom < 1.6 ? 1 : 2;
  const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
  const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;

  const themeName = doc.decoration.theme;
  const theme = THEMES[themeName] ?? THEMES.schley;

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
          p.kind === "cultivation" ||
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
        const widthMeters = r.kind === "highway" ? 8 : r.kind === "trail" ? 2 : 5;
        return `<path d="${createCurvedRoutePath(r.points, 0.1)}" fill="none" stroke="#000000" stroke-width="${widthMeters / doc.bounds.metersPerUnit}" />`;
      })
      .join("\n");
    // 河川（川幅＋緩衝帯）の切り開き
    const riversClearing = doc.rivers
      .map(river => {
        if (river.points.length >= 2) {
          const bufferedWidths = river.widths;
          const riverPoly = createCurvedRiverPolygon(river.points, bufferedWidths, doc.bounds.metersPerUnit, 0.1);
          return `<path d="${riverPoly}" fill="#000000" stroke="#000000" stroke-width="0" stroke-linejoin="round" />`;
        }
        return `<path d="${polyToSvgPath(river.points, false)}" fill="none" stroke="#000000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />`;
      })
      .join("\n");

    // 湖および海岸線外側（海洋）の切り開き
    const lakesClearing = doc.terrain.lakePolygons
      .map(poly => `<path d="${polyToSvgPath(poly, true)}" fill="#000000" />`)
      .join("\n");
    const coastlinesClearing = doc.terrain.coastlinePolygons
      .map(poly => `<path d="${polyToSvgPath(poly, true)}" fill="#000000" />`)
      .join("\n");

    forestDefs = `
      <!-- 森林クリアリングマスク: 街道・都市・ダンジョン・水域をくり抜き、それ以外に森を広げる -->
      <mask id="re-forest-clearing-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${widthUnits}" height="${heightUnits}">
        <rect x="0" y="0" width="${widthUnits}" height="${heightUnits}" fill="#ffffff" />
        ${coastlinesClearing}
        ${lakesClearing}
        ${riversClearing}
        ${routesClearing}
        ${landUseClearing}
      </mask>

      <!-- 森林キャノピー用: 光と影の陰影バンプと有機的林縁ディスプレイスメント -->
      <filter id="re-forest-shading" x="-10%" y="-10%" width="120%" height="120%">
        <!-- 樹冠の細かな凹凸ノイズ (微小葉群・クラスタ) -->
        <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="4" seed="42" result="microNoise" />
        <!-- 樹冠の大きな起伏ノイズ (林冠のうねり) -->
        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" seed="88" result="macroNoise" />
        <feComposite in="microNoise" in2="macroNoise" operator="arithmetic" k1="0" k2="0.65" k3="0.35" k4="0" result="canopyNoise" />
        <!-- 直線的なセル境界・林縁を有機的な樹冠の波打ちに変形 -->
        <feDisplacementMap in="SourceGraphic" in2="canopyNoise" scale="5" xChannelSelector="R" yChannelSelector="G" result="displacedCanopy" />
        <!-- 光源による拡散照明: 方位225°、仰角50°からの自然光による陰影 -->
        <feDiffuseLighting in="canopyNoise" lighting-color="#ffffff" surfaceScale="3.6" diffuseConstant="1.2" result="light">
          <feDistantLight azimuth="225" elevation="50" />
        </feDiffuseLighting>
        <!-- 緑色の茂みに光と影を乗算 -->
        <feBlend mode="multiply" in="displacedCanopy" in2="light" result="litCanopy" />
        <!-- 元の図形の外側を完全に透明化（余白の白枠を除去） -->
        <feComposite in="litCanopy" in2="displacedCanopy" operator="in" result="finalCanopy" />
      </filter>

      <!-- 森林全体の地面へのドロップシャドウ（地面から盛り上がる立体感） -->
      <filter id="re-forest-shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="1.5" dy="2.5" stdDeviation="2.2" flood-color="${canopyColors.shadow}" flood-opacity="0.35" />
      </filter>

      <!-- 上空視点の重なり合うキャノピーローブ（葉群クラスタ）パターン -->
      <pattern id="re-forest-canopy-pattern" width="50" height="50" patternUnits="userSpaceOnUse">
        <g fill="${canopyColors.highlight}" opacity="0.22">
          <circle cx="10" cy="12" r="7.5" />
          <circle cx="27" cy="10" r="8" />
          <circle cx="41" cy="17" r="7" />
          <circle cx="18" cy="29" r="8.5" />
          <circle cx="35" cy="33" r="8" />
          <circle cx="9" cy="42" r="6.5" />
          <circle cx="43" cy="41" r="7" />
        </g>
        <g fill="${canopyColors.shadow}" opacity="0.28">
          <circle cx="15" cy="16" r="6.5" />
          <circle cx="32" cy="14" r="7" />
          <circle cx="23" cy="33" r="7.5" />
          <circle cx="39" cy="37" r="6.5" />
          <circle cx="13" cy="46" r="6" />
          <circle cx="44" cy="9" r="5.5" />
        </g>
      </pattern>
    `;

    const forestCells = forestBiomes
      .map(b => {
        const kindKey =
          b.kind === "coniferous_forest" ? "coniferous" : b.kind === "tropical_forest" ? "tropical" : "deciduous";
        const color = canopyColors[kindKey];
        const stockRatio =
          b.forestCover && b.forestStock !== undefined ? Math.max(0, Math.min(1, b.forestStock / b.forestCover)) : 1;
        const pathD = (b.forestPolygons ?? [b.polygon]).map(poly => polyToSvgPath(poly)).join(" ");
        return `<path class="forest-canopy-cell forest-${b.kind}" data-id="${b.id}" d="${pathD}" fill="${color}" opacity="${0.5 + stockRatio * 0.5}" stroke="${color}" stroke-width="0" stroke-linejoin="round" />`;
      })
      .join("\n");

    const patternOverlays = forestBiomes
      .map(
        b =>
          `<path class="forest-pattern-overlay" d="${(b.forestPolygons ?? [b.polygon]).map(poly => polyToSvgPath(poly)).join(" ")}" fill="url(#re-forest-canopy-pattern)" />`
      )
      .join("\n");

    forestLayer = `
      <g class="re-forest-layer" id="re-forest-layer" mask="url(#re-forest-clearing-mask)" filter="url(#re-forest-shadow)">
        <g class="re-forest-canopy" filter="url(#re-forest-shading)">
          ${forestCells}
          ${patternOverlays}
        </g>
      </g>
    `;
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
      ${forestDefs}
    </defs>
  `;

  // 2. 背景
  const background = `<rect width="${widthUnits}" height="${heightUnits}" fill="${theme.background}" />`;

  // 3. バイオーム領域
  const biomesLayer = doc.biomes
    .map(b => {
      const color = b.color ?? theme.biomes[b.kind] ?? theme.biomes.grassland;
      const isSea = b.isWater || b.kind === "ocean";
      const cls = isSea ? "biome-polygon biome-ocean ce-face--sea" : `biome-polygon biome-${b.kind} ce-face--land`;
      return `<path class="${cls}" data-id="${b.id}" d="${polyToSvgPath(b.polygon)}" fill="${color}" stroke="${color}" stroke-width="0.7" stroke-linejoin="round" />`;
    })
    .join("\n");

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

    contoursLayer = `
      <g class="re-contours-layer" id="re-contours-layer">
        ${contourPaths}
      </g>
    `;
  }

  // 4. 海岸線 & 波紋ハッチング & 湖
  const ripples = generateCoastalRipples(doc.terrain.coastlinePolygons, 3, 5);
  const ripplesLayer = ripples
    .map((rip, i) => {
      const opacity = (0.45 - i * 0.12).toFixed(2);
      return `<path class="coastal-ripple" d="${polyToSvgPath(rip, false)}" fill="none" stroke="${theme.coastlineStroke}" stroke-width="0.8" stroke-dasharray="8,4" opacity="${opacity}" />`;
    })
    .join("\n");

  const coastlinesLayer = doc.terrain.coastlinePolygons
    .map(poly => {
      return `<path class="coastline" d="${polyToSvgPath(poly, false)}" fill="none" stroke="${theme.coastlineStroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("\n");

  const coastalHabitatsLayer = (doc.terrain.coastalHabitats ?? [])
    .map((segment, i) => {
      const habitat = getCoastalHabitatDefinition(segment.coastalHabitat);
      if (habitat.key === "none") return "";
      const path = polyToSvgPath(segment.points, false);
      const clipId = `re-coastal-habitat-${i}`;
      const dash =
        habitat.key === "rockyIntertidal"
          ? "2,3"
          : habitat.key === "tidalFlat"
            ? "8,3,2,3"
            : habitat.key === "coastalDune"
              ? "6,4"
              : "1,4";
      return `<defs><clipPath id="${clipId}"><path d="${polyToSvgPath(segment.landPolygon, true)}" /></clipPath></defs>
      <g class="coastal-habitat coastal-habitat-${habitat.key}" data-coastal-habitat="${habitat.key}" clip-path="url(#${clipId})">
        <title>${escapeXml(habitat.label)}</title>
        <path d="${path}" fill="none" stroke="${habitat.color}" stroke-width="14" />
        <path d="${path}" fill="none" stroke="${theme.coastlineStroke}" stroke-width="9" stroke-dasharray="${dash}" opacity="0.3" />
      </g>`;
    })
    .join("\n");

  const lakesLayer = doc.terrain.lakePolygons
    .map(poly => {
      return `<path class="lake" d="${polyToSvgPath(poly, true)}" fill="${theme.riverFill}" stroke="${theme.coastlineStroke}" stroke-width="1.5" />`;
    })
    .join("\n");

  // 5. 河川
  // 5. 河川（太さの変化・水理幅の反映、FMG準拠のベジェ曲線）
  const riversLayer = doc.rivers
    .map(river => {
      const isSel = river.id === selectedId;
      const minW = Math.round(Math.min(...river.widths));
      const maxW = Math.round(Math.max(...river.widths));
      const widthInfo =
        river.widths.length > 0 ? (minW === maxW ? ` (川幅: ${minW}m)` : ` (川幅: ${minW}m〜${maxW}m)`) : "";
      const titleTag = `<title>${escapeXml(river.name)}${widthInfo}</title>`;

      if (river.points.length >= 2) {
        // ベジェ曲線（Catmull-Romスプライン）による川幅変化ポリゴン
        const polyD = createCurvedRiverPolygon(river.points, river.widths, doc.bounds.metersPerUnit, 0.1);
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
            <path d="${pathD}" fill="none" stroke="${isSel ? "#d4a373" : theme.highwayStroke}" stroke-width="${isSel ? "4.2" : "3.2"}" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${pathD}" fill="none" stroke="${theme.background}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        `;
      }
      if (route.kind === "trail") {
        return `<path class="route-trail ${isSel ? "selected" : ""}" data-kind="route" data-id="${route.id}" d="${pathD}" fill="none" stroke="${isSel ? "#d4a373" : theme.roadStroke}" stroke-width="${isSel ? "2.2" : "1.2"}" stroke-dasharray="3,3" stroke-linecap="round">${titleTag}</path>`;
      }
      return `<path class="route-road ${isSel ? "selected" : ""}" data-kind="route" data-id="${route.id}" d="${pathD}" fill="none" stroke="${isSel ? "#d4a373" : theme.roadStroke}" stroke-width="${isSel ? "3.0" : "2"}" stroke-dasharray="7,2" stroke-linecap="round" stroke-linejoin="round">${titleTag}</path>`;
    })
    .join("\n");

  // 7. ★直角橋（Perpendicular Bridges）★: 河川接線と厳格に直角な橋梁
  const bridgesLayer = doc.bridges
    .map(b => {
      const halfL = b.lengthMeters / doc.bounds.metersPerUnit / 2;
      const halfW = b.widthMeters / doc.bounds.metersPerUnit / 2;
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
          p => (p.kind === "built" || p.kind === "cultivation") && pointInPolygon([sym.x, sym.y], p.polygon)
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
          ${markerSvg}
          ${isSel ? `<circle cx="0" cy="-10" r="18" fill="none" stroke="#d4a373" stroke-width="2" stroke-dasharray="3,3" />` : ""}
          <text x="${offset[0].toFixed(2)}" y="${offset[1].toFixed(2)}" text-anchor="middle" font-family="'Cinzel', 'Times New Roman', serif" font-size="11" font-weight="${s.isCapital ? "bold" : "normal"}" fill="${theme.textPrimary}" filter="url(#re-halo)">${escapeXml(s.name)}</text>
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
          <text x="0" y="14" text-anchor="middle" font-family="'Cinzel', serif" font-size="9.5" font-style="italic" fill="${theme.textSecondary}" filter="url(#re-halo)">${escapeXml(lm.name)}</text>
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
        <text class="map-label label-${l.category}" x="${l.position[0].toFixed(2)}" y="${l.position[1].toFixed(2)}" text-anchor="middle" font-family="${fontFam}" font-size="${l.fontSizePt}" font-style="${fontStyleAttr}" font-weight="${l.category === "region" ? "bold" : "normal"}" fill="${color}" style="${tracking}" filter="url(#re-halo)">
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

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthUnits} ${heightUnits}" width="100%" height="100%" class="region-map-svg theme-${themeName}">
      ${defs}
      ${background}
      <g id="layer-biomes">${biomesLayer}</g>
      <g id="layer-contours">${contoursLayer}</g>
      <g id="layer-ripples">${ripplesLayer}</g>
      <g id="layer-coastal-habitats">${coastalHabitatsLayer}</g>
      <g id="layer-coastlines">${coastlinesLayer}${lakesLayer}</g>
      <defs>
        ${detail > 0 ? `<pattern id="re-field-detail" width="${detail === 2 ? 7 : 18}" height="${detail === 2 ? 7 : 18}" patternUnits="userSpaceOnUse" patternTransform="rotate(23)"><path d="M0 0H18" stroke="#b8b080" stroke-width="0.5"/>${detail === 2 ? '<path d="M0 0V7" stroke="#b8b080" stroke-width="0.3"/>' : ""}</pattern>` : ""}
        ${detail > 0 ? '<pattern id="re-sparse-trees" width="19" height="17" patternUnits="userSpaceOnUse"><circle cx="8" cy="7" r="2" fill="#68825b" opacity="0.6"/></pattern>' : ""}
      </defs>
      <g id="layer-land-use" data-detail-level="${detail}">${(doc.landUse?.patches ?? [])
        .map(p => {
          const path = polyToSvgPath(p.polygon);
          const color =
            p.kind === "built"
              ? "#d6c3a2"
              : p.kind === "cultivation"
                ? "#d9cf9d"
                : p.kind === "hay_meadow"
                  ? "#c8ce99"
                  : p.kind === "pasture"
                    ? "#bbc58e"
                    : p.kind === "abandoned"
                      ? "#aabb94"
                      : "#b5c595";
          const texture =
            detail > 0 && p.kind === "cultivation"
              ? "re-field-detail"
              : detail > 0 && ["agroforestry", "wood_pasture", "managed_forest"].includes(p.kind)
                ? "re-sparse-trees"
                : undefined;
          return `<path class="re-land-use re-land-use-${p.kind}" data-id="${escapeXml(p.id)}" d="${path}" fill="${color}" stroke="#aaae85" stroke-width="${detail > 0 ? 0.3 : 0}" />${texture ? `<path d="${path}" fill="url(#${texture})"/>` : ""}`;
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
      <g id="layer-decorations">${decorationLayer}</g>
      <g id="layer-brush-cursor">
        <circle id="re-brush-cursor" cx="-9999" cy="-9999" r="35" fill="rgba(212, 163, 115, 0.22)" stroke="#d4a373" stroke-width="2" stroke-dasharray="5,4" pointer-events="none" />
      </g>
    </svg>
  `.trim();
}
