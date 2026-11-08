import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import { vectorUrbanStages } from "../../generators/vector/validation/urban";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { vectorRenderData } from "../../renderers/vector/renderData";
import type { mountVector3d } from "../../renderers/vector/view3d";
import type { EditorLifetime } from "../../services/editorLifetime";
import { downloadVectorBlob, serializeVectorSvg, vectorGlb, vectorPng } from "../../services/io/vector/exports";
import { type VectorRecipe, vectorRecipe, vectorShareUrl } from "../../services/io/vector/share";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorStage } from "../../types/vector/urban";

const text = (key: string) => editorText(`cityEditor.vector.presentation.${key}` as EditorMessageKey);
export function createVectorPresentationPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  map: HTMLElement,
  host: HTMLElement,
  read: () => VectorCityDocument,
  onSelect?: (id: string) => void
) {
  const box = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    stage = document.createElement("select"),
    view = document.createElement("select"),
    status = document.createElement("output"),
    link = document.createElement("textarea");
  box.dataset.vectorPresentation = "";
  legend.textContent = text("title");
  stage.dataset.presentationField = "stage";
  view.dataset.presentationField = "view";
  for (const value of ["2d", "3d"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text(value);
    view.append(option);
  }
  link.readOnly = true;
  link.rows = 2;
  link.setAttribute("aria-label", text("shareLink"));
  link.hidden = true;
  status.setAttribute("aria-live", "polite");
  status.className = "ce-vector-presentation-status";
  box.append(legend, view, stage);
  parent.append(box);
  box.style.cssText = "min-width:0";
  host.hidden = true;
  let displayed = read(),
    selected: VectorStage = displayed.urban ? "housing" : "regions",
    scene: ReturnType<typeof mountVector3d> | undefined;
  const release = () => {
    scope.invalidate("vector-3d");
    scene?.dispose();
    scene = undefined;
  };
  scope.own(release);
  const draw3d = async () => {
    release();
    if (view.value !== "3d") {
      host.hidden = true;
      map.hidden = false;
      status.textContent = text("ready");
      return;
    }
    const current = scope.ticket("vector-3d"),
      doc = structuredClone(displayed),
      at = selected;
    status.textContent = text("loading");
    map.hidden = true;
    host.hidden = false;
    try {
      const { mountVector3d } = await import("../../renderers/vector/view3d");
      if (!current()) return;
      scene = mountVector3d(host, vectorRenderData(doc, at), onSelect);
      status.textContent = scene.warnings.length ? `${text("massing")}: ${scene.warnings.length}` : text("ready");
    } catch {
      if (!current()) return;
      view.value = "2d";
      host.hidden = true;
      map.hidden = false;
      status.textContent = text("unavailable");
    }
  };
  const rendered = (doc: VectorCityDocument, at: VectorStage = doc.urban ? "housing" : "regions") => {
    scope.invalidate("vector-export");
    stopReplay();
    // Rendered documents are history snapshots or finished candidates, never edited afterwards.
    displayed = doc;
    selected = at;
    const values = doc.urban
      ? vectorUrbanStages(doc.urban.settings.mode)
      : (["inputs", "skeleton", "regions"] as VectorStage[]);
    stage.replaceChildren(
      ...values.map((value, i) => {
        const o = document.createElement("option");
        o.value = value;
        o.textContent = `${i + 1}/${values.length} ${editorText(`cityEditor.vector.generation.${value}` as EditorMessageKey)}`;
        return o;
      })
    );
    stage.value = at;
    void draw3d();
  };
  scope.listen(view, "change", () => void draw3d());
  scope.listen(stage, "change", () => {
    selected = stage.value as VectorStage;
    const svg = renderVectorDocument(displayed, undefined, undefined, selected);
    svg.style.cssText = "width:100%;height:100%;min-height:300px";
    map.replaceChildren(svg);
    void draw3d();
  });
  const button = (key: string, action: () => Promise<void> | void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text(key);
    b.dataset.presentationAction = key;
    box.append(b);
    scope.listen(b, "click", () => {
      void Promise.resolve()
        .then(action)
        .catch(() => {
          if (scope.active) status.textContent = text("failed");
        });
    });
    return b;
  };
  button("svg", () =>
    downloadVectorBlob(new Blob([serializeVectorSvg(displayed, selected)], { type: "image/svg+xml" }), "svg")
  );
  button("png", async () => {
    const current = scope.ticket("vector-export"),
      doc = structuredClone(displayed),
      at = selected,
      blob = view.value === "3d" && scene ? await scene.png() : await vectorPng(doc, at);
    if (current()) downloadVectorBlob(blob, "png");
  });
  const glbButton = button("glb", async () => {
    const current = scope.ticket("vector-export"),
      doc = structuredClone(displayed),
      at = selected;
    status.textContent = text("loading");
    const blob = await vectorGlb(doc, at);
    if (current()) {
      downloadVectorBlob(blob, "glb");
      status.textContent = text("ready");
    }
  });
  if (glbButton) glbButton.title = text("glbHint");
  const share = async (recipe: boolean) => {
    let recipeValue: ReturnType<typeof vectorRecipe> | undefined;
    if (recipe)
      try {
        recipeValue = vectorRecipe(displayed);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "";
        if (reason !== "vector-recipe-outdated" && reason !== "vector-recipe-edited") throw error;
        status.textContent = text(reason === "vector-recipe-outdated" ? "recipeOutdated" : "recipeEdited");
        return;
      }
    const url = vectorShareUrl(
      recipeValue
        ? { kind: "fmg-vector-city-share", version: 1, mode: "recipe", recipe: recipeValue }
        : { kind: "fmg-vector-city-share", version: 1, mode: "document", document: displayed, stage: selected }
    );
    link.value = url;
    link.hidden = false;
    try {
      await navigator.clipboard.writeText(url);
      status.textContent = text(recipe ? "recipeCopied" : "documentCopied");
    } catch {
      link.select();
      status.textContent = text("manualCopy");
    }
  };
  button("shareDocument", () => share(false));
  button("shareRecipe", () => share(true));
  box.append(status, link);
  let replayWorker: Worker | undefined, replayTimer: ReturnType<typeof setTimeout> | undefined;
  const stopReplay = () => {
    scope.invalidate("vector-replay");
    replayWorker?.terminate();
    replayWorker = undefined;
    if (replayTimer !== undefined) clearTimeout(replayTimer);
    replayTimer = undefined;
  };
  scope.own(stopReplay);
  scope.listen(box, "click", stopReplay, { capture: true });
  scope.listen(box, "input", stopReplay, { capture: true });
  return {
    rendered,
    refresh() {
      rendered(read());
    },
    replay(recipe: VectorRecipe, commit: (doc: VectorCityDocument) => void) {
      stopReplay();
      const current = scope.ticket("vector-replay"),
        initial = JSON.stringify(read());
      status.textContent = text("loading");
      const worker = new Worker(new URL("../../services/vectorRecipeWorker.ts", import.meta.url), { type: "module" });
      replayWorker = worker;
      replayTimer = setTimeout(() => {
        worker.terminate();
        if (current()) status.textContent = text("failed");
      }, 60000);
      worker.onmessage = ({ data }) => {
        worker.terminate();
        if (replayTimer !== undefined) clearTimeout(replayTimer);
        if (replayWorker === worker) replayWorker = undefined;
        if (!current() || initial !== JSON.stringify(read())) return;
        if (data.error) {
          status.textContent = text("failed");
          return;
        }
        try {
          assertVectorDocument(data.document);
          commit(data.document);
        } catch {
          status.textContent = text("failed");
        }
      };
      worker.onerror = worker.onmessageerror = () => {
        worker.terminate();
        if (replayTimer !== undefined) clearTimeout(replayTimer);
        if (current()) status.textContent = text("failed");
      };
      worker.postMessage(recipe);
    }
  };
}
