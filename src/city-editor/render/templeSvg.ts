import type { Point } from "../core/types";

export interface RenderTempleOptions {
  point: Point;
  length: number;
  width: number;
  rotation?: number;
  id?: string;
  className?: string;
  isPickSelected?: boolean;
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
 * ヨーロッパの歴史的建築素材に基づくカラーパレット
 * - 屋根: 伝統的な焼成赤粘土瓦（Terracotta clay tiles）
 * - 構造・壁面: 切石・ライムストーン（Ashlar & Limestone gray）
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
  shadow: "#181e22" // 地表ドロップシャドウ
};

/**
 * 中世バシリカ式建築（身廊、側廊、翼廊、交差部塔、半円後陣アプス、西塔・ポルティコ）の
 * トップダウン（見下ろし）SVG要素を構築する。
 * - 屋根: ヨーロッパ伝統のテラコッタ瓦（オレンジ・赤褐色）
 * - 屋根以外（側廊・周歩廊・基礎・壁・控え壁）: 石材の灰色
 * - 塔の頂点: 黄色い丸を排し、4隅からの対角線が頂点で交差
 */
export function renderTempleSvg(options: RenderTempleOptions): SVGGElement {
  const length = Math.max(10, options.length);
  const width = Math.max(6, options.width);
  const hx = length / 2;
  const hy = width / 2;

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

  const posX = options.point[0];
  const posY = -options.point[1];
  const deg = (-(options.rotation ?? 0) * 180) / Math.PI;

  const root = element("g", {
    class: `ce-temple ce-temple--basilica ${options.className ?? ""}`.trim(),
    transform: `translate(${posX} ${posY}) rotate(${deg})`,
    width: String(length),
    height: String(width),
    ...(options.id ? { "data-element": options.id, id: options.id } : {})
  }) as SVGGElement;

  // ==========================================
  // 1. 地表へのドロップシャドウ (Ambient Shadow)
  // ==========================================
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

  // ==========================================
  // 2. 石造基礎・外郭 (Foundation Base)
  // ==========================================
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

  // ==========================================
  // 3. 控え壁 (Buttresses)
  // ==========================================
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

  // ==========================================
  // 4. 側廊の石材上面 (Aisles Stone Deck)
  // 屋根以外の石材部分（灰色）
  // ==========================================
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

  // ==========================================
  // 5. 翼廊の屋根 (Transept Roof - Terracotta)
  // ==========================================
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

  // ==========================================
  // 6. 内陣・周歩廊・アプス (Choir & Apse)
  // 周歩廊は石材（灰色）、アプスと小祭室はテラコッタ（オレンジ）
  // ==========================================
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
    // 外周円（テラコッタ屋根）
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
    // 内周円（屋根の段差リング）
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
    // 北側は明るいテラコッタ、南側は陰影テラコッタ
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
    // 放射リブ
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

  // ==========================================
  // 7. 主身廊の屋根 (Main Nave & Choir Roof - Terracotta)
  // ==========================================
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

  // ==========================================
  // 8. 交差部中央大塔 (Crossing Lantern Tower)
  // ピラミッド屋根の対角線が中央で交差（黄色い丸は配置しない）
  // ==========================================
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

  // 塔の4面ピラミッド屋根（テラコッタ4分割）
  // 北面（光）
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX1)},${fmt(cY1)} ${fmt(cX2)},${fmt(cY1)} ${fmt(transeptMidX)},0`,
      fill: PALETTE.roof.highlight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 西面
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX1)},${fmt(cY1)} ${fmt(transeptMidX)},0 ${fmt(cX1)},${fmt(cY2)}`,
      fill: PALETTE.roof.midLight,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 東面
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX2)},${fmt(cY1)} ${fmt(cX2)},${fmt(cY2)} ${fmt(transeptMidX)},0`,
      fill: PALETTE.roof.midDark,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );
  // 南面（影）
  crossingGroup.appendChild(
    element("polygon", {
      points: `${fmt(cX1)},${fmt(cY2)} ${fmt(transeptMidX)},0 ${fmt(cX2)},${fmt(cY2)}`,
      fill: PALETTE.roof.shadow,
      stroke: PALETTE.roof.stroke,
      "stroke-width": "0.4"
    })
  );

  // 4隅から頂点へ伸びる2本の対角線（中央で交差する稜線）
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

  // ==========================================
  // 9. 西正面ファサード＆双塔 (West Towers & Portal)
  // ピラミッド屋根の対角線が頂点で交差（黄色い丸は配置しない）
  // ==========================================
  const westworkGroup = element("g", { class: "ce-temple-westwork" });

  // 正面ポルティコ（石材灰色のエントランス・大階段）
  const portalW = length * 0.05;
  const portalH = naveHy * 1.2;
  westworkGroup.appendChild(
    element("rect", {
      x: fmt(towerWest - portalW),
      y: fmt(-portalH / 2),
      width: fmt(portalW),
      height: fmt(portalH),
      fill: PALETTE.stone.wall,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.5"
    })
  );
  // 入口ポルティコの扉口窪み
  westworkGroup.appendChild(
    element("rect", {
      x: fmt(towerWest - portalW * 0.6),
      y: fmt(-portalH * 0.35),
      width: fmt(portalW * 0.6),
      height: fmt(portalH * 0.7),
      fill: PALETTE.stone.portal
    })
  );

  // 西正面中央スペース（双塔の間のテラス・石材灰色）
  westworkGroup.appendChild(
    element("rect", {
      x: fmt(towerWest),
      y: fmt(towerNorthY2),
      width: fmt(towerEast - towerWest),
      height: fmt(towerSouthY1 - towerNorthY2),
      fill: PALETTE.stone.wall,
      stroke: PALETTE.stone.stroke,
      "stroke-width": "0.5"
    })
  );

  // 双塔のレンダリング関数
  function renderTower(y1: number, y2: number, isNorth: boolean) {
    const tW = towerEast - towerWest;
    const tH = y2 - y1;
    const midX = (towerWest + towerEast) / 2;
    const midY = (y1 + y2) / 2;

    // 塔基部（石材灰色）
    westworkGroup.appendChild(
      element("rect", {
        x: fmt(towerWest),
        y: fmt(y1),
        width: fmt(tW),
        height: fmt(tH),
        fill: PALETTE.stone.wall,
        stroke: PALETTE.stone.stroke,
        "stroke-width": "0.6"
      })
    );

    // 塔角の小バットレス突起（石材）
    const cornerW = tW * 0.22;
    const cornerH = tH * 0.22;
    westworkGroup.appendChild(
      element("rect", {
        x: fmt(towerWest - cornerW * 0.5),
        y: fmt(isNorth ? y1 - cornerH * 0.5 : y2 - cornerH * 0.5),
        width: fmt(cornerW),
        height: fmt(cornerH),
        fill: PALETTE.stone.buttress,
        stroke: PALETTE.stone.stroke,
        "stroke-width": "0.4"
      })
    );

    // 塔屋根ピラミッド（テラコッタ4面分割）
    // 北面
    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerWest)},${fmt(y1)} ${fmt(towerEast)},${fmt(y1)} ${fmt(midX)},${fmt(midY)}`,
        fill: PALETTE.roof.highlight,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );
    // 西面
    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerWest)},${fmt(y1)} ${fmt(midX)},${fmt(midY)} ${fmt(towerWest)},${fmt(y2)}`,
        fill: PALETTE.roof.midLight,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );
    // 東面
    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerEast)},${fmt(y1)} ${fmt(towerEast)},${fmt(y2)} ${fmt(midX)},${fmt(midY)}`,
        fill: PALETTE.roof.midDark,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );
    // 南面
    westworkGroup.appendChild(
      element("polygon", {
        points: `${fmt(towerWest)},${fmt(y2)} ${fmt(midX)},${fmt(midY)} ${fmt(towerEast)},${fmt(y2)}`,
        fill: PALETTE.roof.shadow,
        stroke: PALETTE.roof.stroke,
        "stroke-width": "0.4"
      })
    );

    // 4隅から頂点へ伸びる2本の対角線（中央で交差する稜線・丸はなし）
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

  return root;
}
