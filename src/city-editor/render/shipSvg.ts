import type { Point } from "../core/types";

export type ShipType = "small" | "medium" | "large";
export type ShipClassKey = ShipType | "sloop" | "caravel" | "galleon";

export interface ShipDimensions {
  baseLengthMeters: number;
  baseBeamMeters: number;
  defaultSizeMeters: number;
  minSizeMeters: number;
  maxSizeMeters: number;
  label: string;
  historicalName: string;
}

export const SHIP_SPECS: Record<ShipType, ShipDimensions> = {
  small: {
    baseLengthMeters: 16,
    baseBeamMeters: 5,
    defaultSizeMeters: 16,
    minSizeMeters: 10,
    maxSizeMeters: 22,
    label: "小型船 (スループ)",
    historicalName: "Sloop"
  },
  medium: {
    baseLengthMeters: 25,
    baseBeamMeters: 7.5,
    defaultSizeMeters: 25,
    minSizeMeters: 18,
    maxSizeMeters: 32,
    label: "中型船 (キャラベル)",
    historicalName: "Caravel"
  },
  large: {
    baseLengthMeters: 42,
    baseBeamMeters: 11.5,
    defaultSizeMeters: 42,
    minSizeMeters: 30,
    maxSizeMeters: 55,
    label: "大型船 (ガレオン)",
    historicalName: "Galleon"
  }
};

export function normalizeShipType(key: string | undefined): ShipType {
  if (!key) return "small";
  const lower = key.toLowerCase();
  if (lower === "sloop" || lower === "small" || lower.includes("小")) return "small";
  if (lower === "caravel" || lower === "medium" || lower.includes("中")) return "medium";
  if (lower === "galleon" || lower === "large" || lower.includes("大")) return "large";
  return "small";
}

export interface RenderShipOptions {
  type: ShipClassKey;
  point: Point;
  sizeMeters?: number;
  widthMeters?: number;
  rotation?: number;
  id?: string;
  className?: string;
  isPickSelected?: boolean;
  opacity?: number;
}

const NS = "http://www.w3.org/2000/svg";

function element(name: string, attrs: Record<string, string>, content?: string): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content) node.textContent = content;
  return node;
}

/**
 * 船の真上（トップダウン・見下ろし視点）のSVG要素を構築する。
 * 原点 (0, 0) を幾何学的中心とし、拡大縮小 (scale) と回転 (rotate) を組み合わせて
 * 任意の全長（メートル）および任意のアスペクト比でレンダリング可能。
 */
export function renderShipSvg(options: RenderShipOptions): SVGGElement {
  const type = normalizeShipType(options.type);
  const spec = SHIP_SPECS[type];
  const length = options.sizeMeters && options.sizeMeters > 0 ? options.sizeMeters : spec.defaultSizeMeters;
  const scaleY = length / spec.baseLengthMeters;
  const scaleX = options.widthMeters && options.widthMeters > 0 ? options.widthMeters / spec.baseBeamMeters : scaleY;

  // City Editor coordinate system: point[0] = x, -point[1] = y in SVG
  const posX = options.point[0];
  const posY = -options.point[1];
  // rotation in radians (0 is pointing up / -Y)
  const deg = (-(options.rotation ?? 0) * 180) / Math.PI;

  const group = element("g", {
    class: `ce-ship ce-ship--${type} ${options.className ?? ""}`.trim(),
    transform: `translate(${posX} ${posY}) rotate(${deg}) scale(${scaleX.toFixed(4)} ${scaleY.toFixed(4)})`,
    "data-ship-type": type,
    "data-ship-length": String(length),
    ...(options.id ? { "data-element": options.id, id: options.id } : {})
  }) as SVGGElement;

  if (options.opacity !== undefined) {
    group.setAttribute("opacity", String(options.opacity));
  }

  // Type specific inner SVG structures
  switch (type) {
    case "small":
      buildSloopGeometry(group);
      break;
    case "medium":
      buildCaravelGeometry(group);
      break;
    case "large":
      buildGalleonGeometry(group);
      break;
  }

  return group;
}

/**
 * 小型船 (スループ / Sloop)
 * 基準: 全長 16m, 全幅 5m
 * 構成: 単一マスト、ブーム、バウスプリット、小型貨物ハッチ、コンパニオンウェイ、ティラー（舵棒）
 */
function buildSloopGeometry(container: SVGGElement): void {
  // 1. 水面への影 (Hull shadow)
  container.appendChild(
    element("ellipse", {
      cx: "0.3",
      cy: "0.4",
      rx: "2.7",
      ry: "8.4",
      class: "ce-ship-shadow",
      fill: "rgba(18, 30, 38, 0.32)"
    })
  );

  // 2. バウスプリット (Bowsprit)
  container.appendChild(
    element("line", {
      x1: "0",
      y1: "-7.0",
      x2: "0",
      y2: "-11.2",
      stroke: "#423223",
      "stroke-width": "0.45",
      "stroke-linecap": "round"
    })
  );

  // 3. 船体外殻・ガンネル (Outer Hull / Bulwarks)
  container.appendChild(
    element("path", {
      d: "M 0,-8 C 2.1,-7.6 2.65,-3 2.6,0 C 2.55,3.8 2.25,6.8 1.8,7.9 L -1.8,7.9 C -2.25,6.8 -2.55,3.8 -2.6,0 C -2.65,-3 -2.1,-7.6 0,-8 Z",
      class: "ce-ship-hull-outer",
      fill: "#382c20",
      stroke: "#221a13",
      "stroke-width": "0.35"
    })
  );

  // 4. 甲板 (Deck Planking)
  container.appendChild(
    element("path", {
      d: "M 0,-7.3 C 1.85,-6.9 2.2,-2.7 2.15,0 C 2.1,3.5 1.85,6.2 1.45,7.3 L -1.45,7.3 C -1.85,6.2 -2.1,3.5 -2.15,0 C -2.2,-2.7 -1.85,-6.9 0,-7.3 Z",
      class: "ce-ship-deck",
      fill: "#c8b99c",
      stroke: "#423527",
      "stroke-width": "0.2"
    })
  );

  // 板張り（木目ライン）
  container.appendChild(
    element("path", {
      d: "M 0,-6.5 L 0,6.8 M -0.8,-5.5 L -0.8,6.8 M 0.8,-5.5 L 0.8,6.8",
      stroke: "#b0a286",
      "stroke-width": "0.15"
    })
  );

  // 5. 錨 (Anchor)
  container.appendChild(
    element("path", {
      d: "M 1.4,-6.2 L 2.3,-6.9 M 1.9,-7.2 L 1.8,-5.9",
      class: "ce-ship-anchor",
      stroke: "#282a2d",
      "stroke-width": "0.25",
      fill: "none"
    })
  );

  // 6. メインハッチ (Cargo Hatch)
  container.appendChild(
    element("rect", {
      x: "-0.85",
      y: "0.3",
      width: "1.7",
      height: "1.8",
      rx: "0.15",
      class: "ce-ship-hatch",
      fill: "#5a4834",
      stroke: "#31261a",
      "stroke-width": "0.25"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-0.85",
      y1: "1.2",
      x2: "0.85",
      y2: "1.2",
      class: "ce-ship-grating",
      stroke: "#31261a",
      "stroke-width": "0.2"
    })
  );

  // 7. コンパニオンウェイ（船室昇降口）
  container.appendChild(
    element("rect", {
      x: "-0.65",
      y: "3.8",
      width: "1.3",
      height: "1.2",
      rx: "0.15",
      class: "ce-ship-deck-step",
      fill: "#a8987b",
      stroke: "#382a1d",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("rect", {
      x: "-0.45",
      y: "4.0",
      width: "0.9",
      height: "0.8",
      fill: "#382a1d"
    })
  );

  // 8. 索具（シュラウド）
  container.appendChild(
    element("path", {
      d: "M 0,-2.5 L -2.2,-1.8 M 0,-2.5 L -2.2,-3.2 M 0,-2.5 L 2.2,-1.8 M 0,-2.5 L 2.2,-3.2",
      class: "ce-ship-rigging",
      stroke: "#2b2218",
      "stroke-width": "0.2",
      opacity: "0.75"
    })
  );

  // 9. メインマスト＆ブーム (Mast & Boom)
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-2.5",
      r: "0.65",
      class: "ce-ship-bulwark",
      fill: "#48392a",
      stroke: "#261c12",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-2.5",
      r: "0.35",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );

  // ブーム（主帆桁）
  container.appendChild(
    element("line", {
      x1: "0",
      y1: "-2.5",
      x2: "0.3",
      y2: "8.5",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.45",
      "stroke-linecap": "round"
    })
  );

  // ファーリングされた主帆
  container.appendChild(
    element("path", {
      d: "M -0.1,-2.3 Q 0.35,3 0.2,8.3 L 0.5,8.3 Q 0.65,3 0.15,-2.3 Z",
      class: "ce-ship-furled-sail",
      fill: "#e8e0ce",
      stroke: "#7d7260",
      "stroke-width": "0.2"
    })
  );

  // 10. 舵柄 (Tiller)
  container.appendChild(
    element("line", {
      x1: "0",
      y1: "7.7",
      x2: "0",
      y2: "6.2",
      stroke: "#2a1f15",
      "stroke-width": "0.3",
      "stroke-linecap": "round"
    })
  );
}

/**
 * 中型船 (キャラベル / Caravel)
 * 基準: 全長 25m, 全幅 7.5m
 * 構成: 3本マスト（フォア・メイン・ミズン）、ラティーンヤード、船尾クォーターデッキ、積載テンダーボート、キャプスタン
 */
function buildCaravelGeometry(container: SVGGElement): void {
  // 1. 影
  container.appendChild(
    element("ellipse", {
      cx: "0.5",
      cy: "0.6",
      rx: "4.1",
      ry: "13.0",
      class: "ce-ship-shadow",
      fill: "rgba(18, 30, 38, 0.32)"
    })
  );

  // 2. バウスプリット
  container.appendChild(
    element("line", {
      x1: "0",
      y1: "-11.5",
      x2: "0",
      y2: "-17.5",
      stroke: "#423223",
      "stroke-width": "0.7",
      "stroke-linecap": "round"
    })
  );

  // 3. 船体外殻
  container.appendChild(
    element("path", {
      d: "M 0,-12.5 C 3.2,-11.6 3.9,-5 3.85,0 C 3.8,5.2 3.6,9.8 2.45,12.5 L -2.45,12.5 C -3.6,9.8 -3.8,5.2 -3.85,0 C -3.9,-5 -3.2,-11.6 0,-12.5 Z",
      class: "ce-ship-hull-outer",
      fill: "#382c20",
      stroke: "#221a13",
      "stroke-width": "0.4"
    })
  );

  // 4. メイン甲板（ウェルデッキ）
  container.appendChild(
    element("path", {
      d: "M 0,-11.8 C 2.7,-10.9 3.3,-4.5 3.25,0 C 3.2,4.8 3.0,9.2 2.05,11.8 L -2.05,11.8 C -3.0,9.2 -3.2,4.8 -3.25,0 C -3.3,-4.5 -2.7,-10.9 0,-11.8 Z",
      class: "ce-ship-deck",
      fill: "#c8b99c",
      stroke: "#423527",
      "stroke-width": "0.25"
    })
  );

  // 5. フォアデッキ（前段甲板）
  container.appendChild(
    element("path", {
      d: "M 0,-11.8 C 2.4,-11 2.85,-9.5 2.95,-8.0 L -2.95,-8.0 C -2.85,-9.5 -2.4,-11 0,-11.8 Z",
      class: "ce-ship-deck-step",
      fill: "#b2a284",
      stroke: "#382a1d",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-2.95",
      y1: "-8.0",
      x2: "2.95",
      y2: "-8.0",
      stroke: "#2a1f15",
      "stroke-width": "0.4"
    })
  );

  // 6. クォーターデッキ（船尾楼）
  container.appendChild(
    element("path", {
      d: "M -3.15,3.5 L 3.15,3.5 C 3.0,6.5 2.7,9.5 2.05,11.8 L -2.05,11.8 C -2.7,9.5 -3.0,6.5 -3.15,3.5 Z",
      class: "ce-ship-deck-step",
      fill: "#ab9b7e",
      stroke: "#382a1d",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-3.15",
      y1: "3.5",
      x2: "3.15",
      y2: "3.5",
      stroke: "#2a1f15",
      "stroke-width": "0.45"
    })
  );

  // 7. キャプスタン (Capstan)
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-9.6",
      r: "0.6",
      fill: "#4a3927",
      stroke: "#251b11",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("path", {
      d: "M -0.8,-9.6 L 0.8,-9.6 M 0,-10.4 L 0,-8.8",
      stroke: "#251b11",
      "stroke-width": "0.2"
    })
  );

  // 8. 積載テンダーボート (Ship's Boat)
  container.appendChild(
    element("path", {
      d: "M 0,-5.8 C 0.85,-5.5 0.9,-4 0.85,-2.2 C 0.8,-1.8 0.5,-1.8 0,-1.8 C -0.5,-1.8 -0.8,-1.8 -0.85,-2.2 C -0.9,-4 -0.85,-5.5 0,-5.8 Z",
      class: "ce-ship-boat",
      fill: "#b8a88a",
      stroke: "#382a1d",
      "stroke-width": "0.25"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-0.7",
      y1: "-3.8",
      x2: "0.7",
      y2: "-3.8",
      stroke: "#382a1d",
      "stroke-width": "0.2"
    })
  );

  // 9. メインカーゴハッチ (Grating Hatch)
  container.appendChild(
    element("rect", {
      x: "-1.2",
      y: "-0.2",
      width: "2.4",
      height: "2.2",
      rx: "0.2",
      class: "ce-ship-hatch",
      fill: "#5a4834",
      stroke: "#31261a",
      "stroke-width": "0.25"
    })
  );
  // 格子ライン
  container.appendChild(
    element("path", {
      d: "M -1.2,0.5 L 1.2,0.5 M -1.2,1.2 L 1.2,1.2 M -0.4,-0.2 L -0.4,2.0 M 0.4,-0.2 L 0.4,2.0",
      class: "ce-ship-grating",
      stroke: "#31261a",
      "stroke-width": "0.2"
    })
  );

  // 10. クォーターデッキ天窓・コンパニオン
  container.appendChild(
    element("rect", {
      x: "-0.8",
      y: "9.8",
      width: "1.6",
      height: "1.3",
      rx: "0.15",
      fill: "#503f2e",
      stroke: "#261a10",
      "stroke-width": "0.2"
    })
  );

  // 11. 索具（シュラウド群）
  container.appendChild(
    element("path", {
      d: "M 0,-7.5 L -2.8,-6.8 M 0,-7.5 L -2.8,-8.2 M 0,-7.5 L 2.8,-6.8 M 0,-7.5 L 2.8,-8.2 M 0,-1.0 L -3.2,-0.2 M 0,-1.0 L -3.2,-1.8 M 0,-1.0 L 3.2,-0.2 M 0,-1.0 L 3.2,-1.8 M 0,7.5 L -2.5,7.0 M 0,7.5 L 2.5,7.0",
      class: "ce-ship-rigging",
      stroke: "#2b2218",
      "stroke-width": "0.2",
      opacity: "0.75"
    })
  );

  // 12. 3本マスト＆ヤード
  // フォアマスト
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-7.5",
      r: "0.45",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-3.2",
      y1: "-7.5",
      x2: "3.2",
      y2: "-7.5",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.5",
      "stroke-linecap": "round"
    })
  );
  container.appendChild(
    element("rect", {
      x: "-3.1",
      y: "-7.8",
      width: "6.2",
      height: "0.6",
      rx: "0.2",
      class: "ce-ship-furled-sail",
      fill: "#e8e0ce",
      stroke: "#7d7260",
      "stroke-width": "0.2"
    })
  );

  // メインマスト
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-1.0",
      r: "1.1",
      class: "ce-ship-crowsnest",
      fill: "#38281a",
      stroke: "#1e150d",
      "stroke-width": "0.25"
    })
  );
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-1.0",
      r: "0.55",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-4.6",
      y1: "-1.0",
      x2: "4.6",
      y2: "-1.0",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.6",
      "stroke-linecap": "round"
    })
  );
  container.appendChild(
    element("rect", {
      x: "-4.5",
      y: "-1.35",
      width: "9.0",
      height: "0.7",
      rx: "0.25",
      class: "ce-ship-furled-sail",
      fill: "#e8e0ce",
      stroke: "#7d7260",
      "stroke-width": "0.2"
    })
  );

  // ミズンマスト（ラティーンヤード）
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "7.5",
      r: "0.4",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-2.6",
      y1: "4.2",
      x2: "2.4",
      y2: "10.8",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.45",
      "stroke-linecap": "round"
    })
  );
  container.appendChild(
    element("path", {
      d: "M -2.5,4.3 L 2.3,10.7 L 2.6,10.5 L -2.2,4.1 Z",
      class: "ce-ship-furled-sail",
      fill: "#e8e0ce",
      stroke: "#7d7260",
      "stroke-width": "0.15"
    })
  );
}

/**
 * 大型船 (ガレオン / Galleon)
 * 基準: 全長 42m, 全幅 11.5m
 * 構成: ビークヘッド、フォアキャッスル、多段船尾楼（クォーター＆ポープデッキ）、4本マスト、多段ヤード、ピナス長艇、船尾3基ランタン
 */
function buildGalleonGeometry(container: SVGGElement): void {
  // 1. 影
  container.appendChild(
    element("ellipse", {
      cx: "0.8",
      cy: "1.0",
      rx: "6.3",
      ry: "22.2",
      class: "ce-ship-shadow",
      fill: "rgba(18, 30, 38, 0.32)"
    })
  );

  // 2. ビークヘッド (Beakhead) ＆ バウスプリット
  container.appendChild(
    element("path", {
      d: "M 0,-21.2 L 1.2,-17.0 L -1.2,-17.0 Z",
      fill: "#3a2d21",
      stroke: "#251d15",
      "stroke-width": "0.35"
    })
  );
  container.appendChild(
    element("line", {
      x1: "0",
      y1: "-16.5",
      x2: "0",
      y2: "-27.2",
      stroke: "#423223",
      "stroke-width": "0.9",
      "stroke-linecap": "round"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-3.2",
      y1: "-23.8",
      x2: "3.2",
      y2: "-23.8",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.45",
      "stroke-linecap": "round"
    })
  );

  // 3. 船体外殻 (Heavy Hull Outline)
  container.appendChild(
    element("path", {
      d: "M 0,-17 C 4.6,-16 5.8,-8 5.75,0 C 5.7,7 5.2,14 4.0,18.5 C 3.6,20.2 2.8,21 0,21 C -2.8,21 -3.6,20.2 -4.0,18.5 C -5.2,14 -5.7,7 -5.75,0 C -5.8,-8 -4.6,-16 0,-17 Z",
      class: "ce-ship-hull-outer",
      fill: "#382c20",
      stroke: "#1f1811",
      "stroke-width": "0.45"
    })
  );

  // 4. メインデッキ（ウェルデッキ）
  container.appendChild(
    element("path", {
      d: "M 0,-16.2 C 4.0,-15.2 5.0,-7.5 4.95,0 C 4.9,6.5 4.5,13 3.4,17.5 C 3.0,19.2 2.3,19.8 0,19.8 C -2.3,19.8 -3.0,19.2 -3.4,17.5 C -4.5,13 -4.9,6.5 -4.95,0 C -5.0,-7.5 -4.0,-15.2 0,-16.2 Z",
      class: "ce-ship-deck",
      fill: "#c8b99c",
      stroke: "#423527",
      "stroke-width": "0.25"
    })
  );

  // 5. フォアキャッスル（船首楼デッキ）
  container.appendChild(
    element("path", {
      d: "M 0,-16.2 C 3.8,-15.2 4.65,-12.5 4.65,-9.5 L -4.65,-9.5 C -4.65,-12.5 -3.8,-15.2 0,-16.2 Z",
      class: "ce-ship-deck-step",
      fill: "#b2a284",
      stroke: "#382a1d",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-4.65",
      y1: "-9.5",
      x2: "4.65",
      y2: "-9.5",
      stroke: "#2a1f15",
      "stroke-width": "0.5"
    })
  );

  // 6. クォーターデッキ（船尾楼一段目）
  container.appendChild(
    element("path", {
      d: "M -4.8,4.8 L 4.8,4.8 C 4.5,8.2 4.15,11.8 3.7,14.2 L -3.7,14.2 C -4.15,11.8 -4.5,8.2 -4.8,4.8 Z",
      class: "ce-ship-deck-step",
      fill: "#ab9b7e",
      stroke: "#382a1d",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-4.8",
      y1: "4.8",
      x2: "4.8",
      y2: "4.8",
      stroke: "#2a1f15",
      "stroke-width": "0.5"
    })
  );

  // 7. ポープデッキ（船尾楼最上段）
  container.appendChild(
    element("path", {
      d: "M -3.7,14.2 L 3.7,14.2 C 3.3,16.8 2.8,18.8 1.85,20.0 L -1.85,20.0 C -2.8,18.8 -3.3,16.8 -3.7,14.2 Z",
      class: "ce-ship-deck-step",
      fill: "#9e8e72",
      stroke: "#382a1d",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-3.7",
      y1: "14.2",
      x2: "3.7",
      y2: "14.2",
      stroke: "#2a1f15",
      "stroke-width": "0.5"
    })
  );

  // 8. 船首の錨（左右2基）
  container.appendChild(
    element("path", {
      d: "M 3.8,-14.5 L 4.9,-15.5 M 4.3,-16.0 L 4.3,-14.2 M -3.8,-14.5 L -4.9,-15.5 M -4.3,-16.0 L -4.3,-14.2",
      stroke: "#282a2d",
      "stroke-width": "0.3",
      fill: "none"
    })
  );

  // 9. 積載大型ピナス長艇 (Longboat / Pinnace)
  container.appendChild(
    element("path", {
      d: "M 0,-9.0 C 1.2,-8.6 1.25,-6.2 1.2,-3.6 C 1.15,-2.2 0.7,-2.0 0,-2.0 C -0.7,-2.0 -1.15,-2.2 -1.2,-3.6 C -1.25,-6.2 -1.2,-8.6 0,-9.0 Z",
      class: "ce-ship-boat",
      fill: "#b8a88a",
      stroke: "#382a1d",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("path", {
      d: "M -0.9,-7.2 L 0.9,-7.2 M -1.0,-5.4 L 1.0,-5.4 M -0.95,-3.6 L 0.95,-3.6",
      stroke: "#382a1d",
      "stroke-width": "0.2"
    })
  );

  // 10. メイングレーティングハッチ
  container.appendChild(
    element("rect", {
      x: "-1.8",
      y: "0.4",
      width: "3.6",
      height: "2.8",
      rx: "0.25",
      class: "ce-ship-hatch",
      fill: "#5a4834",
      stroke: "#31261a",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("path", {
      d: "M -1.8,1.3 L 1.8,1.3 M -1.8,2.2 L 1.8,2.2 M -0.9,0.4 L -0.9,3.2 M 0,0.4 L 0,3.2 M 0.9,0.4 L 0.9,3.2",
      class: "ce-ship-grating",
      stroke: "#31261a",
      "stroke-width": "0.2"
    })
  );

  // 11. 船尾装飾ランタン（3基）
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "20.6",
      r: "0.55",
      class: "ce-ship-lantern",
      fill: "#c49a45",
      stroke: "#523e16",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("circle", {
      cx: "-2.3",
      cy: "19.8",
      r: "0.45",
      class: "ce-ship-lantern",
      fill: "#c49a45",
      stroke: "#523e16",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("circle", {
      cx: "2.3",
      cy: "19.8",
      r: "0.45",
      class: "ce-ship-lantern",
      fill: "#c49a45",
      stroke: "#523e16",
      "stroke-width": "0.2"
    })
  );

  // 12. 索具（シュラウド群）
  container.appendChild(
    element("path", {
      d: "M 0,-12.0 L -4.4,-11.0 M 0,-12.0 L -4.4,-13.0 M 0,-12.0 L 4.4,-11.0 M 0,-12.0 L 4.4,-13.0 M 0,-1.8 L -4.8,-0.8 M 0,-1.8 L -4.8,-2.8 M 0,-1.8 L 4.8,-0.8 M 0,-1.8 L 4.8,-2.8 M 0,9.5 L -3.8,9.0 M 0,9.5 L 3.8,9.0 M 0,17.2 L -2.5,17.0 M 0,17.2 L 2.5,17.0",
      class: "ce-ship-rigging",
      stroke: "#2b2218",
      "stroke-width": "0.2",
      opacity: "0.75"
    })
  );

  // 13. 4本マスト＆多段ヤード
  // (1) フォアマスト
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-12.0",
      r: "1.1",
      class: "ce-ship-crowsnest",
      fill: "#38281a",
      stroke: "#1e150d",
      "stroke-width": "0.25"
    })
  );
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-12.0",
      r: "0.55",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );
  // ロアヤード
  container.appendChild(
    element("line", {
      x1: "-6.2",
      y1: "-12.0",
      x2: "6.2",
      y2: "-12.0",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.6",
      "stroke-linecap": "round"
    })
  );
  container.appendChild(
    element("rect", {
      x: "-6.0",
      y: "-12.4",
      width: "12.0",
      height: "0.8",
      rx: "0.3",
      class: "ce-ship-furled-sail",
      fill: "#e8e0ce",
      stroke: "#7d7260",
      "stroke-width": "0.2"
    })
  );
  // トップヤード
  container.appendChild(
    element("line", {
      x1: "-4.2",
      y1: "-13.1",
      x2: "4.2",
      y2: "-13.1",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.45",
      "stroke-linecap": "round"
    })
  );

  // (2) メインマスト
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-1.8",
      r: "1.4",
      class: "ce-ship-crowsnest",
      fill: "#38281a",
      stroke: "#1e150d",
      "stroke-width": "0.3"
    })
  );
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "-1.8",
      r: "0.7",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );
  // メインロアヤード
  container.appendChild(
    element("line", {
      x1: "-7.8",
      y1: "-1.8",
      x2: "7.8",
      y2: "-1.8",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.7",
      "stroke-linecap": "round"
    })
  );
  container.appendChild(
    element("rect", {
      x: "-7.6",
      y: "-2.25",
      width: "15.2",
      height: "0.9",
      rx: "0.3",
      class: "ce-ship-furled-sail",
      fill: "#e8e0ce",
      stroke: "#7d7260",
      "stroke-width": "0.2"
    })
  );
  // メイントップヤード
  container.appendChild(
    element("line", {
      x1: "-5.4",
      y1: "-3.1",
      x2: "5.4",
      y2: "-3.1",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.5",
      "stroke-linecap": "round"
    })
  );

  // (3) ミズンマスト
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "9.5",
      r: "0.9",
      class: "ce-ship-crowsnest",
      fill: "#38281a",
      stroke: "#1e150d",
      "stroke-width": "0.25"
    })
  );
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "9.5",
      r: "0.5",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );
  // ラティーンヤード
  container.appendChild(
    element("line", {
      x1: "-4.2",
      y1: "4.8",
      x2: "3.8",
      y2: "14.2",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.55",
      "stroke-linecap": "round"
    })
  );
  container.appendChild(
    element("path", {
      d: "M -4.1,4.9 L 3.7,14.1 L 4.0,13.8 L -3.8,4.6 Z",
      class: "ce-ship-furled-sail",
      fill: "#e8e0ce",
      stroke: "#7d7260",
      "stroke-width": "0.2"
    })
  );

  // (4) ボナベンチャーミズン
  container.appendChild(
    element("circle", {
      cx: "0",
      cy: "17.2",
      r: "0.4",
      class: "ce-ship-mast",
      fill: "#5a4531",
      stroke: "#22170e",
      "stroke-width": "0.2"
    })
  );
  container.appendChild(
    element("line", {
      x1: "-2.2",
      y1: "14.5",
      x2: "2.2",
      y2: "19.8",
      class: "ce-ship-yard",
      stroke: "#3e3020",
      "stroke-width": "0.4",
      "stroke-linecap": "round"
    })
  );
}
