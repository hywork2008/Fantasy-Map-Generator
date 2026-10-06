import type { SettlementType } from "../../core/types";
import type { ThemeColors } from "./themes";

/**
 * FMG の burgs-generator.ts (getDefaultGroups) に準拠した都市種類別 SVG アイコン
 * 原点はシンボルの底面中心 (0, 0)
 */

export interface SettlementIconOptions {
  theme: ThemeColors;
  isCapital?: boolean;
  hasPort?: boolean;
  hasWalls?: boolean;
  hasCitadel?: boolean;
}

/**
 * 都市種類名（および既存・FMGグループ名）を標準の SettlementType に正規化
 */
export function normalizeSettlementType(typeOrGroup: string | undefined, isCapital?: boolean): SettlementType {
  if (isCapital) return "capital";
  if (!typeOrGroup) return "town";

  const lower = typeOrGroup.toLowerCase().trim();
  switch (lower) {
    case "capital":
    case "metropolis":
      return "capital";
    case "city":
      return "city";
    case "town":
      return "town";
    case "village":
      return "village";
    case "hamlet":
      return "hamlet";
    case "fort":
    case "castle":
      return "fort";
    case "monastery":
    case "temple":
      return "monastery";
    case "caravanserai":
      return "caravanserai";
    case "trading_post":
    case "tradingpost":
    case "post":
      return "trading_post";
    case "port":
      return "town";
    default:
      return "town";
  }
}

/**
 * 都市の種類に応じた精緻なファンタジー地図風 SVG アイコンを生成
 */
export function renderSettlementIcon(
  rawType: SettlementType | string | undefined,
  options: SettlementIconOptions
): string {
  const type = normalizeSettlementType(rawType, options.isCapital);
  const { theme, hasPort } = options;

  const fill = theme.settlementFill;
  const stroke = theme.settlementStroke;
  const wallFill = theme.mountainHighlight || "#f7f5f0";

  let bodySvg = "";

  switch (type) {
    case "capital":
      // 1. 首都 (Capital / Metropolis): 二重塔、中央主キープ、翻る旗、アーチ門
      bodySvg = `
        <!-- 城壁ベース -->
        <rect x="-13" y="-12" width="26" height="12" fill="${wallFill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" />
        <!-- 左右の防壁塔 -->
        <rect x="-14" y="-18" width="6.5" height="18" fill="${wallFill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" />
        <polygon points="-15.5,-18 -10.75,-24 -6,-18" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <rect x="7.5" y="-18" width="6.5" height="18" fill="${wallFill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" />
        <polygon points="6,-18 10.75,-24 15.5,-18" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 中央の大キープ（主塔） -->
        <rect x="-5" y="-23" width="10" height="23" fill="${wallFill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round" />
        <polygon points="-6.5,-23 0,-30 6.5,-23" fill="${fill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" />
        <!-- 翻る旗印 -->
        <path d="M 0,-30 L 0,-35 L 7,-32.5 L 0,-30.5" fill="${fill}" stroke="${stroke}" stroke-width="0.8" />
        <!-- 城門アーチ -->
        <path d="M -3,0 L -3,-5.5 A 3 3 0 0 1 3,-5.5 L 3,0 Z" fill="${stroke}" />
        <!-- 銃眼・窓 -->
        <rect x="-2" y="-18" width="4" height="4.5" rx="1" fill="${stroke}" />
        <line x1="-10.75" y1="-14" x2="-10.75" y2="-10" stroke="${stroke}" stroke-width="1" />
        <line x1="10.75" y1="-14" x2="10.75" y2="-10" stroke="${stroke}" stroke-width="1" />
      `;
      break;

    case "city":
      // 2. 大都市 (City): 堅牢な市壁、左の時計塔/鐘楼、密集した切妻屋根
      bodySvg = `
        <!-- 市壁 -->
        <rect x="-11" y="-9" width="22" height="9" fill="${wallFill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 城壁の凸凹（銃眼） -->
        <line x1="-11" y1="-9" x2="-11" y2="-11.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <line x1="-5" y1="-9" x2="-5" y2="-11.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <line x1="5" y1="-9" x2="5" y2="-11.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <line x1="11" y1="-9" x2="11" y2="-11.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <!-- 左の鐘楼・時計塔 -->
        <rect x="-9.5" y="-20" width="6.5" height="20" fill="${wallFill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <polygon points="-11,-20 -6.25,-26.5 -1.5,-20" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 家屋群の屋根 -->
        <polygon points="-3,-9 1,-16 5,-9" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <polygon points="3,-9 7.5,-14.5 11.5,-9" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 市門アーチ -->
        <path d="M -2,0 L -2,-4.5 A 2 2 0 0 1 2,-4.5 L 2,0 Z" fill="${stroke}" />
        <rect x="-7.5" y="-16" width="2.5" height="3.5" rx="0.5" fill="${stroke}" />
      `;
      break;

    case "town":
      // 3. 町 (Town): 2連の三角屋根、中央の小さな望楼、煙突
      bodySvg = `
        <!-- 建物1（左） -->
        <rect x="-8.5" y="-7.5" width="8" height="7.5" fill="${wallFill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <polygon points="-9.5,-7.5 -4.5,-13 0.5,-7.5" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 建物2（右） -->
        <rect x="0.5" y="-8.5" width="8" height="8.5" fill="${wallFill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <polygon points="-0.5,-8.5 4.5,-14.5 9.5,-8.5" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 中央の望楼 -->
        <rect x="-2.5" y="-16" width="5" height="8.5" fill="${wallFill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
        <polygon points="-3.5,-16 0,-20 3.5,-16" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
        <!-- 入口扉 -->
        <rect x="-5.5" y="-4" width="2" height="4" fill="${stroke}" />
        <rect x="3.5" y="-4" width="2" height="4" fill="${stroke}" />
      `;
      break;

    case "village":
      // 4. 村 (Village): のどかな2軒の切妻屋根民家と煙突
      bodySvg = `
        <rect x="-7" y="-6" width="6.5" height="6" fill="${wallFill}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round" />
        <polygon points="-8,-6 -3.75,-11 0.5,-6" fill="${fill}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round" />
        <rect x="0.5" y="-7" width="7" height="7" fill="${wallFill}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round" />
        <polygon points="-0.5,-7 4,-12 8.5,-7" fill="${fill}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round" />
        <!-- 煙突と煙 -->
        <line x1="5.5" y1="-12" x2="5.5" y2="-14.5" stroke="${stroke}" stroke-width="1" stroke-linecap="round" />
        <path d="M 5.5,-14.5 Q 7.5,-16.5 6,-18.5" fill="none" stroke="${stroke}" stroke-width="0.8" opacity="0.6" />
        <rect x="2.5" y="-3.5" width="2" height="3.5" fill="${stroke}" />
      `;
      break;

    case "hamlet":
      // 5. 集落・小村 (Hamlet): 1軒の素朴な小屋＋小納屋
      bodySvg = `
        <rect x="-4" y="-5.5" width="6.5" height="5.5" fill="${wallFill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
        <polygon points="-5,-5.5 -0.75,-10.5 3.5,-5.5" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
        <rect x="3.5" y="-4" width="4" height="4" fill="${wallFill}" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round" />
        <polygon points="3,-4 5.5,-6.5 8,-4" fill="${fill}" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round" />
        <rect x="-1.5" y="-3" width="1.5" height="3" fill="${stroke}" />
      `;
      break;

    case "fort":
      // 6. 砦・城塞 (Fort / Castle): 重厚な石造キープ、銃眼付き胸壁、矢狭間、落とし格子
      bodySvg = `
        <rect x="-9" y="-15" width="18" height="15" fill="${wallFill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" />
        <!-- 銃眼胸壁（バートルマン） -->
        <polygon points="-9.5,-15 -9.5,-19 -5.5,-19 -5.5,-16 -2,-16 -2,-19 2,-19 2,-16 5.5,-16 5.5,-19 9.5,-19 9.5,-15" fill="${fill}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round" />
        <!-- 矢狭間スリット -->
        <line x1="-4" y1="-11" x2="-4" y2="-6.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <line x1="4" y1="-11" x2="4" y2="-6.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <!-- 格子門（ポートカリス） -->
        <rect x="-3" y="-6" width="6" height="6" fill="${stroke}" />
        <line x1="0" y1="-6" x2="0" y2="0" stroke="${wallFill}" stroke-width="0.8" />
        <line x1="-3" y1="-3" x2="3" y2="-3" stroke="${wallFill}" stroke-width="0.8" />
      `;
      break;

    case "monastery":
      // 7. 修道院・寺院 (Monastery): 聖堂ファサード、十字架、バラ窓、アーチ扉
      bodySvg = `
        <polygon points="-7.5,0 -7.5,-9.5 0,-16.5 7.5,-9.5 7.5,0" fill="${wallFill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" />
        <!-- 十字架 -->
        <line x1="0" y1="-16.5" x2="0" y2="-23.5" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" />
        <line x1="-2.5" y1="-20.5" x2="2.5" y2="-20.5" stroke="${stroke}" stroke-width="1.4" stroke-linecap="round" />
        <!-- バラ窓（丸窓） -->
        <circle cx="0" cy="-9.5" r="2.5" fill="${fill}" stroke="${stroke}" stroke-width="0.9" />
        <!-- アーチ扉 -->
        <path d="M -2.5,0 L -2.5,-4.5 A 2.5 2.5 0 0 1 2.5,-4.5 L 2.5,0 Z" fill="${stroke}" />
        <!-- 側廊 -->
        <rect x="-11.5" y="-6" width="4" height="6" fill="${wallFill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
        <polygon points="-12,-6 -9.5,-8.5 -7,-6" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
      `;
      break;

    case "caravanserai":
      // 8. 隊商宿 (Caravanserai): 方形囲壁、四隅小塔、馬蹄形アーチ大門、中央ドーム
      bodySvg = `
        <!-- 方形囲壁 -->
        <rect x="-10.5" y="-9" width="21" height="9" fill="${wallFill}" stroke="${stroke}" stroke-width="1.3" stroke-linejoin="round" />
        <!-- 四隅の丸塔 -->
        <rect x="-12.5" y="-12" width="4" height="12" rx="1" fill="${wallFill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
        <rect x="8.5" y="-12" width="4" height="12" rx="1" fill="${wallFill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />
        <!-- 中央大門ポータル -->
        <rect x="-4.5" y="-14" width="9" height="14" fill="${wallFill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- ドーム（クーポラ） -->
        <path d="M -4,-14 C -4,-18.5 0,-20.5 0,-20.5 C 0,-20.5 4,-18.5 4,-14 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round" />
        <!-- 馬蹄形アーチ扉 -->
        <path d="M -2,0 L -2,-4 C -2,-5.5 2,-5.5 2,-4 L 2,0 Z" fill="${stroke}" />
      `;
      break;

    case "trading_post":
      // 9. 交易拠点 (Trading Post): 木骨造り倉庫、荷揚げ滑車梁・木箱、大扉
      bodySvg = `
        <!-- 倉庫本体 -->
        <rect x="-8.5" y="-9" width="17" height="9" fill="${wallFill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 切妻屋根 -->
        <polygon points="-10,-9 0,-16 10,-9" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <!-- 荷揚げ梁と滑車・荷物箱 -->
        <line x1="0" y1="-16" x2="0" y2="-18.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <line x1="0" y1="-18.5" x2="3.5" y2="-18.5" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <line x1="3.5" y1="-18.5" x2="3.5" y2="-14" stroke="${stroke}" stroke-width="0.8" />
        <rect x="2" y="-14" width="3" height="3" fill="${fill}" stroke="${stroke}" stroke-width="0.7" />
        <!-- 木骨筋交い（クロスビーム） -->
        <line x1="-7" y1="-9" x2="-2" y2="0" stroke="${stroke}" stroke-width="0.7" opacity="0.5" />
        <line x1="-2" y1="-9" x2="-7" y2="0" stroke="${stroke}" stroke-width="0.7" opacity="0.5" />
        <!-- 入口大扉 -->
        <rect x="-1" y="-5.5" width="4" height="5.5" fill="${stroke}" />
      `;
      break;
  }

  // 港（hasPort）の場合、右下にエレガントな錨（Anchor）シンボルを付加
  let portSvg = "";
  if (hasPort) {
    portSvg = `
      <g class="settlement-port-anchor" transform="translate(10, -4)">
        <circle cx="0" cy="-6" r="1.5" fill="none" stroke="${stroke}" stroke-width="0.9" />
        <line x1="0" y1="-4.5" x2="0" y2="3" stroke="${stroke}" stroke-width="1.1" stroke-linecap="round" />
        <line x1="-3" y1="-2" x2="3" y2="-2" stroke="${stroke}" stroke-width="1" stroke-linecap="round" />
        <path d="M -4,0.5 C -3,3.5 3,3.5 4,0.5" fill="none" stroke="${stroke}" stroke-width="1.1" stroke-linecap="round" />
      </g>
    `;
  }

  return `
    <g class="settlement-icon-body settlement-icon--${type}">
      ${bodySvg}
      ${portSvg}
    </g>
  `;
}
