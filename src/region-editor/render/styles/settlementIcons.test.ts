import { describe, expect, it } from "vitest";
import { normalizeSettlementType, renderSettlementIcon } from "./settlementIcons";
import { THEMES } from "./themes";

describe("settlementIcons (Burg Types & SVG Icons)", () => {
  const theme = THEMES.schley;

  describe("normalizeSettlementType", () => {
    it("burgs-generator.ts の全デフォルトグループを正確に正規化する", () => {
      expect(normalizeSettlementType("capital")).toBe("capital");
      expect(normalizeSettlementType("city")).toBe("city");
      expect(normalizeSettlementType("town")).toBe("town");
      expect(normalizeSettlementType("village")).toBe("village");
      expect(normalizeSettlementType("hamlet")).toBe("hamlet");
      expect(normalizeSettlementType("fort")).toBe("fort");
      expect(normalizeSettlementType("monastery")).toBe("monastery");
      expect(normalizeSettlementType("caravanserai")).toBe("caravanserai");
      expect(normalizeSettlementType("trading_post")).toBe("trading_post");
    });

    it("エイリアスや大文字小文字を許容して正しく解決する", () => {
      expect(normalizeSettlementType("Metropolis")).toBe("capital");
      expect(normalizeSettlementType("Castle")).toBe("fort");
      expect(normalizeSettlementType("Temple")).toBe("monastery");
      expect(normalizeSettlementType("tradingpost")).toBe("trading_post");
      expect(normalizeSettlementType(undefined)).toBe("town");
    });

    it("isCapital が true の場合は常に capital を優先する", () => {
      expect(normalizeSettlementType("town", true)).toBe("capital");
      expect(normalizeSettlementType("village", true)).toBe("capital");
    });
  });

  describe("renderSettlementIcon", () => {
    it("各都市種別に応じた精巧なSVGアイコンを生成し、赤い丸（単なる円）ではないこと", () => {
      const types = [
        "capital",
        "city",
        "town",
        "village",
        "hamlet",
        "fort",
        "monastery",
        "caravanserai",
        "trading_post"
      ] as const;

      for (const t of types) {
        const svg = renderSettlementIcon(t, { theme });
        expect(svg).toContain(`settlement-icon--${t}`);
        // 単純な赤丸ではないことを確認
        expect(svg).not.toContain('<circle cx="0" cy="0" r="4"');
        // 多角形や矩形などの建築ディテールが存在すること
        expect(svg).toMatch(/<(rect|polygon|path)/);
      }
    });

    it("首都アイコン（capital）に主キープ、塔、旗印が含まれること", () => {
      const svg = renderSettlementIcon("capital", { theme, isCapital: true });
      expect(svg).toContain("settlement-icon--capital");
      expect(svg).toContain(theme.settlementFill);
      expect(svg).toContain(theme.settlementStroke);
    });

    it("砦アイコン（fort）に銃眼胸壁や石造キープが含まれること", () => {
      const svg = renderSettlementIcon("fort", { theme });
      expect(svg).toContain("settlement-icon--fort");
      expect(svg).toContain("polygon");
    });

    it("修道院アイコン（monastery）に十字架・聖なるシンボルが含まれること", () => {
      const svg = renderSettlementIcon("monastery", { theme });
      expect(svg).toContain("settlement-icon--monastery");
    });

    it("港フラグ（hasPort: true）がある場合、錨シンボルが付加されること", () => {
      const svgWithPort = renderSettlementIcon("city", { theme, hasPort: true });
      expect(svgWithPort).toContain("settlement-port-anchor");

      const svgWithoutPort = renderSettlementIcon("city", { theme, hasPort: false });
      expect(svgWithoutPort).not.toContain("settlement-port-anchor");
    });
  });
});
