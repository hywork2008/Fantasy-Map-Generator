import { useOptionsState } from "./optionsState";

const originalGetElementById = document.getElementById.bind(document);

document.getElementById = (id: string): HTMLElement | null => {
  const optionsStore = useOptionsState.getState();

  const mockElements: Record<string, Partial<HTMLInputElement>> = {
    mapWidthInput: { value: String(optionsStore.mapWidth), valueAsNumber: optionsStore.mapWidth },
    mapHeightInput: { value: String(optionsStore.mapHeight), valueAsNumber: optionsStore.mapHeight },
    pointsInput: {
      value: String(optionsStore.points),
      dataset: { cells: String(optionsStore.points === 4 ? 10000 : optionsStore.points * 2500) }
      // biome-ignore lint/suspicious/noExplicitAny: partial HTMLElement mock
    } as any,
    mapName: { value: optionsStore.mapName },
    yearInput: { value: String(optionsStore.year), valueAsNumber: optionsStore.year },
    eraInput: { value: optionsStore.era },
    templateInput: { value: optionsStore.template },
    statesNumber: {
      value: String(optionsStore.statesNumber),
      valueAsNumber: optionsStore.statesNumber,
      // biome-ignore lint/suspicious/noExplicitAny: partial CSSStyleDeclaration mock
      style: { color: "" } as any
    },
    sizeVariety: { value: String(optionsStore.sizeVariety), valueAsNumber: optionsStore.sizeVariety },
    manorsInput: { value: String(optionsStore.manors), valueAsNumber: optionsStore.manors },
    growthRate: { value: String(optionsStore.growthRate), valueAsNumber: optionsStore.growthRate },
    provincesRatio: { value: String(optionsStore.provincesRatio), valueAsNumber: optionsStore.provincesRatio },
    optionsSeed: { value: optionsStore.seed },
    culturesInput: { value: String(optionsStore.cultures), valueAsNumber: optionsStore.cultures, max: "100" },
    culturesOutput: { value: String(optionsStore.cultures), valueAsNumber: optionsStore.cultures, max: "100" },
    culturesSet: {
      value: optionsStore.culturesSet,
      selectedOptions: [{ dataset: { max: "100" } }]
      // biome-ignore lint/suspicious/noExplicitAny: partial HTMLSelectElement mock
    } as any,
    religionsNumber: { value: String(optionsStore.religionsNumber), valueAsNumber: optionsStore.religionsNumber },
    stateLabelsModeInput: { value: optionsStore.stateLabelsMode },
    manorsOutput: { value: String(optionsStore.manors) },
    uiSize: { value: String(optionsStore.uiSize) },
    tooltipSizeInput: { value: String(optionsStore.tooltipSize), valueAsNumber: optionsStore.tooltipSize },
    themeColorInput: { value: optionsStore.themeColor },
    transparencyInput: { value: String(optionsStore.transparency), valueAsNumber: optionsStore.transparency },
    autosaveIntervalOutput: {
      value: String(optionsStore.autosaveInterval),
      valueAsNumber: optionsStore.autosaveInterval
    },
    onloadBehavior: { value: optionsStore.onloadBehavior },
    azgaarAssistant: { value: optionsStore.azgaarAssistant },
    speakerVoice: { value: optionsStore.speakerVoice },
    emblemShape: {
      value: optionsStore.emblemShape,
      selectedOptions: [{ parentElement: { getAttribute: () => "Diversiform" } }]
      // biome-ignore lint/suspicious/noExplicitAny: partial HTMLSelectElement mock
    } as any,
    shapeRendering: { value: "crispEdges" },
    // biome-ignore lint/suspicious/noExplicitAny: partial HTMLInputElement mock
    rescaleLabels: { checked: true } as any,
    neutralRate: { value: "1", valueAsNumber: 1 },
    statesGrowthRate: { value: "1", valueAsNumber: 1 },
    zoomExtentMin: { value: "1", valueAsNumber: 1 },
    zoomExtentMax: { value: "20", valueAsNumber: 20 },
    populationRateInput: { value: "1000", valueAsNumber: 1000 },
    distanceScaleInput: { value: "3", valueAsNumber: 3 },
    urbanizationInput: { value: "1", valueAsNumber: 1 },
    urbanDensityInput: { value: "10", valueAsNumber: 10 },
    // biome-ignore lint/suspicious/noExplicitAny: partial HTMLElement mock
    toolsContent: { addEventListener: () => {} } as any
  };

  if (id in mockElements) {
    return mockElements[id] as unknown as HTMLElement;
  }

  return originalGetElementById(id);
};

Object.defineProperties(window, {
  mapWidthInput: { get: () => document.getElementById("mapWidthInput") },
  mapHeightInput: { get: () => document.getElementById("mapHeightInput") },
  pointsInput: { get: () => document.getElementById("pointsInput") },
  mapName: { get: () => document.getElementById("mapName") },
  yearInput: { get: () => document.getElementById("yearInput") },
  eraInput: { get: () => document.getElementById("eraInput") },
  templateInput: { get: () => document.getElementById("templateInput") },
  statesNumber: { get: () => document.getElementById("statesNumber") },
  sizeVariety: { get: () => document.getElementById("sizeVariety") },
  manorsInput: { get: () => document.getElementById("manorsInput") },
  growthRate: { get: () => document.getElementById("growthRate") },
  provincesRatio: { get: () => document.getElementById("provincesRatio") },
  optionsSeed: { get: () => document.getElementById("optionsSeed") },
  culturesInput: { get: () => document.getElementById("culturesInput") },
  culturesOutput: { get: () => document.getElementById("culturesOutput") },
  culturesSet: { get: () => document.getElementById("culturesSet") },
  religionsNumber: { get: () => document.getElementById("religionsNumber") },
  stateLabelsModeInput: { get: () => document.getElementById("stateLabelsModeInput") },
  manorsOutput: { get: () => document.getElementById("manorsOutput") },
  uiSize: { get: () => document.getElementById("uiSize") },
  tooltipSizeInput: { get: () => document.getElementById("tooltipSizeInput") },
  themeColorInput: { get: () => document.getElementById("themeColorInput") },
  transparencyInput: { get: () => document.getElementById("transparencyInput") },
  autosaveIntervalOutput: { get: () => document.getElementById("autosaveIntervalOutput") },
  onloadBehavior: { get: () => document.getElementById("onloadBehavior") },
  azgaarAssistant: { get: () => document.getElementById("azgaarAssistant") },
  speakerVoice: { get: () => document.getElementById("speakerVoice") },
  emblemShape: { get: () => document.getElementById("emblemShape") },
  shapeRendering: { get: () => document.getElementById("shapeRendering") },
  rescaleLabels: { get: () => document.getElementById("rescaleLabels") },
  zoomExtentMin: { get: () => document.getElementById("zoomExtentMin") },
  zoomExtentMax: { get: () => document.getElementById("zoomExtentMax") },
  populationRateInput: { get: () => document.getElementById("populationRateInput") },
  distanceScaleInput: { get: () => document.getElementById("distanceScaleInput") },
  urbanizationInput: { get: () => document.getElementById("urbanizationInput") },
  urbanDensityInput: { get: () => document.getElementById("urbanDensityInput") },
  toolsContent: { get: () => document.getElementById("toolsContent") }
});
