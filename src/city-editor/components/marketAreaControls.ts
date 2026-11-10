import { planAxes } from "../../buildings/placementContract";
import { placementCatalog, placementFootprint } from "../../buildings/placementModels";
import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import {
  type DesignatedMarket,
  MARKET_HALL_IDS,
  marketRectangle,
  placeDesignatedMarket,
  setMarketActivity
} from "../generators/designatedMarket";
import { polygonCentroid } from "../generators/geom";
import { element, polygon } from "../renderers/svgPrimitives";
import type { CityDocument, Point } from "../types/document";
import type { SvgPickInfo } from "../types/selection";

export function buildMarketAreaControls(ctx: {
  getDocument(): CityDocument;
  selected(): SvgPickInfo | null;
  commit(document: CityDocument, label: string): void;
  notice(message: string): void;
  map: HTMLElement;
}) {
  const root = document.createElement("details");
  root.className = "ce-market-controls";
  const summary = document.createElement("summary");
  summary.textContent = editorText("cityEditor.messages.marketAreas");
  root.append(summary);
  const label = (key: string, control: HTMLElement) => {
    const row = document.createElement("label");
    const title = editorText(`cityEditor.messages.${key}` as EditorMessageKey);
    control.setAttribute("aria-label", title);
    row.append(title, control);
    root.append(row);
    return row;
  };
  const button = (key: string, action: () => void) => {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = editorText(`cityEditor.messages.${key}` as EditorMessageKey);
    control.addEventListener("click", action);
    root.append(control);
    return control;
  };
  const setting = document.createElement("select");
  for (const value of ["street", "hall-front", "freeform"] as const)
    setting.add(new Option(editorText(`cityEditor.messages.marketSetting_${value}`), value));
  label("marketAreaSetting", setting);
  const inputs = new Map<string, HTMLInputElement>();
  for (const [key, value, min, max] of [
    ["marketCenterX", 0, -100000, 100000],
    ["marketCenterY", 0, -100000, 100000],
    ["marketWidth", 40, 12, 120],
    ["marketDepth", 30, 12, 120],
    ["marketAngle", 0, -360, 360]
  ] as const) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    inputs.set(key, input);
    label(key, input);
  }
  const hall = document.createElement("select");
  label("marketHall", hall);
  const market = document.createElement("select");
  let previousDocument: CityDocument | undefined;
  const options = () => {
    previousDocument = ctx.getDocument();
    const oldHall = hall.value,
      oldMarket = market.value;
    hall.replaceChildren(new Option(editorText("cityEditor.messages.marketChooseHall"), ""));
    const names = new Map(placementCatalog().map(item => [item.id, item.name]));
    for (const e of ctx.getDocument().elements)
      if (e.objectType && MARKET_HALL_IDS.includes(e.objectType))
        hall.add(new Option(`${names.get(e.objectType)} (${e.point?.map(n => Math.round(n)).join(", ")})`, e.id));
    if ([...hall.options].some(o => o.value === oldHall)) hall.value = oldHall;
    market.replaceChildren();
    for (const [i, m] of (ctx.getDocument().markets ?? []).entries())
      market.add(
        new Option(
          `${i + 1}. ${editorText(`cityEditor.messages.marketSetting_${m.setting}`)} (${polygonCentroid(m.boundary)
            .map(n => Math.round(n))
            .join(", ")})`,
          m.id
        )
      );
    if ([...market.options].some(o => o.value === oldMarket)) market.value = oldMarket;
  };
  const draft = (): DesignatedMarket => ({
    id: "preview",
    setting: setting.value as DesignatedMarket["setting"],
    center: [Number(inputs.get("marketCenterX")!.value), Number(inputs.get("marketCenterY")!.value)],
    widthMeters: Number(inputs.get("marketWidth")!.value),
    depthMeters: Number(inputs.get("marketDepth")!.value),
    rotationDegrees: Number(inputs.get("marketAngle")!.value),
    hallId: hall.value
  });
  const clearPreview = () => ctx.map.querySelector(".ce-market-area-preview")?.remove();
  const preview = () => {
    clearPreview();
    if (!root.open) return;
    const points = marketRectangle(draft());
    if (!points) return;
    ctx.map.querySelector(".ce-map-scene")?.appendChild(
      element("path", {
        d: polygon(points),
        class: "ce-market-area-preview",
        fill: "rgba(175,125,55,0.15)",
        stroke: "#9a713e",
        "stroke-width": "1",
        "stroke-dasharray": "3 2",
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none"
      })
    );
  };
  root.addEventListener("toggle", () => {
    if (root.open) options();
    preview();
  });
  root.addEventListener("input", preview);
  button("marketUseSelection", () => {
    options();
    const selected = ctx.selected();
    const e = ctx.getDocument().elements.find(e => e.id === selected?.id);
    const point = selected?.point;
    let p: Point | undefined =
      Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) ? [point[0], point[1]] : undefined;
    if (e?.point && e.objectType && MARKET_HALL_IDS.includes(e.objectType)) {
      hall.value = e.id;
      setting.value = "hall-front";
      const box = placementFootprint(e.objectType, e.objectQuality)!;
      const z = planAxes(e.rotation ?? 0).axisZ;
      const reach = box.halfZ + Number(inputs.get("marketDepth")!.value) / 2 + 6;
      p = [e.point[0] + z[0] * reach, e.point[1] + z[1] * reach];
      inputs.get("marketAngle")!.value = String(((e.rotation ?? 0) * 180) / Math.PI);
    }
    if (p) {
      inputs.get("marketCenterX")!.value = String(p[0]);
      inputs.get("marketCenterY")!.value = String(p[1]);
    }
    preview();
  });
  button("marketPopulateArea", () => {
    const result = placeDesignatedMarket(ctx.getDocument(), { ...draft(), id: crypto.randomUUID() });
    if (!result.placed) {
      ctx.notice(
        editorText(
          result.reason === "field"
            ? "cityEditor.messages.buildingNeedsField"
            : result.reason === "existing"
              ? "cityEditor.messages.marketAreaExisting"
              : result.reason === "street"
                ? "cityEditor.messages.marketAreaNeedsStreet"
                : result.reason === "hall"
                  ? "cityEditor.messages.marketAreaNeedsHall"
                  : result.reason === "freeform"
                    ? "cityEditor.messages.marketAreaNeedsFreeform"
                    : result.reason === "area"
                      ? "cityEditor.messages.marketAreaInvalid"
                      : result.reason === "locked"
                        ? "cityEditor.messages.marketAreaLocked"
                        : "cityEditor.messages.marketNoSpace"
        )
      );
      return;
    }
    clearPreview();
    const message = editorText("cityEditor.messages.marketPopulated", { value0: result.placed });
    ctx.commit(result.document, message);
    options();
    market.value = result.document.markets!.at(-1)!.id;
  });
  label("marketSavedArea", market);
  market.addEventListener("focus", options);
  for (const activity of ["closed", "market-day"] as const)
    button(activity === "closed" ? "marketClose" : "marketOpen", () => {
      const next = setMarketActivity(ctx.getDocument(), market.value, activity);
      if (!next) return;
      ctx.commit(
        next,
        editorText(activity === "closed" ? "cityEditor.messages.marketClose" : "cityEditor.messages.marketOpen")
      );
    });
  const hint = document.createElement("p");
  hint.textContent = editorText("cityEditor.messages.marketAreaHint");
  root.append(hint);
  return {
    root,
    sync() {
      const current = ctx.getDocument();
      if (current !== previousDocument) {
        previousDocument = current;
        options();
      }
      preview();
    }
  };
}
