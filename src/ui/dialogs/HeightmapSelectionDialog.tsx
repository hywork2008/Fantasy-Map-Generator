import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { confirmationDialog } from "../../controllers/editors";
import { editHeightmap } from "../../controllers/heightmap-editor";
import {
  buildPrecreatedPreview,
  buildTemplatePreview,
  computeGraph,
  getOrComputeGraph,
  INITIAL_COLOR_SCHEME
} from "../../controllers/heightmap-selection";
import { regeneratePrompt } from "../../controllers/options";
import { heightmapTemplates, precreatedHeightmaps } from "../../data";
import { useOptionsState } from "../../store/optionsState";
import { generateSeed } from "../../utils";
import { heightmapColorSchemes } from "../../utils/colorUtils";
import { closeDialog } from "./dialogService";

interface HeightmapItem {
  id: string;
  name: string;
  dataUrl: string;
  seed: string;
  isTemplate: boolean;
}

const localStyle = `
  .heightmap-selection { display: flex; flex-direction: column; gap: 0.5em; }
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
  const [colorScheme, setColorScheme] = useState<string>(INITIAL_COLOR_SCHEME);
  const [renderOcean, setRenderOcean] = useState<boolean>(false);

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
      return { id, name: heightmapTemplates[id].name, dataUrl, seed, isTemplate: true };
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
    closeDialog("heightmapSelection");
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

  return (
    <div className="heightmap-selection" id="heightmapSelectionDialog">
      <style>{localStyle}</style>
      <div className="heightmap-selection">
        <section data-tip="Select heightmap template – template provides unique, but similar-looking maps on generation">
          <header>
            <h1>Heightmap templates</h1>
          </header>
          <div className="heightmap-selection_container">
            {templateItems.map(item => (
              <article
                key={item.id}
                data-id={item.id}
                className={item.id === selectedId ? "selected" : ""}
                onClick={() => setSelectedId(item.id)}
              >
                <img src={item.dataUrl || undefined} alt={item.name} style={{ aspectRatio }} />
                <div>
                  {item.name}
                  <span
                    data-tip="Regenerate preview"
                    className="icon-cw regeneratePreview"
                    onClick={e => handleRegenerate(item.id, e)}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section data-tip="Select precreated heightmap – it will be the same for each map">
          <header>
            <h1>Precreated heightmaps</h1>
          </header>
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

        <section>
          <header>
            <h1>Options</h1>
          </header>
          <div className="heightmap-selection_options">
            <div>
              <button
                type="button"
                data-tip="Rerender all preview images"
                className="checkbox-label"
                style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}
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
              <button type="button" data-tip="Open Template Editor" onClick={handleEditTemplates}>
                Edit Templates
              </button>
              <button type="button" data-tip="Open Image Converter" onClick={handleImportHeightmap}>
                Import Heightmap
              </button>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5em", paddingTop: "0.5em" }}>
          <button type="button" onClick={onClose || (() => closeDialog("heightmapSelection"))}>
            Cancel
          </button>
          <button type="button" onClick={handleSelect} disabled={!selectedId}>
            Select
          </button>
          <button type="button" onClick={handleNewMap} disabled={!selectedId}>
            New Map
          </button>
        </div>
      </div>
    </div>
  );
};
