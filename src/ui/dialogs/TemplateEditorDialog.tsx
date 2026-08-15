import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { HeightmapEditorActions } from "../../controllers/heightmapEditor";
import { useDialogState } from "../../store/dialogState";
import { setHeightmapEditorState, type TemplateStep, useHeightmapEditorState } from "../../store/heightmapEditorState";
import { IconButton } from "../components/IconButton";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const generateId = () => Math.random().toString(36).substr(2, 9);

export const TemplateEditorDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("templateEditor"));
  const { templateSteps, templateSelected, templateSeed, templateSeedLocked, canUndo, canRedo } =
    useHeightmapEditorState();
  const templateInputRef = useRef<HTMLInputElement>(null);

  const handleAddStep = (type: string) => {
    const step: TemplateStep = { id: generateId(), type };
    if (["Hill", "Pit", "Range", "Trough"].includes(type)) {
      step.y = "20-80";
      step.x = "15-85";
      step.h = "40-50";
      step.n = "1-2";
    } else if (type === "Strait") {
      step.dist = "vertical";
      step.n = "2-7";
    } else if (type === "Invert") {
      step.dist = "x";
      step.n = "0.5";
    } else if (type === "Mask") {
      step.n = "1";
    } else if (type === "Add") {
      step.dist = "all";
      step.n = "-10";
    } else if (type === "Multiply") {
      step.dist = "all";
      step.n = "1.1";
    } else if (type === "Smooth") {
      step.n = "2";
    }
    setHeightmapEditorState(state => ({ templateSteps: [...state.templateSteps, step] }));
  };

  const handleUpdateStep = (id: string, field: keyof TemplateStep, value: unknown) => {
    setHeightmapEditorState(state => ({
      templateSteps: state.templateSteps.map(s => (s.id === id ? { ...s, [field]: value } : s))
    }));
  };

  const handleRemoveStep = (id: string) => {
    setHeightmapEditorState(state => ({
      templateSteps: state.templateSteps.filter(s => s.id !== id)
    }));
  };

  const handleToggleSkip = (id: string) => {
    setHeightmapEditorState(state => ({
      templateSteps: state.templateSteps.map(s => (s.id === id ? { ...s, skip: !s.skip } : s))
    }));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setHeightmapEditorState(state => {
      const steps = [...state.templateSteps];
      const temp = steps[index - 1];
      steps[index - 1] = steps[index];
      steps[index] = temp;
      return { templateSteps: steps };
    });
  };

  const handleMoveDown = (index: number) => {
    setHeightmapEditorState(state => {
      if (index === state.templateSteps.length - 1) return state;
      const steps = [...state.templateSteps];
      const temp = steps[index + 1];
      steps[index + 1] = steps[index];
      steps[index] = temp;
      return { templateSteps: steps };
    });
  };

  const handleSelectTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    HeightmapEditorActions.changeTemplate(value);
  };

  const renderStep = (step: TemplateStep, index: number) => {
    const common = (
      <>
        <IconButton
          className={step.skip ? "icon-check-empty" : "icon-check"}
          data-tip="Click to skip the step"
          onClick={() => handleToggleSkip(step.id)}
        />
        <div>{step.type}</div>
        <IconButton
          className="icon-trash-empty pointer"
          data-tip="Remove the step"
          onClick={() => handleRemoveStep(step.id)}
        />
        <IconButton className="icon-up-dir pointer" data-tip="Move up" onClick={() => handleMoveUp(index)} />
        <IconButton className="icon-down-dir pointer" data-tip="Move down" onClick={() => handleMoveDown(index)} />
      </>
    );

    if (["Hill", "Pit", "Range", "Trough"].includes(step.type)) {
      return (
        <div key={step.id} data-type={step.type} style={{ opacity: step.skip ? 0.5 : 1 }}>
          {common}
          <span>
            y:
            <input
              className="templateY"
              data-tip="Y axis position in percentage (minY-maxY or Y)"
              value={step.y || ""}
              onChange={e => handleUpdateStep(step.id, "y", e.target.value)}
            />
          </span>
          <span>
            x:
            <input
              className="templateX"
              data-tip="X axis position in percentage (minX-maxX or X)"
              value={step.x || ""}
              onChange={e => handleUpdateStep(step.id, "x", e.target.value)}
            />
          </span>
          <span>
            h:
            <input
              className="templateHeight"
              data-tip="Blob maximum height, use hyphen to get a random number in range"
              value={step.h || ""}
              onChange={e => handleUpdateStep(step.id, "h", e.target.value)}
            />
          </span>
          <span>
            n:
            <input
              className="templateCount"
              data-tip="Blobs to add, use hyphen to get a random number in range"
              value={step.n || ""}
              onChange={e => handleUpdateStep(step.id, "n", e.target.value)}
            />
          </span>
        </div>
      );
    }

    if (step.type === "Strait") {
      return (
        <div key={step.id} data-type={step.type} style={{ opacity: step.skip ? 0.5 : 1 }}>
          {common}
          <span>
            d:
            <select
              className="templateDist"
              data-tip="Strait direction"
              value={step.dist || "vertical"}
              onChange={e => handleUpdateStep(step.id, "dist", e.target.value)}
            >
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
          </span>
          <span>
            w:
            <input
              className="templateCount"
              data-tip="Strait width, use hyphen to get a random number in range"
              value={step.n || ""}
              onChange={e => handleUpdateStep(step.id, "n", e.target.value)}
            />
          </span>
        </div>
      );
    }

    if (step.type === "Invert") {
      return (
        <div key={step.id} data-type={step.type} style={{ opacity: step.skip ? 0.5 : 1 }}>
          {common}
          <span>
            by:
            <select
              className="templateDist"
              data-tip="Mirror heightmap along axis"
              value={step.dist || "x"}
              onChange={e => handleUpdateStep(step.id, "dist", e.target.value)}
            >
              <option value="x">x</option>
              <option value="y">y</option>
              <option value="xy">both</option>
            </select>
          </span>
          <span>
            n:
            <input
              className="templateCount"
              data-tip="Probability of inversion, range 0-1"
              value={step.n || ""}
              onChange={e => handleUpdateStep(step.id, "n", e.target.value)}
            />
          </span>
        </div>
      );
    }

    if (step.type === "Mask") {
      return (
        <div key={step.id} data-type={step.type} style={{ opacity: step.skip ? 0.5 : 1 }}>
          {common}
          <span>
            f:
            <input
              className="templateCount"
              data-tip="Set masking fraction"
              type="number"
              min={-10}
              max={10}
              value={step.n || ""}
              onChange={e => handleUpdateStep(step.id, "n", e.target.value)}
            />
          </span>
        </div>
      );
    }

    if (step.type === "Add" || step.type === "Multiply") {
      return (
        <div key={step.id} data-type={step.type} style={{ opacity: step.skip ? 0.5 : 1 }}>
          {common}
          <span>
            to:
            <select
              className="templateDist"
              data-tip="Change only land or all cells"
              value={step.dist || "all"}
              onChange={e => handleUpdateStep(step.id, "dist", e.target.value)}
            >
              <option value="all">all cells</option>
              <option value="land">land only</option>
              <option value="interval">interval</option>
              {/* Note: In legacy it allowed setting an interval, we will keep it simple here */}
            </select>
          </span>
          <span>
            v:
            <input
              className="templateCount"
              data-tip="Value"
              type="number"
              value={step.n || ""}
              onChange={e => handleUpdateStep(step.id, "n", e.target.value)}
            />
          </span>
        </div>
      );
    }

    if (step.type === "Smooth") {
      return (
        <div key={step.id} data-type={step.type} style={{ opacity: step.skip ? 0.5 : 1 }}>
          {common}
          <span>
            f:
            <input
              className="templateCount"
              data-tip="Set smooth fraction"
              type="number"
              min={1}
              max={10}
              value={step.n || ""}
              onChange={e => handleUpdateStep(step.id, "n", e.target.value)}
            />
          </span>
        </div>
      );
    }

    return null;
  };

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.templateEditor")} onClose={() => closeDialog("templateEditor")}>
      <div id="templateEditorContainer">
        <div>
          <div id="templateTop">
            <i>Select template: </i>
            <select
              id="templateSelect"
              data-tip="Select base template"
              value={templateSelected}
              onChange={handleSelectTemplate}
            >
              <option value="custom">Custom</option>
              <option value="volcano">Volcano</option>
              <option value="highIsland">High Island</option>
              <option value="lowIsland">Low Island</option>
              <option value="continents">Continents</option>
              <option value="archipelago">Archipelago</option>
              <option value="atoll">Atoll</option>
              <option value="mediterranean">Mediterranean</option>
              <option value="peninsula">Peninsula</option>
              <option value="pangea">Pangea</option>
              <option value="isthmus">Isthmus</option>
              <option value="shattered">Shattered</option>
              <option value="taklamakan">Taklamakan</option>
              <option value="oldWorld">Old World</option>
              <option value="fractious">Fractious</option>
            </select>
          </div>
          <div id="templateTools">
            <button data-type="Hill" data-tip="Hill: small blob" type="button" onClick={() => handleAddStep("Hill")}>
              H
            </button>
            <button data-type="Pit" data-tip="Pit: round depression" type="button" onClick={() => handleAddStep("Pit")}>
              P
            </button>
            <button
              data-type="Range"
              data-tip="Range: elongated elevation"
              type="button"
              onClick={() => handleAddStep("Range")}
            >
              R
            </button>
            <button
              data-type="Trough"
              data-tip="Trough: elongated depression"
              type="button"
              onClick={() => handleAddStep("Trough")}
            >
              T
            </button>
            <button
              data-type="Strait"
              data-tip="Strait: centered vertical or horizontal depression"
              type="button"
              onClick={() => handleAddStep("Strait")}
            >
              S
            </button>
            <button
              data-type="Mask"
              data-tip="Mask: lower cells near edges or in map center"
              type="button"
              onClick={() => handleAddStep("Mask")}
            >
              M
            </button>
            <button
              data-type="Invert"
              data-tip="Invert heightmap along the axes"
              type="button"
              onClick={() => handleAddStep("Invert")}
            >
              I
            </button>
            <button
              data-type="Add"
              data-tip="Add or subtract value from all heights in range"
              type="button"
              onClick={() => handleAddStep("Add")}
            >
              +
            </button>
            <button
              data-type="Multiply"
              data-tip="Multiply all heights in range by factor"
              type="button"
              onClick={() => handleAddStep("Multiply")}
            >
              *
            </button>
            <button
              data-type="Smooth"
              data-tip="Smooth the map replacing cell heights by an average values of its neighbors"
              type="button"
              onClick={() => handleAddStep("Smooth")}
            >
              ~
            </button>
          </div>
          <div id="templateBody" className="table">
            {templateSteps.map((step, index) => renderStep(step, index))}
          </div>
          <div id="templateFooter">
            <button
              type="button"
              id="templateRun"
              data-tip="Execute the template"
              className="icon-play-circled2"
              onClick={HeightmapEditorActions.executeTemplate}
            />
            <button
              type="button"
              id="templateUndo"
              data-tip="Undo the latest action"
              className="icon-ccw"
              onClick={HeightmapEditorActions.undoHistory}
              disabled={!canUndo}
            />
            <button
              type="button"
              id="templateRedo"
              data-tip="Redo the action"
              className="icon-cw"
              onClick={HeightmapEditorActions.redoHistory}
              disabled={!canRedo}
            />
            <button
              type="button"
              id="templateSave"
              data-tip="Download the template as a text file"
              className="icon-download"
              onClick={HeightmapEditorActions.downloadTemplate}
            />
            <button
              type="button"
              id="templateLoad"
              data-tip="Open previously downloaded template"
              className="icon-upload"
              onClick={() => templateInputRef.current?.click()}
            />
            <input
              ref={templateInputRef}
              type="file"
              id="templateToLoad"
              className="d-none"
              onChange={e => HeightmapEditorActions.uploadTemplate(e.target as HTMLInputElement)}
            />
            <button
              type="button"
              id="templateCA"
              data-tip="Find or share custom template on Cartography Assets portal"
              className="icon-drafting-compass"
              onClick={() =>
                window.open("https://cartographyassets.com/assets/categories/fantasy-map-generator.99/", "_blank")
              }
            />
            <button
              type="button"
              id="templateTutorial"
              data-tip="Open Template Editor Tutorial"
              className="icon-info"
              onClick={() =>
                window.open("https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Template-Editor", "_blank")
              }
            />
            <label data-tip="Lock seed (click on lock icon) if you want template to generate the same heightmap each time">
              Seed:{" "}
              <input
                id="templateSeed"
                value={templateSeed}
                onChange={e => setHeightmapEditorState({ templateSeed: Number(e.target.value) })}
                type="number"
                min={1}
                max={999999999}
                step={1}
              />
              <i
                data-locked={templateSeedLocked ? 1 : 0}
                id="lock_templateSeed"
                className={templateSeedLocked ? "icon-lock" : "icon-lock-open"}
                onClick={() => setHeightmapEditorState({ templateSeedLocked: !templateSeedLocked })}
              />
            </label>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
