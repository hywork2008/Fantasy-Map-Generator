import { editorText } from "../../i18n/editorMessages";
import { editFortSite, removeFortComponent } from "../generators/fortSiteEditing";
import type { CityDocument } from "../types/document";
import type { FortSite } from "../types/fortSite";
import type { createEditorControls } from "./editorControls";

export function populateFortSiteInspector(
  container: HTMLElement,
  document: CityDocument,
  id: string | number | null | undefined,
  controls: ReturnType<typeof createEditorControls>,
  commit: (operation: () => CityDocument | null, label: string) => void
): boolean {
  const site = document.fortSite;
  if (!site || typeof id !== "string") return false;
  const { label, numberInput, makeButton, checkbox, toggleLabel } = controls;
  const update = (apply: (target: FortSite) => void) =>
    commit(() => editFortSite(document, apply), editorText("cityEditor.messages.fortEarthworks"));
  const numeric = (
    title: Parameters<typeof editorText>[0],
    value: number,
    apply: (target: FortSite, value: number) => void,
    min = "0.1"
  ) => {
    const input = numberInput(String(value), min, "0.1");
    input.addEventListener("change", () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) update(target => apply(target, n));
    });
    container.append(label(editorText(title), input));
    return input;
  };
  if (id === site.id) {
    numeric(
      "cityEditor.messages.fortSummitHeight",
      site.motte.heightMeters,
      (target, n) => (target.motte.heightMeters = n)
    );
    numeric(
      "cityEditor.messages.fortSummitRadius",
      site.motte.summitRadiusMeters,
      (target, n) => (target.motte.summitRadiusMeters = n)
    );
    numeric(
      "cityEditor.messages.fortBaseRadius",
      site.motte.baseRadiusMeters,
      (target, n) => (target.motte.baseRadiusMeters = n)
    );
    return true;
  }
  const defense = site.defenses.find(d => d.id === id),
    moat = site.moats.find(m => m.id === id),
    route = site.routes.find(r => r.id === id),
    gate = site.gates.find(g => g.id === id),
    building = site.buildings.find(b => b.partId === id);
  if (!defense && !moat && !route && !gate && !building) return false;
  const locked =
    defense?.locked ??
    moat?.locked ??
    route?.locked ??
    document.castles?.find(c => c.id === site.castleId)?.parts.find(p => p.id === id)?.locked ??
    false;
  const buildingLocked = building && document.castles?.find(c => c.id === site.castleId)?.locked;
  const before = container.childElementCount;
  if (defense) {
    numeric(
      "cityEditor.messages.fortHeight",
      defense.heightMeters,
      (t, n) => (t.defenses.find(d => d.id === id)!.heightMeters = n)
    );
    numeric(
      "cityEditor.messages.fortWidth",
      defense.widthMeters,
      (t, n) => (t.defenses.find(d => d.id === id)!.widthMeters = n)
    );
  }
  if (moat) {
    numeric(
      "cityEditor.messages.fortDepth",
      moat.depthMeters,
      (t, n) => (t.moats.find(m => m.id === id)!.depthMeters = n)
    );
    numeric(
      "cityEditor.messages.fortWidth",
      moat.widthMeters,
      (t, n) => (t.moats.find(m => m.id === id)!.widthMeters = n)
    );
    numeric(
      "cityEditor.messages.fortWaterDepth",
      Math.max(0, site.waterElevationMeters - site.groundElevationMeters + moat.depthMeters),
      (t, n) => (t.waterElevationMeters = t.groundElevationMeters - t.moats.find(m => m.id === id)!.depthMeters + n),
      "0"
    );
  }
  if (route)
    numeric(
      "cityEditor.messages.fortWidth",
      route.widthMeters,
      (t, n) => (t.routes.find(r => r.id === id)!.widthMeters = n)
    );
  if (gate) {
    numeric(
      "cityEditor.messages.fortHeight",
      gate.heightMeters,
      (t, n) => (t.gates.find(g => g.id === id)!.heightMeters = n)
    );
    numeric(
      "cityEditor.messages.fortWidth",
      gate.widthMeters,
      (t, n) => (t.gates.find(g => g.id === id)!.widthMeters = n)
    );
  }
  if (building)
    numeric(
      "cityEditor.messages.fortHeight",
      building.heightMeters,
      (t, n) => (t.buildings.find(b => b.partId === id)!.heightMeters = n)
    );
  if (locked || buildingLocked)
    for (const input of Array.from(container.querySelectorAll<HTMLInputElement>("input"))) input.disabled = true;
  if (!gate) {
    const input = checkbox(locked, checked =>
      commit(() => {
        if (building) {
          const next = structuredClone(document),
            part = next.castles?.find(c => c.id === site.castleId)?.parts.find(p => p.id === id);
          if (!part) return null;
          part.locked = checked;
          return next;
        }
        return editFortSite(document, t => {
          const item = [...t.defenses, ...t.moats, ...t.routes].find(x => x.id === id);
          if (item) item.locked = checked;
        });
      }, editorText("cityEditor.messages.castleLock"))
    );
    container.append(toggleLabel(editorText("cityEditor.messages.castleLock"), input));
  }
  const remove = makeButton(editorText("cityEditor.messages.fortDeletePart"), () =>
    commit(() => removeFortComponent(document, id), editorText("cityEditor.messages.fortDeletePart"))
  );
  remove.disabled = locked || !!buildingLocked;
  container.append(remove);
  return container.childElementCount > before;
}
