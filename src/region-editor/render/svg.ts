import type { Point, RegionDocument } from "../core/types";
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

export function renderRegionSvg(doc: RegionDocument): string {
  const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
  const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;

  const themeName = doc.decoration.theme;
  const theme = THEMES[themeName] ?? THEMES.schley;

  // 1. Defs (シンボルテンプレート、フィルター、テクスチャ)
  const defs = `
    <defs>
      <!-- パーチメント風ドロップシャドウ -->
      <filter id="re-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.25" />
      </filter>
      <!-- 文字用の白い縁取り（ハロー） -->
      <filter id="re-halo">
        <feMorphology operator="dilate" radius="2" in="SourceAlpha" result="dilated" />
        <feFlood flood-color="${theme.background}" result="flood" />
        <feComposite in="flood" in2="dilated" operator="in" result="outline" />
        <feMerge>
          <feMergeNode in="outline" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  `;

  // 2. 背景
  const background = `<rect width="${widthUnits}" height="${heightUnits}" fill="${theme.background}" />`;

  // 3. バイオーム領域
  const biomesLayer = doc.biomes
    .map(b => {
      const color = theme.biomes[b.kind] ?? theme.biomes.grassland;
      return `<path class="biome-polygon biome-${b.kind}" d="${polyToSvgPath(b.polygon)}" fill="${color}" stroke="none" />`;
    })
    .join("\n");

  // 4. 海岸線 & 湖
  const coastlinesLayer = doc.terrain.coastlinePolygons
    .map(poly => {
      return `<path class="coastline" d="${polyToSvgPath(poly, false)}" fill="none" stroke="${theme.coastlineStroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("\n");

  const lakesLayer = doc.terrain.lakePolygons
    .map(poly => {
      return `<path class="lake" d="${polyToSvgPath(poly, true)}" fill="${theme.riverFill}" stroke="${theme.coastlineStroke}" stroke-width="1.5" />`;
    })
    .join("\n");

  // 5. 河川
  const riversLayer = doc.rivers
    .map(river => {
      const pathD = polyToSvgPath(river.points, false);
      // 平均幅
      const avgWidthMeters = river.widths.reduce((a, b) => a + b, 0) / (river.widths.length || 1);
      const strokeWidth = Math.max(1.5, (avgWidthMeters / doc.bounds.metersPerUnit) * 0.8);
      return `
        <g class="river-group" id="${escapeXml(river.id)}">
          <path d="${pathD}" fill="none" stroke="${theme.riverStroke}" stroke-width="${strokeWidth + 1.2}" stroke-linecap="round" stroke-linejoin="round" />
          <path d="${pathD}" fill="none" stroke="${theme.riverFill}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      `;
    })
    .join("\n");

  // 6. 街道 (Routes)
  const routesLayer = doc.routes
    .map(route => {
      const pathD = polyToSvgPath(route.points, false);
      if (route.kind === "highway") {
        return `
          <g class="route-highway">
            <path d="${pathD}" fill="none" stroke="${theme.highwayStroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${pathD}" fill="none" stroke="${theme.background}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        `;
      }
      if (route.kind === "trail") {
        return `<path class="route-trail" d="${pathD}" fill="none" stroke="${theme.roadStroke}" stroke-width="1.2" stroke-dasharray="3,3" stroke-linecap="round" />`;
      }
      return `<path class="route-road" d="${pathD}" fill="none" stroke="${theme.roadStroke}" stroke-width="1.8" stroke-dasharray="6,2" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join("\n");

  // 7. ★直角橋（Perpendicular Bridges）★: 河川接線と厳格に直角な橋梁
  const bridgesLayer = doc.bridges
    .map(b => {
      const halfL = b.lengthMeters / doc.bounds.metersPerUnit / 2;
      const halfW = b.widthMeters / doc.bounds.metersPerUnit / 2;
      // 角度 b.angleDeg に合わせた回転矩形
      return `
        <g class="perpendicular-bridge" transform="translate(${b.center[0].toFixed(2)}, ${b.center[1].toFixed(2)}) rotate(${b.angleDeg.toFixed(2)})">
          <!-- 橋台・デッキ -->
          <rect x="${(-halfL).toFixed(2)}" y="${(-halfW).toFixed(2)}" width="${(halfL * 2).toFixed(2)}" height="${(halfW * 2).toFixed(2)}" fill="${theme.bridgeDeck}" stroke="${theme.bridgeRail}" stroke-width="1.2" rx="1" />
          <!-- 橋の高欄（両側レール） -->
          <line x1="${(-halfL).toFixed(2)}" y1="${(-halfW).toFixed(2)}" x2="${halfL.toFixed(2)}" y2="${(-halfW).toFixed(2)}" stroke="${theme.bridgeRail}" stroke-width="1.5" />
          <line x1="${(-halfL).toFixed(2)}" y1="${halfW.toFixed(2)}" x2="${halfL.toFixed(2)}" y2="${halfW.toFixed(2)}" stroke="${theme.bridgeRail}" stroke-width="1.5" />
        </g>
      `;
    })
    .join("\n");

  // 8. 地勢シンボル（山、木、丘、湿地など）
  // doc.symbols は Y座標昇順にソートされているのでそのまま描画
  const symbolsLayer = doc.symbols
    .map(sym => {
      const def = SYMBOL_DEFINITIONS[sym.type];
      if (!def) return "";
      const highlight = sym.type.includes("snow") ? "#ffffff" : theme.mountainHighlight;
      const fill = sym.type.startsWith("mountain")
        ? theme.mountainFill
        : sym.type.startsWith("hill")
          ? theme.hillFill
          : sym.type.startsWith("tree")
            ? theme.treeFill
            : theme.textSecondary;
      const stroke = sym.type.startsWith("tree") ? theme.treeStroke : theme.mountainStroke;

      const innerSvg = def.renderSvg(fill, stroke, highlight);
      return `
        <g class="map-symbol" transform="translate(${sym.x.toFixed(2)}, ${sym.y.toFixed(2)}) scale(${sym.scale.toFixed(2)})" data-id="${sym.id}">
          ${innerSvg}
        </g>
      `;
    })
    .join("\n");

  // 9. 集落・拠点シンボル (Settlements)
  const settlementsLayer = doc.settlements
    .map(s => {
      const [x, y] = s.position;
      let markerSvg = "";
      if (s.type === "metropolis" || s.isCapital) {
        // 城郭都市アイコン（大きな塔と城壁）
        markerSvg = `
          <rect x="-7" y="-7" width="14" height="14" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1.5" />
          <polygon points="0,-13 -8,-6 8,-6" fill="${theme.settlementStroke}" />
          <circle cx="0" cy="0" r="3" fill="#ffffff" />
        `;
      } else if (s.type === "city" || s.hasWalls) {
        // 城塞都市アイコン
        markerSvg = `
          <polygon points="0,-9 -7,5 7,5" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1.2" />
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
        `;
      } else if (s.type === "town") {
        // 町アイコン
        markerSvg = `
          <circle cx="0" cy="0" r="5" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1.5" />
          <circle cx="0" cy="0" r="2" fill="#ffffff" />
        `;
      } else {
        // 村アイコン
        markerSvg = `<circle cx="0" cy="0" r="3.5" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1" />`;
      }

      return `
        <g class="settlement-symbol" transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})" data-burg-id="${s.burgId ?? ""}">
          ${markerSvg}
          <text x="0" y="14" text-anchor="middle" font-family="'Cinzel', 'Times New Roman', serif" font-size="11" font-weight="${s.isCapital ? "bold" : "normal"}" fill="${theme.textPrimary}" filter="url(#re-halo)">${escapeXml(s.name)}</text>
        </g>
      `;
    })
    .join("\n");

  // 10. ダンジョン・遺跡・Poi (Landmarks)
  const landmarksLayer = doc.landmarks
    .map(lm => {
      const [x, y] = lm.position;
      return `
        <g class="landmark-symbol" transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})" data-landmark-id="${lm.id}">
          <polygon points="0,-8 7,4 -7,4" fill="${theme.landmarkFill}" stroke="#ffffff" stroke-width="1" />
          <circle cx="0" cy="0" r="1.5" fill="#ffffff" />
          <text x="0" y="12" text-anchor="middle" font-family="'Cinzel', serif" font-size="9" font-style="italic" fill="${theme.textSecondary}" filter="url(#re-halo)">${escapeXml(lm.name)}</text>
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
      const tracking = l.category === "region" ? "letter-spacing: 4px;" : "";
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
      <g class="compass-rose" transform="translate(${cx.toFixed(2)}, ${cy.toFixed(2)}) scale(0.65)">
        <circle cx="0" cy="0" r="26" fill="none" stroke="${theme.borderStroke}" stroke-width="1.2" opacity="0.6" />
        <polygon points="0,-36 6,-10 0,0 -6,-10" fill="${theme.settlementFill}" stroke="${theme.borderStroke}" stroke-width="1" />
        <polygon points="0,36 6,10 0,0 -6,10" fill="${theme.textSecondary}" stroke="${theme.borderStroke}" stroke-width="1" />
        <polygon points="-36,0 -10,-6 0,0 -10,6" fill="${theme.textSecondary}" stroke="${theme.borderStroke}" stroke-width="1" />
        <polygon points="36,0 10,-6 0,0 10,6" fill="${theme.textSecondary}" stroke="${theme.borderStroke}" stroke-width="1" />
        <text x="0" y="-40" text-anchor="middle" font-family="'Cinzel', serif" font-size="14" font-weight="bold" fill="${theme.textPrimary}">N</text>
      </g>
    `;
  }

  if (doc.decoration.showScaleBar) {
    const [sx, sy] = doc.decoration.scaleBarPosition;
    // 20km のスケールバー
    const scaleLenMeters = 20_000;
    const scaleLenUnits = scaleLenMeters / doc.bounds.metersPerUnit;
    decorationLayer += `
      <g class="scale-bar" transform="translate(${sx.toFixed(2)}, ${sy.toFixed(2)})">
        <rect x="0" y="0" width="${scaleLenUnits}" height="4" fill="${theme.textPrimary}" />
        <rect x="0" y="0" width="${scaleLenUnits / 2}" height="4" fill="#ffffff" stroke="${theme.textPrimary}" stroke-width="0.8" />
        <text x="0" y="-4" text-anchor="start" font-family="serif" font-size="9" fill="${theme.textPrimary}">0</text>
        <text x="${scaleLenUnits / 2}" y="-4" text-anchor="middle" font-family="serif" font-size="9" fill="${theme.textPrimary}">10</text>
        <text x="${scaleLenUnits}" y="-4" text-anchor="end" font-family="serif" font-size="9" fill="${theme.textPrimary}">20 km</text>
      </g>
    `;
  }

  if (doc.decoration.showBorder) {
    decorationLayer += `
      <rect x="10" y="10" width="${widthUnits - 20}" height="${heightUnits - 20}" fill="none" stroke="${theme.borderStroke}" stroke-width="2" />
      <rect x="14" y="14" width="${widthUnits - 28}" height="${heightUnits - 28}" fill="none" stroke="${theme.borderStroke}" stroke-width="0.8" />
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthUnits} ${heightUnits}" width="100%" height="100%" class="region-map-svg theme-${themeName}">
      ${defs}
      ${background}
      <g id="layer-biomes">${biomesLayer}</g>
      <g id="layer-coastlines">${coastlinesLayer}${lakesLayer}</g>
      <g id="layer-rivers">${riversLayer}</g>
      <g id="layer-routes">${routesLayer}</g>
      <g id="layer-bridges">${bridgesLayer}</g>
      <g id="layer-symbols">${symbolsLayer}</g>
      <g id="layer-settlements">${settlementsLayer}</g>
      <g id="layer-landmarks">${landmarksLayer}</g>
      <g id="layer-labels">${labelsLayer}</g>
      <g id="layer-decorations">${decorationLayer}</g>
    </svg>
  `.trim();
}
