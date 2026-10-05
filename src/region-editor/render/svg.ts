import { resolveSettlementLabelPlacements } from "../core/gen/labelPlacement";
import type { Point, RegionDocument } from "../core/types";
import { generateCoastalRipples } from "./coastalRipples";
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

export function renderRegionSvg(doc: RegionDocument, selectedId?: string | null): string {
  const widthUnits = doc.bounds.widthMeters / doc.bounds.metersPerUnit;
  const heightUnits = doc.bounds.heightMeters / doc.bounds.metersPerUnit;

  const themeName = doc.decoration.theme;
  const theme = THEMES[themeName] ?? THEMES.schley;

  // 1. Defs (パーチメント風テクスチャ、フィルター)
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
    </defs>
  `;

  // 2. 背景
  const background = `<rect width="${widthUnits}" height="${heightUnits}" fill="${theme.background}" />`;

  // 3. バイオーム領域
  const biomesLayer = doc.biomes
    .map(b => {
      const color = theme.biomes[b.kind] ?? theme.biomes.grassland;
      return `<path class="biome-polygon biome-${b.kind}" data-id="${b.id}" d="${polyToSvgPath(b.polygon)}" fill="${color}" stroke="none" />`;
    })
    .join("\n");

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

  const lakesLayer = doc.terrain.lakePolygons
    .map(poly => {
      return `<path class="lake" d="${polyToSvgPath(poly, true)}" fill="${theme.riverFill}" stroke="${theme.coastlineStroke}" stroke-width="1.5" />`;
    })
    .join("\n");

  // 5. 河川
  const riversLayer = doc.rivers
    .map(river => {
      const pathD = polyToSvgPath(river.points, false);
      const avgWidthMeters = river.widths.reduce((a, b) => a + b, 0) / (river.widths.length || 1);
      const strokeWidth = Math.max(1.8, (avgWidthMeters / doc.bounds.metersPerUnit) * 0.85);
      return `
        <g class="river-group" id="${escapeXml(river.id)}" data-kind="river" data-id="${escapeXml(river.id)}">
          <path d="${pathD}" fill="none" stroke="${theme.riverStroke}" stroke-width="${(strokeWidth + 1.4).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" />
          <path d="${pathD}" fill="none" stroke="${theme.riverFill}" stroke-width="${strokeWidth.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" />
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
          <g class="route-highway" data-kind="route" data-id="${route.id}">
            <path d="${pathD}" fill="none" stroke="${theme.highwayStroke}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${pathD}" fill="none" stroke="${theme.background}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />
          </g>
        `;
      }
      if (route.kind === "trail") {
        return `<path class="route-trail" data-kind="route" data-id="${route.id}" d="${pathD}" fill="none" stroke="${theme.roadStroke}" stroke-width="1.2" stroke-dasharray="3,3" stroke-linecap="round" />`;
      }
      return `<path class="route-road" data-kind="route" data-id="${route.id}" d="${pathD}" fill="none" stroke="${theme.roadStroke}" stroke-width="2" stroke-dasharray="7,2" stroke-linecap="round" stroke-linejoin="round" />`;
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
      const offset = offsetMap.get(s.id) ?? [0, 14];

      let markerSvg = "";
      if (s.type === "metropolis" || s.isCapital) {
        markerSvg = `
          <rect x="-8" y="-8" width="16" height="16" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1.8" />
          <polygon points="0,-14 -9,-7 9,-7" fill="${theme.settlementStroke}" />
          <circle cx="0" cy="0" r="3" fill="#ffffff" />
        `;
      } else if (s.type === "city" || s.hasWalls) {
        markerSvg = `
          <polygon points="0,-10 -8,5 8,5" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1.4" />
          <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
        `;
      } else if (s.type === "town") {
        markerSvg = `
          <circle cx="0" cy="0" r="5.5" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1.6" />
          <circle cx="0" cy="0" r="2" fill="#ffffff" />
        `;
      } else {
        markerSvg = `<circle cx="0" cy="0" r="4" fill="${theme.settlementFill}" stroke="${theme.settlementStroke}" stroke-width="1.2" />`;
      }

      return `
        <g class="settlement-symbol ${isSel ? "selected" : ""}" transform="translate(${x.toFixed(2)}, ${y.toFixed(2)})" data-kind="settlement" data-id="${s.id}">
          ${markerSvg}
          ${isSel ? `<circle cx="0" cy="0" r="14" fill="none" stroke="#d4a373" stroke-width="2" />` : ""}
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
      <g id="layer-ripples">${ripplesLayer}</g>
      <g id="layer-coastlines">${coastlinesLayer}${lakesLayer}</g>
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
