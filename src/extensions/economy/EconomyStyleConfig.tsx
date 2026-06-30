import type { ExtensionStyleConfig, ExtensionStyleProps } from "../../store/extensionState";
import { getApi } from "./economyContext";

export function EconomyStyleBody({ visibility }: ExtensionStyleProps) {
  return (
    <tbody id="styleGoods" style={{ display: visibility.styleGoods ? "block" : "none" }}>
      <tr data-tip="Show or hide circle around good icons">
        <td colSpan={2}>
          <input
            id="styleGoodsCircle"
            className="checkbox"
            type="checkbox"
            onChange={e => {
              const checked = e.target.checked;
              const goodsGroup = getApi().getSvgLayer("goods");
              if (goodsGroup) {
                goodsGroup.selectAll("circle").attr("display", checked ? "block" : "none");
              }
            }}
          />
          <label htmlFor="styleGoodsCircle" className="checkbox-label">
            Show circle
          </label>
        </td>
      </tr>
    </tbody>
  );
}

export const economyStyleConfig: ExtensionStyleConfig = {
  id: "economyStyle",
  extensionId: "economy",
  elements: [
    { value: "goodsCells", label: "Goods: production" },
    { value: "goodsIcons", label: "Goods: resources" },
    { value: "goodsBurgs", label: "Goods: burg plates" },
    { value: "tradeAnimation", label: "Trade Animation" }
  ],
  component: EconomyStyleBody,
  onSelect: (elementId, sliderValues, visibility, el) => {
    if (elementId === "tradeAnimation") {
      visibility.styleOpacity = true;
      sliderValues.styleOpacityInput = String(el.attr("opacity") ?? 1);
    }
    if (["goodsCells", "goodsIcons", "goodsBurgs"].includes(elementId)) {
      visibility.styleGoods = true;
      const showCircle = document.getElementById("styleGoodsCircle") as HTMLInputElement;
      const firstCircle = el.select("circle");
      if (showCircle && firstCircle.size()) {
        showCircle.checked = firstCircle.attr("display") !== "none";
      }

      visibility.styleFill = true;
      visibility.styleStroke = true;
      visibility.styleStrokeWidth = true;
      visibility.styleStrokeDash = true;

      const fill = el.attr("fill") ?? "#ffffff";
      const stroke = el.attr("stroke") ?? "#3e3e4b";
      const fillInput = document.getElementById("styleFillInput") as HTMLInputElement;
      const fillOutput = document.getElementById("styleFillOutput") as HTMLInputElement;
      const strokeInput = document.getElementById("styleStrokeInput") as HTMLInputElement;
      const strokeOutput = document.getElementById("styleStrokeOutput") as HTMLInputElement;

      if (fillInput) fillInput.value = fill;
      if (fillOutput) fillOutput.value = fill;
      if (strokeInput) strokeInput.value = stroke;
      if (strokeOutput) strokeOutput.value = stroke;

      sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);

      const dashInput = document.getElementById("styleStrokeDasharrayInput") as HTMLInputElement;
      const linecapInput = document.getElementById("styleStrokeLinecapInput") as HTMLInputElement;
      if (dashInput) dashInput.value = el.attr("stroke-dasharray") ?? "";
      if (linecapInput) linecapInput.value = el.attr("stroke-linecap") ?? "inherit";
    }
  }
};
