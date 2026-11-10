import { editorText } from "../../../i18n/editorMessages";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { createVectorDocument, createVectorExample } from "../../generators/vector/document";
import { clearFabricHouse, detachFabricHouse } from "../../generators/vector/editing/fabricHouses";
import { detachFabricLine } from "../../generators/vector/editing/fabricLines";
import type { VectorDocumentHistory } from "../../generators/vector/history";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { beginEditorMount } from "../../services/editorLifetime";
import { exportCityMap, readCityMap } from "../../services/io/cityEditorFile";
import { restoreLegacyCopy } from "../../services/io/vector/legacyCopy";
import type { VectorRecipe } from "../../services/io/vector/share";
import { createVectorPlanPreparation } from "../../services/vectorPlanPreparation";
import { VECTOR_RELEASE_CHANNEL } from "../../services/vectorRelease";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import type { FixedApproachProvider } from "../../types/contracts/fixedApproachAdoption";
import type { CityDocument } from "../../types/document";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorStage } from "../../types/vector/urban";
import { clamp, createEditorControls } from "../editorControls";
import type { EditorLanguageLifetime } from "../languagePanel";
import { createVectorCitySettingsPanel } from "./VectorCitySettingsPanel";
import { createVectorEditPanel } from "./VectorEditPanel";
import { createVectorEnvironmentPanel } from "./VectorEnvironmentPanel";
import { createVectorFabricHousePanel } from "./VectorFabricHousePanel";
import { createVectorGenerationPanel } from "./VectorGenerationPanel";
import { createVectorPlacementPanel } from "./VectorPlacementPanel";
import { createVectorPresentationPanel } from "./VectorPresentationPanel";
import { createVectorWorkbench } from "./VectorWorkbench";
import { attachVectorMeasure } from "./vectorMeasure";

export interface VectorEditorSession {
  generationInput?: import("../../generators/vector/generation/editorInput").VectorEditorGenerationInput;
  history: VectorDocumentHistory;
  sourceDescriptor?: BurgSiteDescriptor;
  sourceDocument?: CityDocument;
  sharedRecipe?: VectorRecipe;
  sharedStage?: VectorStage;
  shareError?: boolean;
}

export function mountVectorCityEditor(
  root: HTMLElement,
  session: VectorEditorSession,
  options: {
    lifetime: EditorLanguageLifetime;
    fixedApproachProvider?: FixedApproachProvider;
    returnToMesh(): void;
    openMeshDocument(document: CityDocument): void;
    openSharedLink?(): void;
  }
): () => void {
  const scope = beginEditorMount(root);
  options.lifetime.attach(scope);
  scope.listen(window, "hashchange", () => {
    if (location.hash.startsWith("#vector.")) options.openSharedLink?.();
  });
  root.dataset.documentFormat = "fmg-vector-city";
  scope.own(() => {
    delete root.dataset.documentFormat;
  });
  const { makeButton } = createEditorControls(scope);
  const layout = document.createElement("div");
  layout.className = "ce-vector-editor";
  layout.style.cssText = "display:flex;gap:16px;height:100%;min-height:400px;padding:16px;box-sizing:border-box";
  const controls = document.createElement("aside");
  controls.style.cssText = "width:310px;flex-shrink:0;overflow:auto";
  const heading = document.createElement("h2");
  heading.textContent = editorText("cityEditor.vector.title");
  const help = document.createElement("p");
  help.textContent = editorText("cityEditor.vector.previewHelp");
  const status = document.createElement("output");
  status.className = "ce-vector-status";
  status.setAttribute("aria-live", "polite");
  const map = document.createElement("main");
  map.style.cssText = "flex:1;min-width:0";
  const viewportExtents = new WeakMap<SVGSVGElement, number>();
  scope.listen(
    map,
    "wheel",
    event => {
      const svg = map.querySelector<SVGSVGElement>(".ce-vector-svg");
      if (!svg) return;
      const [x, y, width, height] = svg.getAttribute("viewBox")!.split(/\s+/).map(Number);
      const rect = svg.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height);
      if (!(width > 0 && height > 0 && size > 0)) return;
      event.preventDefault();
      const extent = viewportExtents.get(svg) ?? width;
      viewportExtents.set(svg, extent);
      const nextWidth = clamp(width * Math.exp(event.deltaY * 0.0012), extent / 20, extent);
      const scale = nextWidth / width;
      const nextHeight = height * scale;
      // Keep the map point under the cursor fixed, including letterboxed viewports.
      const centerX = x + width / 2 + ((event.clientX - rect.left - rect.width / 2) * (width - nextWidth)) / size;
      const centerY = y + height / 2 + ((event.clientY - rect.top - rect.height / 2) * (height - nextHeight)) / size;
      svg.setAttribute("viewBox", `${centerX - nextWidth / 2} ${centerY - nextHeight / 2} ${nextWidth} ${nextHeight}`);
    },
    { passive: false }
  );
  attachVectorMeasure(scope, map, text => {
    status.textContent = text;
  });
  let environmentPanel: ReturnType<typeof createVectorEnvironmentPanel> | undefined;
  let placementPanel: ReturnType<typeof createVectorPlacementPanel> | undefined;
  let housePanel: ReturnType<typeof createVectorFabricHousePanel> | undefined;
  let editPanel: ReturnType<typeof createVectorEditPanel> | undefined;
  let generationPanel: ReturnType<typeof createVectorGenerationPanel> | undefined;
  let citySettingsPanel: ReturnType<typeof createVectorCitySettingsPanel> | undefined;
  let workbench: ReturnType<typeof createVectorWorkbench> | undefined;
  const plans = createVectorPlanPreparation();
  scope.own(plans.dispose);
  const refresh = () => {
    const current = session.history.peek();
    plans.request(current);
    stopCopy();
    copyCandidate = undefined;
    adoptCopy.disabled = true;
    restoreCopy.disabled = !current.legacyCopy;
    if (current.legacyCopy) showCopyReport(current.legacyCopy.report);
    else copyList.replaceChildren();
    undo.disabled = !session.history.canUndo;
    redo.disabled = !session.history.canRedo;
    editPanel?.refresh();
    placementPanel?.refresh();
    housePanel?.refresh();
    environmentPanel?.refresh();
    generationPanel?.refresh();
    citySettingsPanel?.refresh();
    workbench?.refresh();
    status.textContent = editorText("cityEditor.vector.summary", {
      paths: Object.keys(current.paths).length,
      nodes: Object.keys(current.connections.nodes).length,
      revision: current.revision
    });
  };
  const newDocument = makeButton(editorText("cityEditor.vector.newDocument"), () => {
    scope.invalidate("import");
    session.history.commit(createVectorDocument(), editorText("cityEditor.vector.newDocument"));
    refresh();
  });
  const sample = makeButton(editorText("cityEditor.vector.loadExample"), () => {
    scope.invalidate("import");
    session.history.commit(createVectorExample(), editorText("cityEditor.vector.loadExample"));
    refresh();
  });
  sample.className = "ce-vector-example";
  const undo = makeButton(editorText("cityEditor.vector.undo"), () => {
    scope.invalidate("import");
    session.history.undo();
    refresh();
  });
  undo.className = "ce-vector-undo";
  const redo = makeButton(editorText("cityEditor.vector.redo"), () => {
    scope.invalidate("import");
    session.history.redo();
    refresh();
  });
  redo.className = "ce-vector-redo";
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.setAttribute("aria-label", editorText("cityEditor.vector.openDocument"));
  file.className = "ce-vector-file";
  scope.listen(file, "change", async () => {
    const current = scope.ticket("import");
    const selected = file.files?.[0];
    file.value = "";
    const imported = await readCityMap(selected, options.fixedApproachProvider);
    if (!current()) return;
    if (!imported) {
      status.textContent = editorText("cityEditor.vector.invalidDocument");
      return;
    }
    if (imported.source !== "vector-city") {
      options.openMeshDocument(imported.document);
      return;
    }
    session.history.commit(imported.document, editorText("cityEditor.vector.openDocument"));
    refresh();
  });
  const save = makeButton(editorText("cityEditor.vector.saveDocument"), () => exportCityMap(session.history.document));
  save.className = "ce-vector-save";
  const back = makeButton(editorText("cityEditor.vector.returnToMesh"), options.returnToMesh);
  back.className = "ce-vector-return";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-direction:column;gap:8px";
  actions.append(newDocument, sample, undo, redo, file, save, back);
  const release = document.createElement("p");
  release.className = "ce-vector-release-status";
  release.dataset.releaseChannel = VECTOR_RELEASE_CHANNEL;
  release.textContent = editorText("cityEditor.vector.release.preview");
  controls.append(heading, release, help, actions, status);
  const viewport = document.createElement("div"),
    threeHost = document.createElement("div");
  viewport.style.cssText = "flex:1;min-width:0;position:relative";
  map.style.cssText = "width:100%;height:100%;min-height:300px";
  threeHost.style.cssText = "width:100%;height:100%;min-height:300px";
  viewport.append(map, threeHost);
  layout.append(controls, viewport);
  root.append(layout);
  const presentation = createVectorPresentationPanel(
    scope,
    controls,
    map,
    threeHost,
    () => session.history.document,
    id => {
      // Selection reads the current snapshot without copying it (see the block fabric scaling plan, S2.0).
      const doc = session.history.peek();
      if (housePanel?.select(id)) {
        workbench?.selectHouse(id);
        return;
      }
      placementPanel?.select(id);
      const pathId = doc.paths[id]
        ? id
        : (doc.connections.bridges[id]?.roadPathId ?? doc.connections.nodes[id]?.anchors[0]?.pathId);
      if (pathId) workbench?.select(pathId);
      const feature = Object.values(doc.environment?.features ?? {}).find(
        f => f.id === id || f.pieces.some(p => p.id === id)
      );
      if (feature) environmentPanel?.select(feature.id);
      else if (doc.regions[id]) environmentPanel?.select(id);
    }
  );
  const copyStatus = document.createElement("output"),
    copyList = document.createElement("ul");
  let copyCandidate: VectorCityDocument | undefined;
  function showCopyReport(rows: NonNullable<VectorCityDocument["legacyCopy"]>["report"]) {
    const counts = { converted: 0, snapshot: 0, unsupported: 0 };
    for (const row of rows) counts[row.status]++;
    copyStatus.textContent = `${editorText("cityEditor.vector.presentation.copyReview")} ${Object.entries(counts)
      .map(([key, value]) => `${key}: ${value}`)
      .join(" / ")}`;
    copyList.replaceChildren(
      ...rows.map(row => {
        const li = document.createElement("li");
        li.textContent = `${row.status}: ${row.category} (${row.id}) — ${row.reason}`;
        return li;
      })
    );
  }
  let copyWorker: Worker | undefined, copyTimer: number | undefined;
  const stopCopy = () => {
    scope.invalidate("vector-copy");
    copyWorker?.terminate();
    copyWorker = undefined;
    if (copyTimer !== undefined) clearTimeout(copyTimer);
    copyTimer = undefined;
  };
  scope.own(stopCopy);
  scope.listen(
    controls,
    "click",
    () => {
      if (copyWorker) {
        stopCopy();
        copyStatus.textContent = "";
      }
    },
    { capture: true }
  );
  const copyButton = makeButton(editorText("cityEditor.vector.presentation.copyLegacy"), () => {
    scope.invalidate("import");
    stopCopy();
    const source = session.sourceDocument;
    if (!source) return;
    copyCandidate = undefined;
    adoptCopy.disabled = true;
    copyStatus.textContent = editorText("cityEditor.vector.presentation.loading");
    const current = scope.ticket("vector-copy"),
      entry = session.history.currentEntryKey;
    try {
      const worker = new Worker(new URL("../../services/vectorCopyWorker.ts", import.meta.url), { type: "module" });
      copyWorker = worker;
      const fail = () => {
        worker.terminate();
        if (current()) {
          copyWorker = undefined;
          copyStatus.textContent = editorText("cityEditor.vector.presentation.failed");
        }
        if (copyTimer !== undefined) clearTimeout(copyTimer);
      };
      copyTimer = window.setTimeout(fail, 60000);
      worker.onerror = fail;
      worker.onmessage = ({ data }) => {
        worker.terminate();
        if (copyTimer !== undefined) clearTimeout(copyTimer);
        if (!current() || entry !== session.history.currentEntryKey) return;
        copyWorker = undefined;
        if (data.error) {
          copyStatus.textContent = editorText("cityEditor.vector.presentation.failed");
          return;
        }
        try {
          assertVectorDocument(data.document);
          copyCandidate = data.document;
          showCopyReport(data.report);
          adoptCopy.disabled = false;
        } catch {
          copyStatus.textContent = editorText("cityEditor.vector.presentation.failed");
        }
      };
      worker.postMessage(source);
    } catch {
      copyStatus.textContent = editorText("cityEditor.vector.presentation.failed");
    }
  });
  copyButton.disabled = !session.sourceDocument;
  const adoptCopy = makeButton(editorText("cityEditor.vector.presentation.adoptCopy"), () => {
    if (!copyCandidate) return;
    session.history.commit(copyCandidate, editorText("cityEditor.vector.presentation.adoptCopy"));
    copyCandidate = undefined;
    adoptCopy.disabled = true;
    refresh();
  });
  adoptCopy.disabled = true;
  const restoreCopy = makeButton(editorText("cityEditor.vector.presentation.restoreLegacy"), () => {
    const source = restoreLegacyCopy(session.history.document, options.fixedApproachProvider);
    if (source) options.openMeshDocument(source);
  });
  const cancelCopy = makeButton(editorText("cityEditor.vector.presentation.cancelCopy"), () => {
    copyCandidate = undefined;
    adoptCopy.disabled = true;
    stopCopy();
    copyList.replaceChildren();
    copyStatus.textContent = "";
  });
  controls.append(copyButton, adoptCopy, cancelCopy, restoreCopy, copyStatus, copyList);
  // The city settings are the meshless editor's own: a city opened without the mesh editor's settings starts
  // from the editor defaults (and its FMG site, if linked), so nothing has to be set in the mesh editor first.
  session.generationInput ??= {
    seed: session.history.document.recipe.seed,
    settings: {
      ...defaultGenerationSettings(),
      ...((session.sourceDescriptor ?? session.history.document.site?.descriptor)
        ? { descriptor: session.sourceDescriptor ?? session.history.document.site?.descriptor }
        : {})
    },
    frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 }
  };
  generationPanel = createVectorGenerationPanel(
    scope,
    controls,
    map,
    () => session.history.document,
    (doc, label) => {
      scope.invalidate("import");
      session.history.commit(doc, label);
      refresh();
    },
    () => workbench?.refresh(),
    session.sourceDescriptor ?? session.history.document.site?.descriptor,
    (doc, stage) => presentation.rendered(doc, stage),
    undefined,
    () => session.history.currentEntryKey,
    session.generationInput,
    () => session.history.peek()
  );
  citySettingsPanel = createVectorCitySettingsPanel(
    scope,
    controls,
    session.generationInput,
    () => session.history.document,
    (doc, label) => {
      // The housing culture only restyles the houses: the open 3D view redraws its house layer in place.
      session.history.commit(doc, label);
      refresh();
    },
    () => scope.invalidate("vector-generation-input")
  );
  editPanel = createVectorEditPanel(
    scope,
    controls,
    map,
    () => session.history.document,
    () => session.history.currentEntryKey,
    (doc, label) => {
      session.history.commit(doc, label);
      refresh();
    },
    () => workbench?.refresh(),
    undefined,
    doc => presentation.rendered(doc)
  );
  placementPanel = createVectorPlacementPanel(
    scope,
    controls,
    () => session.history.document,
    (doc, label) => editPanel!.submit(doc, label),
    () => session.history.peek()
  );
  housePanel = createVectorFabricHousePanel(
    scope,
    controls,
    () => session.history.peek(),
    id => {
      // Detaching keeps every record and capacity; it is committed directly, without regeneration.
      try {
        const { document: next, placementId } = detachFabricHouse(session.history.document, id);
        session.history.commit(next, editorText("cityEditor.vector.fabricHouse.detach"));
        refresh();
        placementPanel?.select(placementId);
        return editorText("cityEditor.vector.fabricHouse.detached");
      } catch (error) {
        return `${editorText("cityEditor.vector.dependencies.failed")} ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    id => {
      try {
        session.history.commit(
          clearFabricHouse(session.history.document, id),
          editorText("cityEditor.vector.fabricHouse.clear")
        );
        refresh();
        return editorText("cityEditor.vector.fabricHouse.cleared");
      } catch (error) {
        return `${editorText("cityEditor.vector.dependencies.failed")} ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    id => {
      try {
        const { document: next, pathId } = detachFabricLine(session.history.document, id);
        session.history.commit(next, editorText("cityEditor.vector.fabricHouse.detachLine"));
        refresh();
        workbench?.select(pathId);
        return editorText("cityEditor.vector.fabricHouse.lineDetached");
      } catch (error) {
        return `${editorText("cityEditor.vector.dependencies.failed")} ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
  environmentPanel = createVectorEnvironmentPanel(
    scope,
    controls,
    map,
    () => session.history.document,
    (doc, label) => editPanel!.submit(doc, label),
    (doc, label) => {
      scope.invalidate("import");
      session.history.commit(doc, label);
      refresh();
    },
    options.openMeshDocument,
    () => session.history.currentEntryKey,
    () => session.history.peek()
  );
  workbench = createVectorWorkbench(
    scope,
    controls,
    map,
    status,
    () => session.history.document,
    (document, label) => {
      scope.invalidate("import");
      editPanel!.submit(document, label);
    },
    doc => presentation.rendered(doc),
    () => session.history.peek(),
    id => (id ? housePanel?.select(id) : housePanel?.clear()),
    id => housePanel?.selectLine(id)
  );
  refresh();
  if (session.history.document.legacyCopy) {
    copyList.replaceChildren(
      ...session.history.document.legacyCopy.report.map(row => {
        const li = document.createElement("li");
        li.textContent = `${row.status}: ${row.category} (${row.id}) — ${row.reason}`;
        return li;
      })
    );
  }
  if (session.sharedStage) {
    presentation.rendered(session.history.document, session.sharedStage);
    const sharedSvg = renderVectorDocument(session.history.document, undefined, undefined, session.sharedStage);
    sharedSvg.style.cssText = "width:100%;height:100%;min-height:300px";
    map.replaceChildren(sharedSvg);
    session.sharedStage = undefined;
  }
  if (session.shareError) copyStatus.textContent = editorText("cityEditor.vector.presentation.invalidShare");
  if (session.sharedRecipe) {
    const recipe = session.sharedRecipe;
    session.sharedRecipe = undefined;
    presentation.replay(recipe, doc => {
      session.history.commit(doc, editorText("cityEditor.vector.presentation.replay"));
      refresh();
    });
  }
  return options.lifetime.dispose.bind(options.lifetime);
}
