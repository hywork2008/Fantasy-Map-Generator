import { editorText } from "../../../i18n/editorMessages";
import { createVectorDocument, createVectorExample } from "../../generators/vector/document";
import type { VectorDocumentHistory } from "../../generators/vector/history";
import { beginEditorMount } from "../../services/editorLifetime";
import { exportCityMap, readCityMap } from "../../services/io/cityEditorFile";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import type { FixedApproachProvider } from "../../types/contracts/fixedApproachAdoption";
import type { CityDocument } from "../../types/document";
import { createEditorControls } from "../editorControls";
import type { EditorLanguageLifetime } from "../languagePanel";
import { createVectorGenerationPanel } from "./VectorGenerationPanel";
import { createVectorWorkbench } from "./VectorWorkbench";

export interface VectorEditorSession {
  history: VectorDocumentHistory;
  sourceDescriptor?: BurgSiteDescriptor;
}

export function mountVectorCityEditor(
  root: HTMLElement,
  session: VectorEditorSession,
  options: {
    lifetime: EditorLanguageLifetime;
    fixedApproachProvider?: FixedApproachProvider;
    returnToMesh(): void;
    openMeshDocument(document: CityDocument): void;
  }
): () => void {
  const scope = beginEditorMount(root);
  options.lifetime.attach(scope);
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
  let generationPanel: ReturnType<typeof createVectorGenerationPanel> | undefined;
  let workbench: ReturnType<typeof createVectorWorkbench> | undefined;
  const refresh = () => {
    const current = session.history.document;
    undo.disabled = !session.history.canUndo;
    redo.disabled = !session.history.canRedo;
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
  layout.append(controls, map);
  root.append(layout);
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
    session.sourceDescriptor ?? session.history.document.site?.descriptor
  );
  workbench = createVectorWorkbench(
    scope,
    controls,
    map,
    status,
    () => session.history.document,
    (document, label) => {
      scope.invalidate("import");
      session.history.commit(document, label);
      refresh();
    }
  );
  refresh();
  return options.lifetime.dispose.bind(options.lifetime);
}
