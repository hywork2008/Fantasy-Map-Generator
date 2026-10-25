import { editorText } from "../../i18n/editorMessages";
import type { EditorLifetime } from "../services/editorLifetime";
import type { BuildingHeightLimit } from "../types/contracts/buildingHeightLimits";

export function buildingHeightLimitControls(
  scope: EditorLifetime,
  current: BuildingHeightLimit | undefined,
  prefix: string,
  change: (limit: BuildingHeightLimit | undefined) => void
): HTMLFieldSetElement {
  const root = document.createElement("fieldset");
  root.className = `${prefix}-limits`;
  const legend = document.createElement("legend");
  legend.textContent = editorText(
    prefix === "ce-cell-height"
      ? "cityEditor.messages.cellBuildingHeightLimit"
      : "cityEditor.messages.cityBuildingHeightLimit"
  );
  root.append(legend);
  const inputs = [
    {
      key: "maxStoreys" as const,
      suffix: "storeys",
      label: "cityEditor.messages.maximumBuildingStoreys" as const,
      max: 200,
      step: 1
    },
    {
      key: "maxHeightMeters" as const,
      suffix: "meters",
      label: "cityEditor.messages.maximumBuildingHeightMeters" as const,
      max: 2000,
      step: "any"
    }
  ].map(spec => {
    const label = document.createElement("label");
    label.textContent = editorText(spec.label);
    const input = document.createElement("input");
    input.type = "number";
    input.className = `${prefix}-${spec.suffix}`;
    input.min = "0";
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.placeholder = editorText("cityEditor.messages.noBuildingHeightLimit");
    input.value = current?.[spec.key] === undefined ? "" : String(current[spec.key]);
    input.setAttribute("aria-label", editorText(spec.label));
    label.append(input);
    root.append(label);
    return { ...spec, input };
  });
  for (const { input } of inputs)
    scope.listen(input, "change", () => {
      if (inputs.some(item => !item.input.reportValidity())) return;
      const limit: BuildingHeightLimit = {};
      for (const item of inputs) if (item.input.value !== "") limit[item.key] = Number(item.input.value);
      change(Object.keys(limit).length ? limit : undefined);
    });
  return root;
}
