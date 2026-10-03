import type { Point, TempleType } from "../core/types";

export type { TempleType };

export interface RenderTempleOptions {
  point: Point;
  length: number;
  width: number;
  rotation?: number;
  id?: string;
  className?: string;
  isPickSelected?: boolean;
  templeType?: TempleType;
}

const NS = "http://www.w3.org/2000/svg";

function element(name: string, attrs: Record<string, string>, content?: string): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content) node.textContent = content;
  return node;
}

function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/**
 * 建築素材カラーパレット
 * - 屋根: テラコッタ粘土瓦（オレンジ）、木板葺き・茅葺き（ゴールド・アンバー）、石板スレート（スレートグレー）
 * - 構造・壁面: 切石・ライムストーン（石材グレー）、木組み・丸太柱（ウッドブラウン）
 * - 自然・聖域: 巨石（風化石）、土・芝生、聖なる火
 */
const PALETTE = {
  roof: {
    highlight: "#c86a3e", // 北面・西面など光を受ける斜面（テラコッタ）
    midLight: "#ba5d30", // 標準テラコッタ色
    midDark: "#a34e25", // やや陰になる面
    shadow: "#8c3e1a", // 南面・東面など深い陰影
    deepShadow: "#733012",
    ridge: "#52210d", // 棟線・稜線
    ridgeHighlight: "#e8956e",
    stroke: "#422616"
  },
  stone: {
    base: "#b8b5ad", // 基礎・外郭
    buttress: "#9e9b93", // 控え壁
    aisleNorth: "#b2afa7", // 側廊上面（石材テラス・光側）
    aisleSouth: "#9e9b93", // 側廊上面（石材テラス・影側）
    ambulatory: "#a8a59d", // 周歩廊上面（石材）
    wall: "#b3b0a8", // 塔壁面・ファサード
    portal: "#2b2721", // 入口窪み
    stroke: "#38352e" // 石材輪郭ストローク
  },
  wood: {
    base: "#5c4632",
    wall: "#72583f",
    highlight: "#947656",
    shadow: "#463423",
    ridge: "#2d2014",
    post: "#3b2c1d",
    stroke: "#261a0f"
  },
  thatch: {
    highlight: "#d1b45a", // 茅葺き光面
    midLight: "#be9f44",
    shadow: "#8f7228", // 茅葺き影面
    ridge: "#5c4714",
    stroke: "#3d2e0b"
  },
  megalith: {
    earth: "#736854", // 踏み固められた土
    earthBorder: "#5e5443",
    stoneLight: "#b5b2aa", // 巨石光側
    stoneMid: "#949187", // 巨石上面
    stoneShadow: "#5c5952", // 巨石影側
    moss: "#5b6d49", // 苔アクセント
    runic: "#3c3831", // 祭壇彫刻線
    stroke: "#36342e"
  },
  hearth: {
    pit: "#211c18",
    fireGlow: "#ff5722",
    flame: "#ffca28"
  },
  shadow: "#181e22" // 地表ドロップシャドウ
};

/**
 * 建築タイプを判定する。
 * 指定がない場合、寒村・小集落スケール（length < 24m）は素朴な礼拝堂（chapel）とし、
 * 中〜大都市スケールはバシリカ（basilica）とする。
 */
export function resolveTempleType(options: RenderTempleOptions): TempleType {
  if (options.templeType) return options.templeType;
  return options.length < 24 ? "chapel" : "basilica";
}

/**
 * 寺院・聖域・礼拝堂のトップダウンSVG要素を構築する。
 * 都市の規模やオプションに応じてバシリカ大聖堂、素朴な村の礼拝堂、原始的環状列石、木造祠を描き分ける。
 */
export function renderTempleSvg(options: RenderTempleOptions): SVGGElement {
  const templeType = resolveTempleType(options);
  const length = Math.max(10, options.length);
  const width = Math.max(6, options.width);
  const hx = length / 2;
  const hy = width / 2;

  const posX = options.point[0];
  const posY = -options.point[1];
  const deg = (-(options.rotation ?? 0) * 180) / Math.PI;

  const root = element("g", {
    class: `ce-temple ce-temple--${templeType} ${options.className ?? ""}`.trim(),
    transform: `translate(${posX} ${posY}) rotate(${deg})`,
    width: String(length),
    height: String(width),
    ...(options.id ? { "data-element": options.id, id: options.id } : {})
  }) as SVGGElement;

  switch (templeType) {
    case "chapel":
      renderRusticChapel(root, length, width, hx, hy);
      break;
    case "megalith":
      renderStoneCircle(root, length, width, hx, hy);
      break;
    case "shrine":
      renderTimberShrine(root, length, width, hx, hy);
      break;
    case "basilica":
    default:
      renderBasilica(root, length, width, hx, hy);
      break;
  }

  return root;
}

// ============================================================================
// 1. 素朴な村の礼拝堂 (Rustic Village Chapel)
// 寒村にふさわしい単身廊＋内陣＋素朴な鐘架＋ポーチの石造り・瓦葺き小教会
// ============================================================================
function renderRusticChapel(root: SVGGElement, length: number, width: number, hx: number, hy: number): void {
  // 身廊 (Nave: 西〜中央やや東) と 内陣 (Chancel: 身廊より狭く一段低い東端)
  const naveWest = -hx;
  const naveEast = hx * 0.28;
  const chancelEast = hx;

  const naveHy = hy * 0.72; // 身廊半幅
  const chancelHy = hy * 0.48; // 内陣半幅

  // 南玄関ポーチ (South Porch)
  const porchWest = -hx * 0.42;
  const porchEast = -hx * 0.12;
  const porchMidX = (porchWest + porchEast) / 2;
  const porchSouth = naveHy + hy * 0.38;

  // 1. ドロップシャドウ
  const shadowOffset = Math.max(0.5, length * 0.02);
  const shadowGroup = element("g", {
    class: "ce-temple-shadow",
    transform: `translate(${fmt(shadowOffset)} ${fmt(shadowOffset * 1.2)})`,
    opacity: "0.32"
  });

  const outlinePath = [
    // 身廊西面
    `M ${fmt(naveWest)} ${fmt(-naveHy)}`,
    // 身廊北壁
    `L ${fmt(naveEast)} ${fmt(-naveHy)}`,
    // 内陣北壁
    `L ${fmt(naveEast)} ${fmt(-chancelHy)}`,
    `L ${fmt(chancelEast)} ${fmt(-chancelHy)}`,
    // 内陣東面
    `L ${fmt(chancelEast)} ${fmt(chancelHy)}`,
    // 内陣南壁
    `L ${fmt(naveEast)} ${fmt(chancelHy)}`,
    `L ${fmt(naveEast)} ${fmt(naveHy)}`,
    // 身廊南壁〜南ポーチ
    `L ${fmt(porchEast)} ${fmt(naveHy)}`,
    `L ${fmt(porchEast)} ${fmt(porchSouth)}`,
    `L ${fmt(porchWest)} ${fmt(porchSouth)}`,
    `L ${fmt(porchWest)} ${fmt(naveHy)}`,
    `L ${fmt(naveWest)} ${fmt(naveHy)}`,
    "Z"
  ].join(" ");

  shadowGroup.appendChild(
    element("path", {
      d: outlinePath,
      fill: PALETTE.shadow
    })
  );
  root.appendChild(shadowGroup);

  // 2. 石造基礎 (Foundation Base)
  const baseGroup = element("g", { class: "ce-temple-base" });
  baseGroup.appendChild(
    element("path", {
      d: outlinePath,
      fill: PALETTE.stone.base,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.7",
      "stroke-linejoin": "round"
    })
  );
  root.appendChild(baseGroup);

  // 3. 控え壁 (Buttresses: 身廊四隅・内陣東隅)
  const buttressesGroup = element("g", {
    class: "ce-temple-buttresses",
    fill: PALETTE.stone.buttress,
    stroke: PALETTE.stone.stroke,
    "stroke-width": "0.5"
  });
  const bThick = Math.max(0.6, width * 0.05);
  const bLength = Math.max(0.8, length * 0.035);

  // 身廊北西角・南西角
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(naveWest - bLength),
      y: fmt(-naveHy),
      width: fmt(bLength),
      height: fmt(bThick)
    })
  );
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(naveWest - bLength),
      y: fmt(naveHy - bThick),
      width: fmt(bLength),
      height: fmt(bThick)
    })
  );
  // 内陣北東角・南東角
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(chancelEast),
      y: fmt(-chancelHy),
      width: fmt(bLength),
      height: fmt(bThick)
    })
  );
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(chancelEast),
      y: fmt(chancelHy - bThick),
      width: fmt(bLength),
      height: fmt(bThick)
    })
  );
  root.appendChild(buttressesGroup);

  // 4. 内陣屋根 (Chancel Roof: 一段低い切妻)
  const chancelRoofGroup = element("g", { class: "ce-temple-chancel" });
  // 北斜面（光側）
  chancelRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(naveEast)},${fmt(-chancelHy)}`,
        `${fmt(chancelEast)},${fmt(-chancelHy)}`,
        `${fmt(chancelEast)},0`,
        `${fmt(naveEast)},0`
      ].join(" "),
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.45"
    })
  );
  // 南斜面（影側）
  chancelRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(naveEast)},0`,
        `${fmt(chancelEast)},0`,
        `${fmt(chancelEast)},${fmt(chancelHy)}`,
        `${fmt(naveEast)},${fmt(chancelHy)}`
      ].join(" "),
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.45"
    })
  );
  // 内陣棟線
  chancelRoofGroup.appendChild(
    element("line", {
      x1: fmt(naveEast),
      y1: "0",
      x2: fmt(chancelEast),
      y2: "0",
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.7",
      "stroke-linecap": "round"
    })
  );
  root.appendChild(chancelRoofGroup);

  // 5. 主身廊屋根 (Main Nave Roof)
  const naveRoofGroup = element("g", { class: "ce-temple-nave" });
  // 北斜面（光側テラコッタ）
  naveRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(naveWest)},${fmt(-naveHy)}`,
        `${fmt(naveEast)},${fmt(-naveHy)}`,
        `${fmt(naveEast)},0`,
        `${fmt(naveWest)},0`
      ].join(" "),
      fill: PALETTE.roof.highlight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.5"
    })
  );
  // 南斜面（影側テラコッタ）
  naveRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(naveWest)},0`,
        `${fmt(naveEast)},0`,
        `${fmt(naveEast)},${fmt(naveHy)}`,
        `${fmt(naveWest)},${fmt(naveHy)}`
      ].join(" "),
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.5"
    })
  );
  // 身廊大棟線
  naveRoofGroup.appendChild(
    element("line", {
      x1: fmt(naveWest),
      y1: "0",
      x2: fmt(naveEast),
      y2: "0",
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.85",
      "stroke-linecap": "round"
    })
  );
  // 棟線微細ハイライト
  naveRoofGroup.appendChild(
    element("line", {
      x1: fmt(naveWest),
      y1: fmt(-0.2),
      x2: fmt(naveEast),
      y2: fmt(-0.2),
      stroke: PALETTE.roof.ridgeHighlight,
      "stroke-width": "0.35",
      opacity: "0.75"
    })
  );
  root.appendChild(naveRoofGroup);

  // 6. 南玄関ポーチ (South Porch)
  const porchGroup = element("g", { class: "ce-temple-porch" });
  // 西斜面（光側）
  porchGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(porchWest)},${fmt(naveHy)}`,
        `${fmt(porchWest)},${fmt(porchSouth)}`,
        `${fmt(porchMidX)},${fmt(porchSouth)}`,
        `${fmt(porchMidX)},${fmt(naveHy)}`
      ].join(" "),
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 東斜面（影側）
  porchGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(porchMidX)},${fmt(naveHy)}`,
        `${fmt(porchMidX)},${fmt(porchSouth)}`,
        `${fmt(porchEast)},${fmt(porchSouth)}`,
        `${fmt(porchEast)},${fmt(naveHy)}`
      ].join(" "),
      fill: PALETTE.roof.deepShadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // ポーチ棟線
  porchGroup.appendChild(
    element("line", {
      x1: fmt(porchMidX),
      y1: fmt(naveHy),
      x2: fmt(porchMidX),
      y2: fmt(porchSouth),
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.6",
      "stroke-linecap": "round"
    })
  );
  // 入口ポータルアーチの陰
  porchGroup.appendChild(
    element("rect", {
      x: fmt(porchMidX - width * 0.04),
      y: fmt(porchSouth - 0.4),
      width: fmt(width * 0.08),
      height: "0.4",
      fill: PALETTE.stone.portal
    })
  );
  root.appendChild(porchGroup);

  // 7. 西端の素朴な木製鐘架・小鐘塔 (Bellcote / Gable Turret)
  // 西側切妻屋根の上に乗る素朴な鐘楼
  const bellcoteGroup = element("g", { class: "ce-temple-bellcote" });
  const bSize = Math.max(1.4, length * 0.08);
  const bHalf = bSize / 2;
  const bMidX = naveWest + bHalf + length * 0.02;
  const bX1 = bMidX - bHalf;
  const bX2 = bMidX + bHalf;
  const bY1 = -bHalf;
  const bY2 = bHalf;

  // 鐘架のピラミッド錐屋根
  // 北面
  bellcoteGroup.appendChild(
    element("polygon", {
      points: `${fmt(bX1)},${fmt(bY1)} ${fmt(bMidX)},0 ${fmt(bX2)},${fmt(bY1)}`,
      fill: PALETTE.roof.highlight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 西面
  bellcoteGroup.appendChild(
    element("polygon", {
      points: `${fmt(bX1)},${fmt(bY1)} ${fmt(bMidX)},0 ${fmt(bX1)},${fmt(bY2)}`,
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 南面
  bellcoteGroup.appendChild(
    element("polygon", {
      points: `${fmt(bX1)},${fmt(bY2)} ${fmt(bMidX)},0 ${fmt(bX2)},${fmt(bY2)}`,
      fill: PALETTE.roof.deepShadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 東面
  bellcoteGroup.appendChild(
    element("polygon", {
      points: `${fmt(bX2)},${fmt(bY1)} ${fmt(bMidX)},0 ${fmt(bX2)},${fmt(bY2)}`,
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 4隅からの対角線（尖塔の稜線）
  bellcoteGroup.appendChild(
    element("line", {
      class: "ce-temple-spire-diagonal",
      x1: fmt(bX1),
      y1: fmt(bY1),
      x2: fmt(bX2),
      y2: fmt(bY2),
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.5",
      "stroke-linecap": "round"
    })
  );
  bellcoteGroup.appendChild(
    element("line", {
      class: "ce-temple-spire-diagonal",
      x1: fmt(bX1),
      y1: fmt(bY2),
      x2: fmt(bX2),
      y2: fmt(bY1),
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.5",
      "stroke-linecap": "round"
    })
  );

  root.appendChild(bellcoteGroup);
}

// ============================================================================
// 2. 原始的な環状列石と祭壇 (Megalithic Stone Circle & Altar)
// 土着信仰・精霊崇拝・古代の聖域。巨石群（Menhirs）と中央の平らな石板祭壇
// ============================================================================
function renderStoneCircle(root: SVGGElement, length: number, width: number, hx: number, hy: number): void {
  const rx = hx * 0.82;
  const ry = hy * 0.82;

  // 1. 聖域の踏み固められた土・サークルグラウンド
  const earthGroup = element("g", { class: "ce-temple-earth" });
  earthGroup.appendChild(
    element("ellipse", {
      cx: "0",
      cy: "0",
      rx: fmt(rx * 1.08),
      ry: fmt(ry * 1.08),
      fill: PALETTE.megalith.earth,
      opacity: "0.22",
      stroke: PALETTE.megalith.earthBorder,
      "stroke-width": "0.6",
      "stroke-dasharray": "3 2"
    })
  );
  root.appendChild(earthGroup);

  // 2. ドロップシャドウ
  const shadowOffset = Math.max(0.6, length * 0.025);
  const shadowGroup = element("g", {
    class: "ce-temple-shadow",
    transform: `translate(${fmt(shadowOffset)} ${fmt(shadowOffset * 1.2)})`,
    opacity: "0.38"
  });

  // 巨石（立石）の配置パラメータ
  // 10基の環状列石 + 西側門柱石2基
  const stoneCount = 10;
  const stones: Array<{
    cx: number;
    cy: number;
    w: number;
    h: number;
    angle: number;
    isPortal?: boolean;
  }> = [];

  for (let i = 0; i < stoneCount; i++) {
    const theta = (i * 2 * Math.PI) / stoneCount;
    // 西端（Math.PI付近）は参道のため少し広げる
    if (Math.abs(theta - Math.PI) < 0.3) continue;

    // 自然石の不揃いさ（わずかなゆらぎ）
    const wobbleR = 1 + Math.sin(i * 3.7) * 0.08;
    const cx = rx * Math.cos(theta) * wobbleR;
    const cy = ry * Math.sin(theta) * wobbleR;
    const w = Math.max(1.2, length * 0.055 * (0.85 + Math.cos(i * 2) * 0.2));
    const h = Math.max(0.9, width * 0.06 * (0.85 + Math.sin(i * 3) * 0.2));
    stones.push({ cx, cy, w, h, angle: theta });
  }

  // 西側参道の2基の堂々たる門石 (Portal Stones)
  const portalY = ry * 0.35;
  stones.push({ cx: -rx * 1.02, cy: -portalY, w: length * 0.07, h: width * 0.075, angle: 0, isPortal: true });
  stones.push({ cx: -rx * 1.02, cy: portalY, w: length * 0.07, h: width * 0.075, angle: 0, isPortal: true });

  // 影の生成（巨石＋中央祭壇）
  for (const st of stones) {
    shadowGroup.appendChild(
      element("ellipse", {
        cx: fmt(st.cx),
        cy: fmt(st.cy),
        rx: fmt(st.w * 0.9),
        ry: fmt(st.h * 0.9),
        fill: PALETTE.shadow
      })
    );
  }

  // 中央祭壇石の影
  const altarW = Math.max(2.6, length * 0.2);
  const altarH = Math.max(1.8, width * 0.2);
  shadowGroup.appendChild(
    element("rect", {
      x: fmt(-altarW / 2 + length * 0.02),
      y: fmt(-altarH / 2),
      width: fmt(altarW),
      height: fmt(altarH),
      rx: "0.5",
      fill: PALETTE.shadow
    })
  );
  root.appendChild(shadowGroup);

  // 3. 巨石群（Standing Stones / Menhirs）
  const stonesGroup = element("g", { class: "ce-temple-megaliths" });

  for (const st of stones) {
    const sg = element("g", { class: st.isPortal ? "ce-megalith-portal" : "ce-megalith-stone" });
    const hw = st.w / 2;
    const hh = st.h / 2;

    // 不規則な多角形で表現する自然石
    const p1 = `${fmt(st.cx - hw * 0.8)},${fmt(st.cy - hh)}`;
    const p2 = `${fmt(st.cx + hw * 0.9)},${fmt(st.cy - hh * 0.7)}`;
    const p3 = `${fmt(st.cx + hw)},${fmt(st.cy + hh * 0.6)}`;
    const p4 = `${fmt(st.cx + hw * 0.4)},${fmt(st.cy + hh)}`;
    const p5 = `${fmt(st.cx - hw * 0.9)},${fmt(st.cy + hh * 0.8)}`;

    // 石本体（風化石の自然な色）
    sg.appendChild(
      element("polygon", {
        points: `${p1} ${p2} ${p3} ${p4} ${p5}`,
        fill: PALETTE.megalith.stoneMid,
        stroke: PALETTE.megalith.stroke,
        "stroke-width": "0.45",
        "stroke-linejoin": "round"
      })
    );

    // 北西側の光ハイライト面
    sg.appendChild(
      element("polyline", {
        points: `${p5} ${p1} ${p2}`,
        fill: "none",
        stroke: PALETTE.megalith.stoneLight,
        "stroke-width": "0.6",
        "stroke-linecap": "round"
      })
    );

    // 南東側の影面
    sg.appendChild(
      element("polyline", {
        points: `${p2} ${p3} ${p4}`,
        fill: "none",
        stroke: PALETTE.megalith.stoneShadow,
        "stroke-width": "0.55",
        "stroke-linecap": "round"
      })
    );

    // 微かな苔アクセント
    sg.appendChild(
      element("circle", {
        cx: fmt(st.cx - hw * 0.2),
        cy: fmt(st.cy - hh * 0.2),
        r: fmt(Math.min(hw, hh) * 0.35),
        fill: PALETTE.megalith.moss,
        opacity: "0.55"
      })
    );

    stonesGroup.appendChild(sg);
  }
  root.appendChild(stonesGroup);

  // 4. 中央巨石祭壇 (Central Dolmen / Altar Slab)
  const altarGroup = element("g", { class: "ce-temple-altar" });
  const ax = -altarW / 2 + length * 0.02;
  const ay = -altarH / 2;

  // 祭壇の基石（下を支える支石）
  altarGroup.appendChild(
    element("rect", {
      x: fmt(ax + 0.3),
      y: fmt(ay + 0.3),
      width: fmt(altarW - 0.6),
      height: fmt(altarH - 0.6),
      fill: PALETTE.megalith.stoneShadow,
      stroke: PALETTE.megalith.stroke,
      "stroke-width": "0.4"
    })
  );

  // 祭壇の平らな大石板（Slab）
  altarGroup.appendChild(
    element("rect", {
      x: fmt(ax),
      y: fmt(ay),
      width: fmt(altarW),
      height: fmt(altarH),
      rx: "0.4",
      fill: PALETTE.megalith.stoneLight,
      stroke: PALETTE.megalith.stroke,
      "stroke-width": "0.6",
      "stroke-linejoin": "round"
    })
  );

  // 祭壇上面に刻まれた神聖なルーン・太陽の環（Runic Sun Pattern）
  altarGroup.appendChild(
    element("circle", {
      cx: fmt(ax + altarW / 2),
      cy: fmt(ay + altarH / 2),
      r: fmt(Math.min(altarW, altarH) * 0.28),
      fill: "none",
      stroke: PALETTE.megalith.runic,
      "stroke-width": "0.4",
      opacity: "0.75"
    })
  );
  altarGroup.appendChild(
    element("line", {
      x1: fmt(ax + altarW / 2 - Math.min(altarW, altarH) * 0.35),
      y1: fmt(ay + altarH / 2),
      x2: fmt(ax + altarW / 2 + Math.min(altarW, altarH) * 0.35),
      y2: fmt(ay + altarH / 2),
      stroke: PALETTE.megalith.runic,
      "stroke-width": "0.35",
      opacity: "0.6"
    })
  );
  altarGroup.appendChild(
    element("line", {
      x1: fmt(ax + altarW / 2),
      y1: fmt(ay + altarH / 2 - Math.min(altarW, altarH) * 0.35),
      x2: fmt(ax + altarW / 2),
      y2: fmt(ay + altarH / 2 + Math.min(altarW, altarH) * 0.35),
      stroke: PALETTE.megalith.runic,
      "stroke-width": "0.35",
      opacity: "0.6"
    })
  );

  root.appendChild(altarGroup);
}

// ============================================================================
// 3. 素朴な木造の祠 / 社 (Primitive Timber / Thatched Shrine)
// 北欧・スラヴ・ケルト風の木造急勾配切妻社、木彫り角装飾、聖なる炉床
// ============================================================================
function renderTimberShrine(root: SVGGElement, length: number, width: number, hx: number, hy: number): void {
  // 身舎 (Hall)
  const hallWest = -hx * 0.75;
  const hallEast = hx * 0.45;
  const hallHy = hy * 0.78;

  // 1. ドロップシャドウ
  const shadowOffset = Math.max(0.6, length * 0.022);
  const shadowGroup = element("g", {
    class: "ce-temple-shadow",
    transform: `translate(${fmt(shadowOffset)} ${fmt(shadowOffset * 1.2)})`,
    opacity: "0.34"
  });

  const hallW = hallEast - hallWest;
  const hallH = hallHy * 2;
  shadowGroup.appendChild(
    element("rect", {
      x: fmt(hallWest),
      y: fmt(-hallHy),
      width: fmt(hallW),
      height: fmt(hallH),
      rx: "0.6",
      fill: PALETTE.shadow
    })
  );
  root.appendChild(shadowGroup);

  // 2. 木造高床デッキ・基壇 (Timber Base Deck)
  const baseGroup = element("g", { class: "ce-temple-base" });
  baseGroup.appendChild(
    element("rect", {
      x: fmt(hallWest - 0.4),
      y: fmt(-hallHy - 0.4),
      width: fmt(hallW + 0.8),
      height: fmt(hallH + 0.8),
      rx: "0.6",
      fill: PALETTE.wood.base,
      stroke: PALETTE.wood.stroke,
      "stroke-width": "0.6"
    })
  );
  root.appendChild(baseGroup);

  // 3. 茅葺き / 木板葺きの大屋根 (Thatched Gable Roof)
  const roofGroup = element("g", { class: "ce-temple-roof" });

  // 北斜面（光側茅葺き・ゴールデンアンバー）
  roofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(hallWest)},${fmt(-hallHy)}`,
        `${fmt(hallEast)},${fmt(-hallHy)}`,
        `${fmt(hallEast)},0`,
        `${fmt(hallWest)},0`
      ].join(" "),
      fill: PALETTE.thatch.highlight,
      stroke: PALETTE.thatch.stroke,
      "stroke-width": "0.45"
    })
  );

  // 南斜面（影側茅葺き・ディープアンバー）
  roofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(hallWest)},0`,
        `${fmt(hallEast)},0`,
        `${fmt(hallEast)},${fmt(hallHy)}`,
        `${fmt(hallWest)},${fmt(hallHy)}`
      ].join(" "),
      fill: PALETTE.thatch.shadow,
      stroke: PALETTE.thatch.stroke,
      "stroke-width": "0.45"
    })
  );

  // 大棟木（Heavy Timber Ridge Log）
  roofGroup.appendChild(
    element("line", {
      x1: fmt(hallWest - 0.5),
      y1: "0",
      x2: fmt(hallEast + 0.5),
      y2: "0",
      stroke: PALETTE.thatch.ridge,
      "stroke-width": "0.9",
      "stroke-linecap": "round"
    })
  );

  // 棟木両端の木彫り装飾（Crossed Gable Beast Heads / Horns）
  // 西端木彫り
  roofGroup.appendChild(
    element("path", {
      d: `M ${fmt(hallWest - 0.6)} -0.7 L ${fmt(hallWest + 0.3)} 0 L ${fmt(hallWest - 0.6)} 0.7`,
      fill: "none",
      stroke: PALETTE.wood.ridge,
      "stroke-width": "0.6",
      "stroke-linecap": "round"
    })
  );
  // 東端木彫り
  roofGroup.appendChild(
    element("path", {
      d: `M ${fmt(hallEast + 0.6)} -0.7 L ${fmt(hallEast - 0.3)} 0 L ${fmt(hallEast + 0.6)} 0.7`,
      fill: "none",
      stroke: PALETTE.wood.ridge,
      "stroke-width": "0.6",
      "stroke-linecap": "round"
    })
  );

  root.appendChild(roofGroup);

  // 4. 外周の丸太柱 (Log Posts)
  const postsGroup = element("g", { class: "ce-temple-posts" });
  const postR = Math.max(0.45, width * 0.04);
  const postXs = [hallWest, (hallWest + hallEast) / 2, hallEast];
  for (const px of postXs) {
    // 北側柱
    postsGroup.appendChild(
      element("circle", {
        cx: fmt(px),
        cy: fmt(-hallHy),
        r: fmt(postR),
        fill: PALETTE.wood.post,
        stroke: PALETTE.wood.stroke,
        "stroke-width": "0.35"
      })
    );
    // 南側柱
    postsGroup.appendChild(
      element("circle", {
        cx: fmt(px),
        cy: fmt(hallHy),
        r: fmt(postR),
        fill: PALETTE.wood.post,
        stroke: PALETTE.wood.stroke,
        "stroke-width": "0.35"
      })
    );
  }
  root.appendChild(postsGroup);

  // 5. 正面前庭の聖なる炉床・火床 (Sacred Hearth & Fire)
  const hearthGroup = element("g", { class: "ce-temple-hearth" });
  const hxPos = hallEast + length * 0.16;
  const hearthR = Math.max(1.0, length * 0.07);

  // 石組みの炉縁
  hearthGroup.appendChild(
    element("circle", {
      cx: fmt(hxPos),
      cy: "0",
      r: fmt(hearthR),
      fill: PALETTE.megalith.stoneMid,
      stroke: PALETTE.megalith.stroke,
      "stroke-width": "0.45"
    })
  );
  // 炉底の灰
  hearthGroup.appendChild(
    element("circle", {
      cx: fmt(hxPos),
      cy: "0",
      r: fmt(hearthR * 0.7),
      fill: PALETTE.hearth.pit
    })
  );
  // 聖なる炎の輝き（外輪・オレンジ）
  hearthGroup.appendChild(
    element("circle", {
      cx: fmt(hxPos),
      cy: "0",
      r: fmt(hearthR * 0.45),
      fill: PALETTE.hearth.fireGlow,
      opacity: "0.85"
    })
  );
  // 炎の核（内輪・イエローゴールド）
  hearthGroup.appendChild(
    element("circle", {
      cx: fmt(hxPos),
      cy: "0",
      r: fmt(hearthR * 0.22),
      fill: PALETTE.hearth.flame
    })
  );

  root.appendChild(hearthGroup);
}

// ============================================================================
// 4. バシリカ式大聖堂 (Basilica Cathedral)
// 身廊、側廊、翼廊、交差部塔、半円後陣アプス、西塔・ポルティコを備えた大都市の大聖堂
// ============================================================================
function renderBasilica(root: SVGGElement, length: number, width: number, hx: number, hy: number): void {
  // 各種プロポーション
  const naveHy = hy * 0.4;
  const aisleHy = hy * 0.74;
  const transeptHy = hy * 0.98;

  // 西塔とポルティコ
  const tLen = length * 0.15;
  const towerWest = -hx;
  const towerEast = -hx + tLen;
  const towerNorthY1 = -hy * 0.92;
  const towerNorthY2 = -hy * 0.36;
  const towerSouthY1 = hy * 0.36;
  const towerSouthY2 = hy * 0.92;

  // 身廊・翼廊の境界
  const naveWest = towerEast;
  const transeptWest = hx * 0.1;
  const transeptEast = hx * 0.44;
  const transeptMidX = (transeptWest + transeptEast) / 2;

  // 内陣・アプス
  const choirEast = hx * 0.72;
  const apseRadius = naveHy;

  // 1. 地表へのドロップシャドウ (Ambient Shadow)
  const shadowOffset = Math.max(0.6, length * 0.018);
  const shadowGroup = element("g", {
    class: "ce-temple-shadow",
    transform: `translate(${fmt(shadowOffset)} ${fmt(shadowOffset * 1.2)})`,
    opacity: "0.32"
  });

  // 外郭形状パス
  const outlinePath = [
    // 西ポルティコ・西面
    `M ${fmt(towerWest - length * 0.02)} ${fmt(-naveHy * 0.7)}`,
    `L ${fmt(towerWest)} ${fmt(-naveHy * 0.7)}`,
    `L ${fmt(towerWest)} ${fmt(towerNorthY1)}`,
    // 北西塔
    `L ${fmt(towerEast)} ${fmt(towerNorthY1)}`,
    `L ${fmt(towerEast)} ${fmt(-aisleHy)}`,
    // 北側廊外壁
    `L ${fmt(transeptWest)} ${fmt(-aisleHy)}`,
    // 北翼廊
    `L ${fmt(transeptWest)} ${fmt(-transeptHy)}`,
    `L ${fmt(transeptEast)} ${fmt(-transeptHy)}`,
    `L ${fmt(transeptEast)} ${fmt(-aisleHy * 0.9)}`,
    // 北内陣・周歩廊
    `L ${fmt(choirEast)} ${fmt(-aisleHy * 0.9)}`,
    // 東アプス半円周
    `A ${fmt(aisleHy * 0.9)} ${fmt(aisleHy * 0.9)} 0 0 1 ${fmt(choirEast + aisleHy * 0.9)} 0`,
    `A ${fmt(aisleHy * 0.9)} ${fmt(aisleHy * 0.9)} 0 0 1 ${fmt(choirEast)} ${fmt(aisleHy * 0.9)}`,
    // 南内陣・周歩廊
    `L ${fmt(transeptEast)} ${fmt(aisleHy * 0.9)}`,
    // 南翼廊
    `L ${fmt(transeptEast)} ${fmt(transeptHy)}`,
    `L ${fmt(transeptWest)} ${fmt(transeptHy)}`,
    `L ${fmt(transeptWest)} ${fmt(aisleHy)}`,
    // 南側廊外壁
    `L ${fmt(towerEast)} ${fmt(aisleHy)}`,
    // 南西塔
    `L ${fmt(towerEast)} ${fmt(towerSouthY2)}`,
    `L ${fmt(towerWest)} ${fmt(towerSouthY2)}`,
    `L ${fmt(towerWest)} ${fmt(naveHy * 0.7)}`,
    `L ${fmt(towerWest - length * 0.02)} ${fmt(naveHy * 0.7)}`,
    "Z"
  ].join(" ");

  shadowGroup.appendChild(
    element("path", {
      d: outlinePath,
      fill: PALETTE.shadow
    })
  );
  root.appendChild(shadowGroup);

  // 2. 石造基礎・外郭 (Foundation Base)
  const baseGroup = element("g", { class: "ce-temple-base" });
  baseGroup.appendChild(
    element("path", {
      d: outlinePath,
      fill: PALETTE.stone.base,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.7",
      "stroke-linejoin": "round"
    })
  );
  root.appendChild(baseGroup);

  // 3. 控え壁 (Buttresses)
  const buttressesGroup = element("g", {
    class: "ce-temple-buttresses",
    fill: PALETTE.stone.buttress,
    stroke: PALETTE.stone.stroke,
    "stroke-width": "0.5"
  });

  const bSize = Math.max(0.7, length * 0.02);
  const bThick = Math.max(0.6, width * 0.025);

  // 側廊のバットレス（南北それぞれ3本）
  const aisleSpan = transeptWest - towerEast;
  for (let i = 1; i <= 3; i++) {
    const bx = towerEast + (aisleSpan * i) / 4;
    // 北側
    buttressesGroup.appendChild(
      element("rect", {
        x: fmt(bx - bSize / 2),
        y: fmt(-aisleHy - bThick),
        width: fmt(bSize),
        height: fmt(bThick)
      })
    );
    // 南側
    buttressesGroup.appendChild(
      element("rect", {
        x: fmt(bx - bSize / 2),
        y: fmt(aisleHy),
        width: fmt(bSize),
        height: fmt(bThick)
      })
    );
  }

  // 翼廊のバットレス（北端・南端）
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(transeptWest + (transeptEast - transeptWest) * 0.25 - bSize / 2),
      y: fmt(-transeptHy - bThick),
      width: fmt(bSize),
      height: fmt(bThick)
    })
  );
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(transeptWest + (transeptEast - transeptWest) * 0.75 - bSize / 2),
      y: fmt(-transeptHy - bThick),
      width: fmt(bSize),
      height: fmt(bThick)
    })
  );
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(transeptWest + (transeptEast - transeptWest) * 0.25 - bSize / 2),
      y: fmt(transeptHy),
      width: fmt(bSize),
      height: fmt(bThick)
    })
  );
  buttressesGroup.appendChild(
    element("rect", {
      x: fmt(transeptWest + (transeptEast - transeptWest) * 0.75 - bSize / 2),
      y: fmt(transeptHy),
      width: fmt(bSize),
      height: fmt(bThick)
    })
  );

  root.appendChild(buttressesGroup);

  // 4. 側廊の石材上面 (Aisles Stone Deck)
  const aislesGroup = element("g", { class: "ce-temple-aisles" });

  // 北側廊（石材灰色・光側）
  aislesGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(towerEast)},${fmt(-aisleHy)}`,
        `${fmt(transeptWest)},${fmt(-aisleHy)}`,
        `${fmt(transeptWest)},${fmt(-naveHy)}`,
        `${fmt(towerEast)},${fmt(-naveHy)}`
      ].join(" "),
      fill: PALETTE.stone.aisleNorth,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.5"
    })
  );

  // 南側廊（石材灰色・影側）
  aislesGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(towerEast)},${fmt(naveHy)}`,
        `${fmt(transeptWest)},${fmt(naveHy)}`,
        `${fmt(transeptWest)},${fmt(aisleHy)}`,
        `${fmt(towerEast)},${fmt(aisleHy)}`
      ].join(" "),
      fill: PALETTE.stone.aisleSouth,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.5"
    })
  );

  root.appendChild(aislesGroup);

  // 5. 翼廊の屋根 (Transept Roof - Terracotta)
  const transeptRoofGroup = element("g", { class: "ce-temple-transept" });

  // 北翼廊（西斜面：光、東斜面：陰）
  transeptRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(transeptWest)},${fmt(-naveHy)}`,
        `${fmt(transeptWest)},${fmt(-transeptHy)}`,
        `${fmt(transeptMidX)},${fmt(-transeptHy)}`,
        `${fmt(transeptMidX)},${fmt(-naveHy)}`
      ].join(" "),
      fill: PALETTE.roof.highlight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.45"
    })
  );
  transeptRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(transeptMidX)},${fmt(-naveHy)}`,
        `${fmt(transeptMidX)},${fmt(-transeptHy)}`,
        `${fmt(transeptEast)},${fmt(-transeptHy)}`,
        `${fmt(transeptEast)},${fmt(-naveHy)}`
      ].join(" "),
      fill: PALETTE.roof.midDark,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.45"
    })
  );

  // 南翼廊（西斜面：やや明、東斜面：陰）
  transeptRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(transeptWest)},${fmt(transeptHy)}`,
        `${fmt(transeptWest)},${fmt(naveHy)}`,
        `${fmt(transeptMidX)},${fmt(naveHy)}`,
        `${fmt(transeptMidX)},${fmt(transeptHy)}`
      ].join(" "),
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.45"
    })
  );
  transeptRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(transeptMidX)},${fmt(transeptHy)}`,
        `${fmt(transeptMidX)},${fmt(naveHy)}`,
        `${fmt(transeptEast)},${fmt(naveHy)}`,
        `${fmt(transeptEast)},${fmt(transeptHy)}`
      ].join(" "),
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.45"
    })
  );

  // 翼廊の棟線
  transeptRoofGroup.appendChild(
    element("line", {
      x1: fmt(transeptMidX),
      y1: fmt(-transeptHy),
      x2: fmt(transeptMidX),
      y2: fmt(-naveHy),
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.75",
      "stroke-linecap": "round"
    })
  );
  transeptRoofGroup.appendChild(
    element("line", {
      x1: fmt(transeptMidX),
      y1: fmt(naveHy),
      x2: fmt(transeptMidX),
      y2: fmt(transeptHy),
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.75",
      "stroke-linecap": "round"
    })
  );

  root.appendChild(transeptRoofGroup);

  // 6. 内陣・周歩廊・アプス (Choir & Apse)
  const choirApseGroup = element("g", { class: "ce-temple-apse" });

  // 周歩廊（Ambulatory）上面（石材灰色）
  const ambR = aisleHy * 0.9;
  choirApseGroup.appendChild(
    element("path", {
      d: [
        `M ${fmt(transeptEast)} ${fmt(-ambR)}`,
        `L ${fmt(choirEast)} ${fmt(-ambR)}`,
        `A ${fmt(ambR)} ${fmt(ambR)} 0 0 1 ${fmt(choirEast + ambR)} 0`,
        `A ${fmt(ambR)} ${fmt(ambR)} 0 0 1 ${fmt(choirEast)} ${fmt(ambR)}`,
        `L ${fmt(transeptEast)} ${fmt(ambR)}`,
        `L ${fmt(transeptEast)} ${fmt(naveHy)}`,
        `L ${fmt(choirEast)} ${fmt(naveHy)}`,
        `A ${fmt(naveHy)} ${fmt(naveHy)} 0 0 0 ${fmt(choirEast + naveHy)} 0`,
        `A ${fmt(naveHy)} ${fmt(naveHy)} 0 0 0 ${fmt(choirEast)} ${fmt(-naveHy)}`,
        `L ${fmt(transeptEast)} ${fmt(-naveHy)}`,
        "Z"
      ].join(" "),
      fill: PALETTE.stone.ambulatory,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.5"
    })
  );

  // 放射状小祭室（Radiating Chapels, 3基の丸いテラコッタ屋根）
  const chapelAngles = [-Math.PI / 4, 0, Math.PI / 4];
  const chapelR = ambR * 0.32;
  for (const angle of chapelAngles) {
    const cx = choirEast + ambR * Math.cos(angle);
    const cy = ambR * Math.sin(angle);
    choirApseGroup.appendChild(
      element("circle", {
        cx: fmt(cx),
        cy: fmt(cy),
        r: fmt(chapelR),
        fill: PALETTE.roof.midLight,
        stroke: PALETTE.stone.stroke,
        "stroke-width": "0.55"
      })
    );
    choirApseGroup.appendChild(
      element("circle", {
        cx: fmt(cx),
        cy: fmt(cy),
        r: fmt(chapelR * 0.45),
        fill: PALETTE.roof.highlight,
        stroke: PALETTE.roof.ridge,
        "stroke-width": "0.4"
      })
    );
  }

  // アプス主半円屋根（テラコッタ瓦の扇形面と放射リブ）
  const apseSteps = 6;
  for (let i = 0; i < apseSteps; i++) {
    const a1 = -Math.PI / 2 + (Math.PI * i) / apseSteps;
    const a2 = -Math.PI / 2 + (Math.PI * (i + 1)) / apseSteps;
    const p1x = choirEast + apseRadius * Math.cos(a1);
    const p1y = apseRadius * Math.sin(a1);
    const p2x = choirEast + apseRadius * Math.cos(a2);
    const p2y = apseRadius * Math.sin(a2);
    const shade =
      i < apseSteps / 2
        ? i === 0
          ? PALETTE.roof.highlight
          : PALETTE.roof.midLight
        : i === apseSteps - 1
          ? PALETTE.roof.deepShadow
          : PALETTE.roof.shadow;
    choirApseGroup.appendChild(
      element("polygon", {
        points: `${fmt(choirEast)},0 ${fmt(p1x)},${fmt(p1y)} ${fmt(p2x)},${fmt(p2y)}`,
        fill: shade,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );
    choirApseGroup.appendChild(
      element("line", {
        x1: fmt(choirEast),
        y1: "0",
        x2: fmt(p2x),
        y2: fmt(p2y),
        stroke: PALETTE.roof.ridge,
        "stroke-width": "0.5"
      })
    );
  }

  root.appendChild(choirApseGroup);

  // 7. 主身廊の屋根 (Main Nave & Choir Roof - Terracotta)
  const naveRoofGroup = element("g", { class: "ce-temple-nave" });

  // 身廊北側斜面（西端〜交差部手前、光側テラコッタ）
  naveRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(naveWest)},${fmt(-naveHy)}`,
        `${fmt(transeptWest)},${fmt(-naveHy)}`,
        `${fmt(transeptWest)},0`,
        `${fmt(naveWest)},0`
      ].join(" "),
      fill: PALETTE.roof.highlight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.5"
    })
  );

  // 身廊南側斜面（西端〜交差部手前、影側テラコッタ）
  naveRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(naveWest)},0`,
        `${fmt(transeptWest)},0`,
        `${fmt(transeptWest)},${fmt(naveHy)}`,
        `${fmt(naveWest)},${fmt(naveHy)}`
      ].join(" "),
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.5"
    })
  );

  // 内陣（Choir）北側斜面（交差部奥〜アプス、光側テラコッタ）
  naveRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(transeptEast)},${fmt(-naveHy)}`,
        `${fmt(choirEast)},${fmt(-naveHy)}`,
        `${fmt(choirEast)},0`,
        `${fmt(transeptEast)},0`
      ].join(" "),
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.5"
    })
  );

  // 内陣（Choir）南側斜面（交差部奥〜アプス、影側テラコッタ）
  naveRoofGroup.appendChild(
    element("polygon", {
      points: [
        `${fmt(transeptEast)},0`,
        `${fmt(choirEast)},0`,
        `${fmt(choirEast)},${fmt(naveHy)}`,
        `${fmt(transeptEast)},${fmt(naveHy)}`
      ].join(" "),
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.5"
    })
  );

  // 身廊の大棟線（Ridge lines）
  naveRoofGroup.appendChild(
    element("line", {
      x1: fmt(naveWest),
      y1: "0",
      x2: fmt(transeptWest),
      y2: "0",
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.9",
      "stroke-linecap": "round"
    })
  );
  naveRoofGroup.appendChild(
    element("line", {
      x1: fmt(transeptEast),
      y1: "0",
      x2: fmt(choirEast),
      y2: "0",
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.9",
      "stroke-linecap": "round"
    })
  );

  // 棟線の微細ハイライト
  naveRoofGroup.appendChild(
    element("line", {
      x1: fmt(naveWest),
      y1: fmt(-0.25),
      x2: fmt(transeptWest),
      y2: fmt(-0.25),
      stroke: PALETTE.roof.ridgeHighlight,
      "stroke-width": "0.4",
      opacity: "0.8"
    })
  );

  root.appendChild(naveRoofGroup);

  // 8. 交差部中央大塔 (Crossing Lantern Tower)
  const crossingGroup = element("g", { class: "ce-temple-crossing" });

  const cHalf = naveHy * 0.85;
  const cX1 = transeptMidX - cHalf;
  const cX2 = transeptMidX + cHalf;
  const cY1 = -cHalf;
  const cY2 = cHalf;

  // 塔基部スクエア（石材灰色）
  crossingGroup.appendChild(
    element("rect", {
      x: fmt(cX1),
      y: fmt(cY1),
      width: fmt(cHalf * 2),
      height: fmt(cHalf * 2),
      fill: PALETTE.stone.wall,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.6"
    })
  );

  // 塔の4面ピラミッド屋根
  // 北面（光）
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX1)},${fmt(cY1)} ${fmt(transeptMidX)},0 ${fmt(cX2)},${fmt(cY1)}`,
      fill: PALETTE.roof.highlight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 西面（やや明）
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX1)},${fmt(cY1)} ${fmt(transeptMidX)},0 ${fmt(cX1)},${fmt(cY2)}`,
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 南面（陰影）
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX1)},${fmt(cY2)} ${fmt(transeptMidX)},0 ${fmt(cX2)},${fmt(cY2)}`,
      fill: PALETTE.roof.deepShadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 東面（陰）
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX2)},${fmt(cY1)} ${fmt(transeptMidX)},0 ${fmt(cX2)},${fmt(cY2)}`,
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );

  // 4隅から頂点へ伸びる2本の対角線
  crossingGroup.appendChild(
    element("line", {
      class: "ce-temple-spire-diagonal",
      x1: fmt(cX1),
      y1: fmt(cY1),
      x2: fmt(cX2),
      y2: fmt(cY2),
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.65",
      "stroke-linecap": "round"
    })
  );
  crossingGroup.appendChild(
    element("line", {
      class: "ce-temple-spire-diagonal",
      x1: fmt(cX1),
      y1: fmt(cY2),
      x2: fmt(cX2),
      y2: fmt(cY1),
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.65",
      "stroke-linecap": "round"
    })
  );

  root.appendChild(crossingGroup);

  // 9. 西正面・双塔 (Westwork & Twin Towers)
  const westworkGroup = element("g", { class: "ce-temple-westwork" });

  // 西ポルティコ（大扉前庇）
  const porchW = length * 0.035;
  const pY1 = -naveHy * 0.65;
  const pY2 = naveHy * 0.65;
  westworkGroup.appendChild(
    element("polygon", {
      points: `${fmt(towerWest - porchW)},0 ${fmt(towerWest)},${fmt(pY1)} ${fmt(towerWest)},${fmt(pY2)}`,
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.5"
    })
  );
  westworkGroup.appendChild(
    element("line", {
      x1: fmt(towerWest - porchW),
      y1: "0",
      x2: fmt(towerWest),
      y2: "0",
      stroke: PALETTE.roof.ridge,
      "stroke-width": "0.65"
    })
  );

  // 大扉入口窪み
  westworkGroup.appendChild(
    element("rect", {
      x: fmt(towerWest - 0.2),
      y: fmt(-naveHy * 0.35),
      width: "0.5",
      height: fmt(naveHy * 0.7),
      fill: PALETTE.stone.portal
    })
  );

  // 塔を描画するヘルパー
  function renderTower(y1: number, y2: number, isNorth: boolean): void {
    const midX = (towerWest + towerEast) / 2;
    const midY = (y1 + y2) / 2;

    westworkGroup.appendChild(
      element("rect", {
        x: fmt(towerWest),
        y: fmt(y1),
        width: fmt(tLen),
        height: fmt(y2 - y1),
        fill: PALETTE.stone.wall,
        stroke: PALETTE.stone.stroke,
        "stroke-width": "0.6"
      })
    );

    const cornerSize = Math.max(0.6, length * 0.016);
    westworkGroup.appendChild(
      element("rect", {
        x: fmt(towerWest - cornerSize * 0.3),
        y: fmt(isNorth ? y1 - cornerSize * 0.3 : y2 - cornerSize * 0.7),
        width: fmt(cornerSize),
        height: fmt(cornerSize),
        fill: PALETTE.stone.buttress,
        stroke: PALETTE.stone.stroke,
        "stroke-width": "0.4"
      })
    );
    westworkGroup.appendChild(
      element("rect", {
        x: fmt(towerEast - cornerSize * 0.7),
        y: fmt(isNorth ? y1 - cornerSize * 0.3 : y2 - cornerSize * 0.7),
        width: fmt(cornerSize),
        height: fmt(cornerSize),
        fill: PALETTE.stone.buttress,
        stroke: PALETTE.stone.stroke,
        "stroke-width": "0.4"
      })
    );

    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerWest)},${fmt(y1)} ${fmt(midX)},${fmt(midY)} ${fmt(towerEast)},${fmt(y1)}`,
        fill: PALETTE.roof.highlight,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );
    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerWest)},${fmt(y1)} ${fmt(midX)},${fmt(midY)} ${fmt(towerWest)},${fmt(y2)}`,
        fill: PALETTE.roof.midLight,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );
    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerEast)},${fmt(y1)} ${fmt(midX)},${fmt(midY)} ${fmt(towerEast)},${fmt(y2)}`,
        fill: PALETTE.roof.midDark,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );
    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerWest)},${fmt(y2)} ${fmt(midX)},${fmt(midY)} ${fmt(towerEast)},${fmt(y2)}`,
        fill: PALETTE.roof.shadow,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );

    westworkGroup.appendChild(
      element("line", {
        class: "ce-temple-spire-diagonal",
        x1: fmt(towerWest),
        y1: fmt(y1),
        x2: fmt(towerEast),
        y2: fmt(y2),
        stroke: PALETTE.roof.ridge,
        "stroke-width": "0.6",
        "stroke-linecap": "round"
      })
    );
    westworkGroup.appendChild(
      element("line", {
        class: "ce-temple-spire-diagonal",
        x1: fmt(towerWest),
        y1: fmt(y2),
        x2: fmt(towerEast),
        y2: fmt(y1),
        stroke: PALETTE.roof.ridge,
        "stroke-width": "0.6",
        "stroke-linecap": "round"
      })
    );
  }

  // 北西塔
  renderTower(towerNorthY1, towerNorthY2, true);
  // 南西塔
  renderTower(towerSouthY1, towerSouthY2, false);

  root.appendChild(westworkGroup);
}
