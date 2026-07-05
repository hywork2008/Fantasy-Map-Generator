import type { ExtensionStyleConfig, ExtensionStyleProps } from "../../store/extensionState";
import { useStyleState } from "../../store/styleState";
import { getApi } from "./economyContext";

export function EconomyStyleBody({ visibility }: ExtensionStyleProps) {
  const showCircle = useStyleState(state => state.values.styleGoodsCircle === "1");

  const handleChange = (checked: boolean) => {
    useStyleState.getState().updateValue("styleGoodsCircle", checked ? "1" : "");
    const goodsGroup = getApi().getSvgLayer("goods");
    if (goodsGroup) {
      goodsGroup.selectAll("circle").attr("display", checked ? "block" : "none");
    }
  };

  return (
    <tbody id="styleGoods" style={{ display: visibility.styleGoods ? "block" : "none" }}>
      <tr data-tip="Show or hide circle around good icons">
        <td colSpan={2}>
          <input
            id="styleGoodsCircle"
            className="checkbox"
            type="checkbox"
            checked={showCircle}
            onChange={e => handleChange(e.target.checked)}
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
      const firstCircle = el.select("circle");
      if (firstCircle.size()) {
        sliderValues.styleGoodsCircle = firstCircle.attr("display") !== "none" ? "1" : "";
      }

      visibility.styleFill = true;
      visibility.styleStroke = true;
      visibility.styleStrokeWidth = true;
      visibility.styleStrokeDash = true;

      sliderValues.styleFillInput = el.attr("fill") ?? "#ffffff";
      sliderValues.styleStrokeInput = el.attr("stroke") ?? "#3e3e4b";
      sliderValues.styleStrokeWidthInput = String(el.attr("stroke-width") ?? 0.24);
      sliderValues.styleStrokeDasharrayInput = el.attr("stroke-dasharray") ?? "";
      sliderValues.styleStrokeLinecapInput = el.attr("stroke-linecap") ?? "inherit";
    }
  }
};
