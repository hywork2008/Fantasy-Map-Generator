import { expect, it } from "vitest";
import { buildingDraft } from "../controllers/tools/buildingTool";
import { EditorLifetime } from "../services/editorLifetime";
import type { InteractionState } from "../state/editorSession";
import type { CityDocument } from "../types/document";
import { buildBuildingControls } from "./buildingControls";

it("selects market tiers for the placement preview and restores the edited stall's tier", () => {
  const interaction = {
    buildingModelId: "market-produce-stall",
    buildingQuality: "low",
    buildingHoverPoint: [0, 0],
    buildingFacingDegrees: 0,
    buildingGesture: "move"
  } as InteractionState;
  const root = document.createElement("div");
  document.body.append(root);
  const scope = new EditorLifetime(root);
  const controls = buildBuildingControls(scope, interaction, () => {});
  root.append(controls.controls);
  try {
    interaction.buildingModelId = "market-produce-stall";
    controls.syncFromInteraction();
    const selects = controls.controls.querySelectorAll("select");
    const quality = selects[2];
    expect([...quality.options].map(option => option.value)).toEqual(["low", "high"]);
    expect(quality.value).toBe("low");
    const low = buildingDraft({} as CityDocument, interaction)!;
    quality.value = "high";
    quality.dispatchEvent(new Event("change"));
    const high = buildingDraft({} as CityDocument, interaction)!;
    expect(high.quality).toBe("high");
    expect(high.footprint.halfX).toBeGreaterThan(low.footprint.halfX);
    interaction.buildingQuality = "low";
    controls.syncFromInteraction();
    expect(quality.value).toBe("low");
    interaction.buildingModelId = "house:mediterranean";
    controls.syncFromInteraction();
    expect(quality.parentElement?.hidden).toBe(true);
    expect(buildingDraft({} as CityDocument, interaction)?.quality).toBeUndefined();
  } finally {
    scope.dispose();
    root.remove();
  }
});
