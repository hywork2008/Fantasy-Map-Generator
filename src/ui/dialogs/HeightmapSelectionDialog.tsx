import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { confirmationDialog } from "../../controllers/editors";
import {
  buildPrecreatedPreview,
  buildTemplatePreview,
  computeGraph,
  getOrComputeGraph,
  INITIAL_COLOR_SCHEME
} from "../../controllers/heightmap-selection";
import { editHeightmap } from "../../controllers/heightmapEditor";
import { regeneratePrompt } from "../../controllers/options";
import { heightmapTemplates, precreatedHeightmaps } from "../../data";
import { generationProgressStore, useGenerationProgressState } from "../../store/generationProgressState";
import { useOptionsState } from "../../store/optionsState";
import { generateSeed } from "../../utils";
import { heightmapColorSchemes } from "../../utils/colorUtils";
import { lock } from "../../utils/domUtils";
import { IconButton } from "../components/IconButton";
import { closeDialog } from "./dialogService";

interface HeightmapItem {
  id: string;
  name: string;
  dataUrl: string;
  seed: string;
  isTemplate: boolean;
  averageLandPercentage?: number;
}

const localStyle = `
  .heightmap-selection-dialog { width: min(78rem, calc(100vw - 2rem)); }
  .heightmap-selection-dialog > .fmg-dialog-content {
    display: flex;
    overflow: hidden;
  }
  .heightmap-selection {
    display: grid;
    flex: 1;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-height: 0;
  }
  .heightmap-selection_tabs {
    display: flex;
    gap: 0.25em;
    padding: 0.55em 0.7em 0;
    border-bottom: 1px solid color-mix(in srgb, var(--dark-solid) 30%, transparent);
  }
  .heightmap-selection_tabs button {
    border: 0;
    border-bottom: 2px solid transparent;
    padding: 0.45em 0.7em;
    color: color-mix(in srgb, var(--dark-solid) 68%, transparent);
    background: transparent;
  }
  .heightmap-selection_tabs button[aria-selected="true"] {
    border-bottom-color: #8a5d22;
    color: var(--dark-solid);
    font-weight: 700;
  }
  .heightmap-selection_catalog {
    min-height: 0;
    overflow: auto;
    padding: 0.7em;
  }
  .heightmap-selection_catalog h1 { margin: 0 0 0.45em; font-size: 1.1em; }
  .heightmap-selection_container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }
  @media (max-width: 600px) {
    .heightmap-selection_container { grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 4px; }
  }
  @media (min-width: 2000px) {
    .heightmap-selection_container { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
  }
  .heightmap-selection_footer {
    display: grid;
    gap: 0.55em;
    padding: 0.65em 0.7em 0.7em;
    border-top: 1px solid color-mix(in srgb, var(--dark-solid) 30%, transparent);
    background: var(--bg-lighter);
  }
  .heightmap-selection_footer h2 {
    margin: 0;
    font-size: 0.8em;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .heightmap-selection_options {
    display: grid;
    grid-template-columns: 2fr 1fr;
  }
  .heightmap-selection_options > div:first-child {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    align-items: center;
    justify-self: start;
    justify-items: start;
  }
  @media (max-width: 600px) {
    .heightmap-selection_options { grid-template-columns: 3fr 1fr; }
    .heightmap-selection_options > div:first-child { display: block; }
  }
  .heightmap-selection_options > div:last-child { justify-self: end; }
  .heightmap-selection_actions { display: flex; justify-content: flex-end; gap: 0.4em; }
  .heightmap-selection_stage-note { margin: 0; font-size: 0.85em; }
  .heightmap-selection article {
    padding: 4px; border-radius: 8px;
    transition: all 0.1s ease-in-out;
    filter: drop-shadow(1px 1px 4px #999);
    cursor: pointer;
  }
  .heightmap-selection article:hover {
    background-color: #ddd;
    filter: drop-shadow(1px 1px 8px #999);
  }
  .heightmap-selection article.selected {
    background-color: #ccc;
    outline: 1px solid var(--dark-solid);
    filter: drop-shadow(1px 1px 8px #999);
  }
  .heightmap-selection article > div { display: flex; justify-content: space-between; padding: 2px 1px; }
  .heightmap-selection article > img { width: 100%; border-radius: 8px; object-fit: fill; }
  .heightmap-selection_landmass { display: block; padding: 0 1px; color: #555; font-size: 0.8em; }
  .heightmap-selection article .regeneratePreview {
    outline: 1px solid #bbb; padding: 1px 3px; border-radius: 4px;
    transition: all 0.1s ease-in-out;
  }
  .heightmap-selection article .regeneratePreview:hover { outline: 1px solid #666; }
  .heightmap-selection article .regeneratePreview:active {
    outline: 1px solid #333; color: #000; transform: rotate(45deg);
  }
`;

export const HeightmapSelectionContent: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [items, setItems] = useState<HeightmapItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [activeCatalog, setActiveCatalog] = useState<"templates" | "precreated">("templates");
  const [colorScheme, setColorScheme] = useState<string>(INITIAL_COLOR_SCHEME);
  const [renderOcean, setRenderOcean] = useState<boolean>(false);
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);

  const aspectRatio = `${worldContext.graphWidth ?? 1}/${worldContext.graphHeight ?? 1}`;

  const loadPrecreated = useCallback((currentItems: HeightmapItem[], scheme: string, ocean: boolean) => {
    for (const item of currentItems.filter(i => !i.isTemplate)) {
      buildPrecreatedPreview(item.id, scheme, ocean).then(dataUrl => {
        setItems(prev => prev.map(i => (i.id === item.id ? { ...i, dataUrl } : i)));
      });
    }
  }, []);

  // Initialize items when dialog opens — colorScheme/renderOcean are intentionally
  // excluded: initial render uses their values at open time; subsequent changes go
  // through handleRedrawAll which has direct access to the latest values.
  useEffect(() => {
    const initialTemplate =
      (useOptionsState.getState() as { options?: { template?: string } }).options?.template ??
      Object.keys(heightmapTemplates)[0] ??
      "";

    setSelectedId(initialTemplate);

    const templateItems: HeightmapItem[] = Object.keys(heightmapTemplates).map(id => {
      const seed = generateSeed();
      const dataUrl = buildTemplatePreview(id, seed, colorScheme, renderOcean);
      return {
        id,
        name: heightmapTemplates[id].name,
        dataUrl,
        seed,
        isTemplate: true,
        averageLandPercentage: heightmapTemplates[id].averageLandPercentage
      };
    });

    const precreatedItems: HeightmapItem[] = Object.keys(precreatedHeightmaps).map(id => ({
      id,
      name: precreatedHeightmaps[id].name,
      dataUrl: "",
      seed: generateSeed(),
      isTemplate: false
    }));

    const allItems = [...templateItems, ...precreatedItems];
    setItems(allItems);
    loadPrecreated(allItems, colorScheme, renderOcean);
  }, [loadPrecreated, colorScheme, renderOcean]);

  // Redraw all when options change (but not on first open)
  function handleRedrawAll(scheme: string, ocean: boolean): void {
    computeGraph(getOrComputeGraph());

    setItems(prev => {
      const updated = prev.map(item => {
        if (!item.isTemplate) return { ...item, dataUrl: "" };
        const dataUrl = buildTemplatePreview(item.id, item.seed, scheme, ocean);
        return { ...item, dataUrl };
      });
      loadPrecreated(updated, scheme, ocean);
      return updated;
    });
  }

  function handleColorSchemeChange(scheme: string): void {
    setColorScheme(scheme);
    handleRedrawAll(scheme, renderOcean);
  }

  function handleRenderOceanChange(ocean: boolean): void {
    setRenderOcean(ocean);
    handleRedrawAll(colorScheme, ocean);
  }

  function handleRegenerate(id: string, e: React.MouseEvent): void {
    e.stopPropagation();
    const newSeed = generateSeed();
    const dataUrl = buildTemplatePreview(id, newSeed, colorScheme, renderOcean);
    setItems(prev => prev.map(item => (item.id === id ? { ...item, dataUrl, seed: newSeed } : item)));
  }

  function handleSelect(): void {
    useOptionsState.getState().setOption("template", selectedId);
    // Selecting a template explicitly is an intentional pin — lock it so the
    // "Heightmap" row keeps this choice on subsequent randomized regenerations.
    lock("template");
    closeDialog("heightmapSelection");

    // Map generation currently paused for stage review: everything staged so far was
    // built on the old heightmap, so re-run the Landscape stage immediately instead of
    // leaving the user to separately press "Generate another landscape".
    const { isOpen, isGenerating } = generationProgressStore.getState();
    if (isOpen && !isGenerating) {
      generationProgressStore.getState().retryLandscape();
    }
  }

  function handleNewMap(): void {
    const item = items.find(i => i.id === selectedId);
    useOptionsState.getState().setOption("template", selectedId);
    closeDialog("heightmapSelection");
    regeneratePrompt({ seed: item?.seed });
  }

  function handleEditTemplates(): void {
    confirmationDialog({
      title: "Open Template Editor",
      message: "Opening the tool will erase the current map. Are you sure you want to proceed?",
      confirm: "Continue",
      onConfirm: () => editHeightmap({ mode: "erase", tool: "templateEditor" })
    });
  }

  function handleImportHeightmap(): void {
    confirmationDialog({
      title: "Open Image Converter",
      message: "Opening the tool will erase the current map. Are you sure you want to proceed?",
      confirm: "Continue",
      onConfirm: () => editHeightmap({ mode: "erase", tool: "imageConverter" })
    });
  }

  const templateItems = items.filter(i => i.isTemplate);
  const precreatedItems = items.filter(i => !i.isTemplate);
  const isTemplateCatalog = activeCatalog === "templates";

  return (
    <div className="heightmap-selection" id="heightmapSelectionDialog">
      <style>{localStyle}</style>
      <div className="heightmap-selection_tabs" role="tablist" aria-label="Heightmap source">
        <button
          id="heightmapTemplatesTab"
          type="button"
          role="tab"
          aria-selected={isTemplateCatalog}
          aria-controls="heightmapTemplatesPanel"
          onClick={() => setActiveCatalog("templates")}
        >
          Heightmap templates
        </button>
        <button
          id="precreatedHeightmapsTab"
          type="button"
          role="tab"
          aria-selected={!isTemplateCatalog}
          aria-controls="precreatedHeightmapsPanel"
          onClick={() => setActiveCatalog("precreated")}
        >
          Precreated heightmaps
        </button>
      </div>

      <div className="heightmap-selection_catalog">
        {isTemplateCatalog ? (
          <section
            id="heightmapTemplatesPanel"
            role="tabpanel"
            aria-labelledby="heightmapTemplatesTab"
            data-tip="Select heightmap template – template provides unique, but similar-looking maps on generation"
          >
            <h1>Heightmap templates</h1>
            <div className="heightmap-selection_container">
              {templateItems.map(item => {
                const { averageLandPercentage } = item;
                return (
                  <article
                    key={item.id}
                    data-id={item.id}
                    className={item.id === selectedId ? "selected" : ""}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <img src={item.dataUrl || undefined} alt={item.name} style={{ aspectRatio }} />
                    <div>
                      {item.name}
                      <IconButton
                        data-tip="Regenerate preview"
                        className="icon-cw regeneratePreview"
                        onClick={e => handleRegenerate(item.id, e)}
                      />
                    </div>
                    {averageLandPercentage !== undefined && (
                      <small className="heightmap-selection_landmass">
                        Average: {averageLandPercentage}% land · {100 - averageLandPercentage}% ocean
                      </small>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section
            id="precreatedHeightmapsPanel"
            role="tabpanel"
            aria-labelledby="precreatedHeightmapsTab"
            data-tip="Select precreated heightmap – it will be the same for each map"
          >
            <h1>Precreated heightmaps</h1>
            <div className="heightmap-selection_container">
              {precreatedItems.map(item => (
                <article
                  key={item.id}
                  data-id={item.id}
                  className={item.id === selectedId ? "selected" : ""}
                  onClick={() => setSelectedId(item.id)}
                >
                  <img src={item.dataUrl || undefined} alt={item.name} style={{ aspectRatio }} />
                  <div>{item.name}</div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="heightmap-selection_footer">
        {isMapGenerationInProgress && (
          <p className="heightmap-selection_stage-note">
            Select a template, then choose "Generate another landscape" in Build map to apply it.
          </p>
        )}
        <section aria-label="Preview options">
          <h2>Options</h2>
          <div className="heightmap-selection_options">
            <div>
              <button
                type="button"
                data-tip="Rerender all preview images"
                className="checkbox-label"
                onClick={() => handleRedrawAll(colorScheme, renderOcean)}
              >
                <i className="icon-cw" /> Redraw preview
              </button>
              <div>
                <input
                  id="heightmapSelectionRenderOcean"
                  className="checkbox"
                  type="checkbox"
                  checked={renderOcean}
                  onChange={e => handleRenderOceanChange(e.target.checked)}
                />
                <label
                  data-tip="Draw heights of water cells"
                  htmlFor="heightmapSelectionRenderOcean"
                  className="checkbox-label"
                >
                  Render ocean heights
                </label>
              </div>
              <div data-tip="Color scheme used for heightmap preview">
                Color scheme
                <select value={colorScheme} onChange={e => handleColorSchemeChange(e.target.value)}>
                  {Object.keys(heightmapColorSchemes).map(scheme => (
                    <option key={scheme} value={scheme}>
                      {scheme}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <button
                type="button"
                data-tip="Open Template Editor"
                onClick={handleEditTemplates}
                disabled={isMapGenerationInProgress}
              >
                Edit Templates
              </button>
              <button
                type="button"
                data-tip="Open Image Converter"
                onClick={handleImportHeightmap}
                disabled={isMapGenerationInProgress}
              >
                Import Heightmap
              </button>
            </div>
          </div>
        </section>

        <div className="heightmap-selection_actions">
          <button type="button" onClick={onClose || (() => closeDialog("heightmapSelection"))}>
            Cancel
          </button>
          <button type="button" onClick={handleSelect} disabled={!selectedId}>
            Select
          </button>
          <button type="button" onClick={handleNewMap} disabled={!selectedId || isMapGenerationInProgress}>
            New Map
          </button>
        </div>
      </footer>
    </div>
  );
};
