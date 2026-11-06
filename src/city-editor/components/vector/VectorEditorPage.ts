import { editorText } from "../../../i18n/editorMessages";
import { createVectorDocument, createVectorExample } from "../../generators/vector/document";
import type { VectorDocumentHistory } from "../../generators/vector/history";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { beginEditorMount } from "../../services/editorLifetime";
import { exportCityMap, readCityMap } from "../../services/io/cityEditorFile";
import { restoreLegacyCopy } from "../../services/io/vector/legacyCopy";
import type { VectorRecipe } from "../../services/io/vector/share";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import type { FixedApproachProvider } from "../../types/contracts/fixedApproachAdoption";
import type { CityDocument } from "../../types/document";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorStage } from "../../types/vector/urban";
import { createEditorControls } from "../editorControls";
import type { EditorLanguageLifetime } from "../languagePanel";
import { createVectorEditPanel } from "./VectorEditPanel";
import { createVectorGenerationPanel } from "./VectorGenerationPanel";
import { createVectorPlacementPanel } from "./VectorPlacementPanel";
import { createVectorPresentationPanel } from "./VectorPresentationPanel";
import { createVectorWorkbench } from "./VectorWorkbench";

export interface VectorEditorSession {
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
  let placementPanel: ReturnType<typeof createVectorPlacementPanel> | undefined;
  let editPanel: ReturnType<typeof createVectorEditPanel> | undefined;
  let generationPanel: ReturnType<typeof createVectorGenerationPanel> | undefined;
  let workbench: ReturnType<typeof createVectorWorkbench> | undefined;
  const refresh = () => {
    const current = session.history.document;
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
    generationPanel?.refresh();
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
  controls.append(heading, help, actions, status);
  const viewport = document.createElement("div"),
    threeHost = document.createElement("div");
  viewport.style.cssText = "flex:1;min-width:0;position:relative";
  map.style.cssText = "width:100%;height:100%;min-height:300px";
  threeHost.style.cssText = "width:100%;height:100%;min-height:300px";
  viewport.append(map, threeHost);
  layout.append(controls, viewport);
  root.append(layout);
  const presentation = createVectorPresentationPanel(scope, controls, map, threeHost, () => session.history.document);
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
    (doc, stage) => presentation.rendered(doc, stage)
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
    (doc, label) => editPanel!.submit(doc, label)
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
    doc => presentation.rendered(doc)
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
