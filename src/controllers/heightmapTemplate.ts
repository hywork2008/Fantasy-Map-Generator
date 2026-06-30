import Alea from "alea";
import { worldContext } from "../context/worldContext";

import { setHeightmapEditorState, type TemplateStep, useHeightmapEditorState } from "../store/heightmapEditorState";
import { createTypedArray, generateSeed } from "../utils";
import { ERROR } from "../utils/debug";
import { downloadFile, uploadFile } from "../utils/editorHelpers";

export interface HeightmapTemplateCallbacks {
  restartHistory: () => void;
  updateHistory: (noStat?: string) => void;
  updateStatistics: () => void;
  mockHeightmap: () => void;
  drawHeightmapPreview: () => void;
  redraw3d: () => void;
}

export function executeTemplate(callbacks: HeightmapTemplateCallbacks): void {
  const state = useHeightmapEditorState.getState();
  const steps = state.templateSteps;
  if (!steps.length) return;

  const currentSeed = state.templateSeed;
  const seed = state.templateSeedLocked && currentSeed ? currentSeed : generateSeed();
  Math.random = Alea(seed);
  if (seed !== currentSeed) {
    setHeightmapEditorState({ templateSeed: Number(seed) });
  }

  worldContext.grid.cells.h = createTypedArray({ maxValue: 100, length: worldContext.grid.points.length });
  GenerationPipeline.HeightmapGenerator.setGraph(worldContext.grid);
  callbacks.restartHistory();

  for (const step of steps) {
    if (step.skip) continue;

    const count = step.n || "";
    const height = step.h || "";
    const dist = step.dist || "";
    const x = step.x || "";
    const y = step.y || "";
    const type = step.type;

    if (type === "Hill") GenerationPipeline.HeightmapGenerator.addHill(count, height, x, y);
    else if (type === "Pit") GenerationPipeline.HeightmapGenerator.addPit(count, height, x, y);
    else if (type === "Range") GenerationPipeline.HeightmapGenerator.addRange(count, height, x, y);
    else if (type === "Trough") GenerationPipeline.HeightmapGenerator.addTrough(count, height, x, y);
    else if (type === "Strait") GenerationPipeline.HeightmapGenerator.addStrait(count, dist);
    else if (type === "Mask") GenerationPipeline.HeightmapGenerator.mask(+count!);
    else if (type === "Invert") GenerationPipeline.HeightmapGenerator.invert(+count!, dist);
    else if (type === "Add") GenerationPipeline.HeightmapGenerator.modify(dist, +count!, 1);
    else if (type === "Multiply") GenerationPipeline.HeightmapGenerator.modify(dist, 0, +count!);
    else if (type === "Smooth") GenerationPipeline.HeightmapGenerator.smooth(+count!);

    worldContext.grid.cells.h = GenerationPipeline.HeightmapGenerator.getHeights()!;
    callbacks.updateHistory("noStat");
  }

  worldContext.grid.cells.h = GenerationPipeline.HeightmapGenerator.getHeights()!;
  callbacks.updateStatistics();
  callbacks.mockHeightmap();
  callbacks.drawHeightmapPreview();
  callbacks.redraw3d();
}

export function downloadTemplate(): void {
  const steps = useHeightmapEditorState.getState().templateSteps;
  if (!steps.length) return;

  let data = "";
  for (const s of steps) {
    if (s.skip) continue;
    const type = s.type;
    const count = s.n || "0";
    const arg3 = s.h || s.dist || "0";
    const x = s.x || "0";
    const y = s.y || "0";
    data += `${type} ${count} ${arg3} ${x} ${y}\r\n`;
  }
  downloadFile(data, `template_${Date.now()}.txt`);
}

export function uploadTemplate(input: HTMLInputElement): void {
  uploadFile(input, (dataLoaded: string) => {
    const lines = dataLoaded.split("\r\n");
    if (!lines.length) {
      tip("Cannot parse the template, please check the file", false, "error");
      return;
    }

    const newSteps = [];
    for (const s of lines) {
      if (!s.trim()) continue;
      const step = s.split(" ");
      if (step.length !== 5) {
        ERROR && console.error("Cannot parse step, wrong arguments count", s);
        continue;
      }

      const type = step[0];
      const n = step[1];
      const arg3 = step[2];
      const x = step[3];
      const y = step[4];

      const newStep: TemplateStep = { id: Math.random().toString(36).substr(2, 9), type };

      if (["Hill", "Pit", "Range", "Trough"].includes(type)) {
        newStep.n = n;
        newStep.h = arg3;
        newStep.x = x;
        newStep.y = y;
      } else if (type === "Strait") {
        newStep.dist = arg3;
        newStep.n = n;
      } else if (type === "Invert") {
        newStep.n = n;
        newStep.dist = arg3;
      } else if (type === "Mask") {
        newStep.n = n;
      } else if (type === "Add" || type === "Multiply") {
        newStep.n = n;
        newStep.dist = arg3;
      } else if (type === "Smooth") {
        newStep.n = n;
      }
      newSteps.push(newStep);
    }

    setHeightmapEditorState({ templateSteps: newSteps, templateSelected: "custom" });
  });
}

import { heightmapTemplates } from "../data";
import { GenerationPipeline } from "../services/generationPipeline";
import { tip } from "../services/tooltipService";

export function changeTemplate(template: string): void {
  const templateString = heightmapTemplates[template]?.template as string | undefined;
  if (!templateString) return;
  const steps = templateString.split("\n");
  if (!steps.length) {
    tip("Heightmap template: no steps defined", false, "error");
    return;
  }

  const newSteps = [];
  for (const step of steps) {
    const elements = step.trim().split(" ");
    if (!elements[0]) continue;

    const type = elements[0];
    const n = elements[1];
    const arg3 = elements[2];
    const x = elements[3];
    const y = elements[4];

    const newStep: TemplateStep = { id: Math.random().toString(36).substr(2, 9), type };
    if (["Hill", "Pit", "Range", "Trough"].includes(type)) {
      newStep.n = n;
      newStep.h = arg3;
      newStep.x = x;
      newStep.y = y;
    } else if (type === "Strait") {
      newStep.dist = arg3;
      newStep.n = n;
    } else if (type === "Invert") {
      newStep.n = n;
      newStep.dist = arg3;
    } else if (type === "Mask") {
      newStep.n = n;
    } else if (type === "Add" || type === "Multiply") {
      newStep.n = n;
      newStep.dist = arg3;
    } else if (type === "Smooth") {
      newStep.n = n;
    }
    newSteps.push(newStep);
  }

  setHeightmapEditorState({ templateSteps: newSteps, templateSelected: template });
}
