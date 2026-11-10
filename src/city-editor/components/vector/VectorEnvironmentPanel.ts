import { placementCatalog } from "../../../buildings/placementModels";
import { BURIAL_CULTURE_PRESETS } from "../../../data/burialCultures";
import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { historicalPeriodIndex } from "../../../types/historicalPeriod";
import { materializeFreeform } from "../../generators/freeform/freeformCity";
import { prepareVectorEdit } from "../../generators/vector/editing/dependencies";
import { combineVectorRegions, setVectorRegion } from "../../generators/vector/editing/regions";
import { addVectorFeature, removeVectorFeature, setVectorFeatureActivity } from "../../generators/vector/features";
import { regenerateVectorLandscape } from "../../generators/vector/landscape";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import type { EditorLifetime } from "../../services/editorLifetime";
import { restoreVectorFreeform, vectorFromFreeform } from "../../services/io/vector/freeform";
import type { CityDocument } from "../../types/document";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import { VECTOR_FEATURE_KINDS, type VectorFeatureKind } from "../../types/vector/environment";
import type { VectorUse } from "../../types/vector/urban";

const text = (key: string) => editorText(`cityEditor.vector.environment.${key}` as EditorMessageKey);
export function createVectorEnvironmentPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  map: HTMLElement,
  read: () => VectorCityDocument,
  submit: (doc: VectorCityDocument, label: string) => void,
  commitView: (doc: VectorCityDocument, label: string) => void,
  restore: (doc: CityDocument) => void,
  readEntryKey?: () => object
) {
  const box = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    status = document.createElement("output");
  legend.textContent = text("title");
  box.append(legend);
  parent.append(box);
  box.dataset.vectorEnvironment = "";
  box.style.cssText = "display:flex;flex-direction:column;gap:6px";
  const select = (key: string, values: readonly string[]) => {
    const label = document.createElement("label"),
      s = document.createElement("select");
    s.dataset.environmentField = key;
    label.append(text(key), s);
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text(value);
      s.append(option);
    }
    box.append(label);
    return s;
  };
  const number = (key: string, value: number) => {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.dataset.environmentField = key;
    label.append(text(key), input);
    box.append(label);
    return input;
  };
  const model = select("model", []);
  for (const item of [{ id: "", name: text("massing") }, ...placementCatalog()]) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    model.append(option);
  }
  const kind = select("kind", [...VECTOR_FEATURE_KINDS, "district", "reservation"]),
    road = select("road", []),
    river = select("river", []),
    culture = select("culture", ["stone", "timber"]),
    activity = select("activity", ["market-day", "closed"]),
    use = select("use", ["residential", "commerce", "craft", "hazard", "river"]);
  const x = number("east", 0),
    y = number("north", 0),
    width = number("width", 60),
    depth = number("depth", 60),
    density = number("density", 0.7),
    height = number("height", 14),
    moat = number("moat", 0);
  let drawing = false,
    points: Point[] = [],
    entry: VectorCityDocument | undefined;
  const clearDrawing = () => {
    drawing = false;
    points = [];
    entry = undefined;
    map.querySelector("[data-environment-draft]")?.remove();
  };
  scope.own(clearDrawing);
  const button = (key: string, action: () => void | Promise<void>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text(key);
    b.dataset.environmentAction = key;
    box.append(b);
    scope.listen(b, "click", async () => {
      try {
        await action();
        status.textContent = text("ready");
      } catch (error) {
        status.textContent = `${text("failed")} ${error instanceof Error ? error.message : String(error)}`;
      }
    });
    return b;
  };
  const forestMode = select("landscapeMode", ["legacy", "farmland", "surroundings"]),
    forestDensity = select("landscapeDensity", ["sparse", "standard", "dense"]),
    burialPreset = select("landscapeBurial", ["preserve"]);
  for (const [id, profile] of Object.entries(BURIAL_CULTURE_PRESETS)) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = profile.name;
    burialPreset.append(option);
  }
  const regenerateLandscape = button("regenerateLandscape", () => {
    const current = read();
    submit(
      regenerateVectorLandscape(current, {
        forest: {
          version: 1,
          mode: forestMode.value as "legacy" | "farmland" | "surroundings",
          density: forestDensity.value as "sparse" | "standard" | "dense"
        },
        ...(burialPreset.value !== "preserve" ? { burialPreset: burialPreset.value } : {})
      }),
      text("regenerateLandscape")
    );
  });
  const cultureLandscape = button("applyLocalFaith", () =>
    submit(regenerateVectorLandscape(read(), { useCivilization: true }), text("applyLocalFaith"))
  );
  const landscapeContext = document.createElement("output");
  landscapeContext.dataset.landscapeContext = "";
  box.append(landscapeContext);
  const add = (outer: Point[]) => {
    const current = read();
    const boundary = { outer, holes: [] };
    if (kind.value === "district" || kind.value === "reservation")
      submit(
        setVectorRegion(current, boundary, {
          kind: kind.value,
          use: use.value as VectorUse,
          density: Number(density.value),
          maxHeightMeters: Number(height.value)
        }),
        text("add")
      );
    else
      submit(
        addVectorFeature(current, {
          kind: kind.value as VectorFeatureKind,
          ...(model.value ? { modelId: model.value } : {}),
          boundary,
          roadId: road.value,
          riverId: river.value,
          density: Number(density.value),
          heightMeters: Number(height.value),
          activity: activity.value as "market-day" | "closed",
          culture: culture.value as "stone" | "timber",
          moatWidthMeters: Number(moat.value)
        }),
        text("add")
      );
  };
  const addButton = button("add", () => {
    const cx = Number(x.value),
      cy = Number(y.value),
      w = Number(width.value) / 2,
      h = Number(depth.value) / 2;
    if (!(w > 0 && h > 0 && w <= 1000 && h <= 1000)) throw Error("feature-dimensions");
    add([
      [cx - w, cy - h],
      [cx + w, cy - h],
      [cx + w, cy + h],
      [cx - w, cy + h]
    ]);
  });
  button("draw", () => {
    clearDrawing();
    drawing = true;
    entry = read();
    status.textContent = text("drawing");
  });
  button("finish", () => {
    if (!drawing || points.length < 3) throw Error("feature-polygon");
    if (JSON.stringify(entry) !== JSON.stringify(read())) {
      clearDrawing();
      throw Error("feature-stale");
    }
    const polygon = [...points];
    clearDrawing();
    add(polygon);
  });
  button("cancel", clearDrawing);
  scope.listen(
    map,
    "pointerdown",
    event => {
      if (!drawing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.button !== 0 || points.length >= 512) return;
      const svg = map.querySelector("svg");
      if (!svg) return;
      const matrix = svg.getScreenCTM?.();
      if (!matrix) return;
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      points.push([p.x, -p.y]);
      let outline = svg.querySelector("[data-environment-draft]");
      if (!outline) {
        outline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        outline.setAttribute("data-environment-draft", "");
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke", "#d34c35");
        outline.setAttribute("stroke-width", "1");
        outline.setAttribute("pointer-events", "none");
        svg.append(outline);
      }
      outline.setAttribute("points", points.map(p => `${p[0]},${-p[1]}`).join(" "));
      status.textContent = `${text("drawing")} ${points.length}`;
    },
    { capture: true }
  );
  const selected = select("selection", []);
  selected.multiple = true;
  selected.size = 5;
  scope.listen(selected, "change", () => {
    const doc = read(),
      id = selected.value,
      f = doc.environment?.features[id],
      r = doc.regions[id];
    if (f) {
      kind.value = f.kind;
      road.value = f.access.pathId;
      river.value = f.waterAnchor?.pathId ?? river.value;
      culture.value = f.settings.culture;
      activity.value = f.settings.activity;
      density.value = String(f.settings.density);
      height.value = String(f.settings.heightMeters);
      moat.value = String(f.settings.moatWidthMeters);
      model.value = doc.placements[f.placementIds[0]]?.modelId ?? "";
    }
    if (r) {
      kind.value = r.kind;
      use.value = r.use ?? "residential";
      density.value = String(r.density ?? 1);
      height.value = String(r.maxHeightMeters ?? 30);
    }
    const polygon = f?.boundary ?? r;
    if (polygon) {
      const xs = polygon.outer.map(p => p[0]),
        ys = polygon.outer.map(p => p[1]),
        minX = Math.min(...xs),
        maxX = Math.max(...xs),
        minY = Math.min(...ys),
        maxY = Math.max(...ys);
      x.value = String((minX + maxX) / 2);
      y.value = String((minY + maxY) / 2);
      width.value = String(maxX - minX);
      depth.value = String(maxY - minY);
    }
    map.querySelectorAll("[data-environment-selected]").forEach(el => {
      el.removeAttribute("data-environment-selected");
      el.removeAttribute("stroke");
      el.removeAttribute("stroke-width");
    });
    for (const option of selected.selectedOptions) {
      const element = map.querySelector(
        `[data-vector-feature="${option.value}"],[data-vector-region="${option.value}"]`
      );
      if (element) {
        element.setAttribute("stroke", "#d34c35");
        element.setAttribute("stroke-width", "1");
        element.setAttribute("data-environment-selected", "");
      }
    }
  });
  button("remove", () => {
    let doc = read();
    for (const option of selected.selectedOptions) {
      if (doc.environment?.features[option.value]) doc = removeVectorFeature(doc, option.value);
      else {
        doc = prepareVectorEdit(doc);
        delete doc.regions[option.value];
        doc.revision++;
        assertVectorDocument(doc);
      }
    }
    submit(doc, text("remove"));
  });
  button("applyActivity", () => {
    let doc = read();
    for (const option of selected.selectedOptions)
      doc = setVectorFeatureActivity(doc, option.value, activity.value as "market-day" | "closed");
    submit(doc, text("applyActivity"));
  });
  button("update", () => {
    let doc = read();
    const ids = Array.from(selected.selectedOptions, o => o.value);
    if (ids.length !== 1) throw Error("feature-selection");
    const id = ids[0],
      feature = doc.environment?.features[id];
    if (feature) {
      const boundary = structuredClone(feature.boundary);
      doc = removeVectorFeature(doc, id);
      doc = addVectorFeature(
        doc,
        {
          kind: feature.kind,
          ...(model.value ? { modelId: model.value } : {}),
          boundary,
          roadId: road.value,
          riverId: river.value,
          density: Number(density.value),
          heightMeters: Number(height.value),
          activity: activity.value as "market-day" | "closed",
          culture: culture.value as "stone" | "timber",
          moatWidthMeters: Number(moat.value)
        },
        id
      );
    } else {
      const r = doc.regions[id];
      if (!r) throw Error("region-selection");
      doc = setVectorRegion(
        doc,
        r,
        {
          kind: r.kind,
          use: use.value as VectorUse,
          density: Number(density.value),
          maxHeightMeters: Number(height.value)
        },
        id
      );
    }
    submit(doc, text("update"));
  });
  for (const operation of ["union", "difference", "intersection"] as const)
    button(operation, () =>
      submit(
        combineVectorRegions(
          read(),
          Array.from(selected.selectedOptions, o => o.value),
          operation
        ),
        text(operation)
      )
    );
  button("visibility", () => {
    const doc = read();
    if (!doc.environment) return;
    for (const option of selected.selectedOptions) {
      const id = option.value;
      if (!doc.environment.features[id]) continue;
      const hidden = doc.environment.hidden;
      doc.environment.hidden = hidden.includes(id) ? hidden.filter(v => v !== id) : [...hidden, id];
    }
    commitView(doc, text("visibility"));
  });
  button("lock", () => {
    const doc = prepareVectorEdit(read());
    for (const option of selected.selectedOptions) {
      const f = doc.environment?.features[option.value];
      if (!f) continue;
      f.editPolicy = f.editPolicy === "fixed" ? "editable" : "fixed";
      for (const id of f.pathIds) doc.paths[id].editPolicy = f.editPolicy;
      for (const id of f.placementIds) doc.placements[id].editPolicy = f.editPolicy;
      for (const bridge of Object.values(doc.connections.bridges))
        if (f.pathIds.includes(bridge.roadPathId)) bridge.editPolicy = f.editPolicy;
    }
    doc.revision++;
    assertVectorDocument(doc);
    submit(doc, text("lock"));
  });
  const terrainTitle = document.createElement("p");
  terrainTitle.textContent = text("terrain");
  box.append(terrainTitle);
  const level = number("level", 0),
    relief = number("relief", 20),
    radius = number("radius", 150),
    sample = number("sample", 8);
  const terrainButton = button("applyTerrain", () => {
    const doc = prepareVectorEdit(read());
    doc.environment ??= { features: {}, hidden: [] };
    const existing = doc.environment.terrain;
    const spacing = Number(sample.value),
      r = Number(radius.value);
    if (!(spacing >= 1 && spacing <= 100 && r > 0 && r <= 10000)) throw Error("terrain-dimensions");
    doc.environment.terrain = {
      ...(existing ?? {
        format: "fmg-freeform-city",
        version: 1,
        frame: structuredClone(doc.frame),
        sculpt: [],
        plots: [],
        placements: [],
        ways: [],
        rivers: [],
        zones: []
      }),
      ground: {
        version: 1,
        template: "dome",
        seed: 1,
        sampleMeters: spacing,
        parts: [
          { kind: "offset", meters: Number(level.value) },
          {
            kind: "hill",
            center: [Number(x.value), Number(y.value)],
            radiusMeters: r,
            heightMeters: Number(relief.value)
          }
        ]
      }
    };
    doc.revision++;
    assertVectorDocument(doc);
    submit(doc, text("applyTerrain"));
  });
  const sculpt = select("sculpt", ["raise", "lower", "smooth"]);
  button("applySculpt", () => {
    const doc = prepareVectorEdit(read());
    const terrain = doc.environment?.terrain;
    if (!terrain) throw Error("terrain-required");
    terrain.sculpt.push({
      id: `sculpt:${terrain.sculpt.length + 1}`,
      kind: sculpt.value as "raise" | "lower" | "smooth",
      center: [Number(x.value), Number(y.value)],
      radiusMeters: Number(radius.value),
      meters: Number(relief.value)
    });
    doc.revision++;
    assertVectorDocument(doc);
    submit(doc, text("applySculpt"));
  });
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.dataset.environmentField = "freeform";
  file.setAttribute("aria-label", text("importFreeform"));
  box.append(file);
  scope.listen(file, "change", async () => {
    const ticket = scope.ticket("environment-import"),
      entry = readEntryKey?.() ?? JSON.stringify(read()),
      f = file.files?.[0];
    file.value = "";
    if (!f) return;
    try {
      if (f.size > 8 * 1024 * 1024) throw Error("freeform-budget");
      const source = JSON.parse(await f.text());
      if (!ticket() || entry !== (readEntryKey?.() ?? JSON.stringify(read()))) return;
      commitView(vectorFromFreeform(source), text("importFreeform"));
      status.textContent = text("ready");
    } catch (error) {
      if (ticket()) status.textContent = `${text("failed")} ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  const back = button("restoreFreeform", () => {
    const city = restoreVectorFreeform(read());
    if (city) restore(materializeFreeform(city));
  });
  box.append(status);
  const fill = (select: HTMLSelectElement, values: { id: string; label: string }[]) => {
    const old = select.value;
    select.replaceChildren(
      ...values.map(v => {
        const o = document.createElement("option");
        o.value = v.id;
        o.textContent = v.label;
        return o;
      })
    );
    if (values.some(v => v.id === old)) select.value = old;
  };
  const availability = () => {
    const doc = read();
    const bastion = kind.querySelector<HTMLOptionElement>('option[value="bastion"]');
    if (bastion)
      bastion.disabled =
        historicalPeriodIndex(doc.context.historicalPeriod) < historicalPeriodIndex("ageOfExploration");
    const harbor = kind.querySelector<HTMLOptionElement>('option[value="harbor"]');
    if (harbor) harbor.disabled = !Object.values(doc.paths).some(p => p.role === "river");
    addButton.disabled =
      !["district", "reservation"].includes(kind.value) && !Object.values(doc.paths).some(p => p.role === "road");
    terrainButton.disabled = doc.frame.extentMeters > 10000;
    terrainButton.title = terrainButton.disabled ? text("terrainLimit") : "";
  };
  scope.listen(kind, "change", availability);
  return {
    select(id: string) {
      selected.value = id;
      selected.dispatchEvent(new Event("change"));
    },
    refresh() {
      const doc = read();
      availability();
      const landscape = doc.environment?.landscape;
      forestMode.disabled = forestDensity.disabled = burialPreset.disabled = regenerateLandscape.disabled = !landscape;
      cultureLandscape.disabled = !landscape?.context.civilization;
      if (landscape) {
        forestMode.value = landscape.forest.settings.mode;
        forestDensity.value = landscape.forest.settings.density;
      }
      landscapeContext.textContent = landscape
        ? [
            landscape.context.biome?.name,
            landscape.context.civilization?.culture.name,
            landscape.context.burialProfile?.name
          ]
            .filter(Boolean)
            .join(" / ")
        : text("noLandscapeRecipe");
      if (drawing && JSON.stringify(entry) !== JSON.stringify(doc)) clearDrawing();
      fill(
        road,
        Object.values(doc.paths)
          .filter(p => p.role === "road")
          .map(p => ({ id: p.id, label: p.id }))
      );
      fill(
        river,
        Object.values(doc.paths)
          .filter(p => p.role === "river")
          .map(p => ({ id: p.id, label: p.id }))
      );
      fill(selected, [
        ...Object.values(doc.environment?.features ?? {}).map(f => ({
          id: f.id,
          label: `${text(f.kind)} (${f.id})${f.editPolicy === "fixed" ? " 🔒" : ""}`
        })),
        ...Object.values(doc.regions).map(r => ({ id: r.id, label: `${text(r.kind)} (${r.id})` }))
      ]);
      back.disabled = !doc.environment?.freeformSource;
    }
  };
}
