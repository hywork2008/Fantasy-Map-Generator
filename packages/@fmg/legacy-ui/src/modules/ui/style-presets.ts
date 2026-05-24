// UI module to control the style presets
"use strict";

import { selectStyleElement, updateElements } from "./style";
/// <reference path="../../types/ui-legacy-globals.d.ts" />

type StyleAttributeValue = string | number | null;
type StyleAttributes = Record<string, StyleAttributeValue>;
type StylePresetData = Record<string, StyleAttributes>;

type StylePresetRuntime = typeof globalThis & {
  VERSION: string;
  $: (selector: string | HTMLElement) => {dialog: (actionOrOptions: unknown) => void};
};

const stylePresetsRuntime = globalThis as StylePresetRuntime;

const systemPresets = [
  "default",
  "ancient",
  "gloom",
  "pale",
  "light",
  "watercolor",
  "clean",
  "atlas",
  "darkSeas",
  "cyberpunk",
  "night",
  "monochrome"
];
const customPresetPrefix = "fmgStyle_";

{
  const systemOptions = systemPresets.map(styleName => `<option value="${styleName}">${styleName}</option>`);
  const storedStyles = Object.keys(localStorage).filter(key => key.startsWith(customPresetPrefix));
  const customOptions = storedStyles.map(
    styleName => `<option value="${styleName}">${styleName.replace(customPresetPrefix, "")} [custom]</option>`
  );
  const options = systemOptions.join("") + customOptions.join("");
  stylePreset.innerHTML = options;
}

export async function applyStyleOnLoad() {
  const desiredPreset = localStorage.getItem("presetStyle") || "default";
  const styleData = await getStylePreset(desiredPreset);
  const [appliedPreset, style] = styleData;

  applyStyle(style);
  updateMapFilter();
  stylePreset.value = stylePreset.dataset.old = appliedPreset;
  setPresetRemoveButtonVisibiliy();
}

async function getStylePreset(desiredPreset: string): Promise<[string, StylePresetData]> {
  let presetToLoad = desiredPreset;

  const isCustom = !systemPresets.includes(desiredPreset);
  if (isCustom) {
    const storedStyleJSON = localStorage.getItem(desiredPreset);
    if (!storedStyleJSON) {
      ERROR && console.error(`Custom style ${desiredPreset} in not found in localStorage. Applying default style`);
      presetToLoad = "default";
    } else {
      const isValid = JSON.isValid(storedStyleJSON);
      if (isValid) return [desiredPreset, JSON.parse(storedStyleJSON)];

      ERROR &&
        console.error(`Custom style ${desiredPreset} stored in localStorage is not valid. Applying default style`);
      presetToLoad = "default";
    }
  }

  const style = await fetchSystemPreset(presetToLoad);
  return [presetToLoad, style];
}

async function fetchSystemPreset(preset: string): Promise<StylePresetData> {
  try {
    const res = await fetch(`./styles/${preset}.json?v=${stylePresetsRuntime.VERSION}`);
    return await res.json();
  } catch {
    throw new Error(`Cannot fetch style preset: ${preset}`);
  }
}

export function applyStyle(styleJSON: StylePresetData) {
  for (const selector in styleJSON) {
    if (selector.startsWith("#burgLabels")) {
      const group = selector.split("#").pop() || "";
      style.burgLabels[group] = styleJSON[selector] as unknown as Record<string, string>;
    }

    if (selector.startsWith("#burgIcons")) {
      const group = selector.split("#").pop() || "";
      style.burgIcons[group] = styleJSON[selector] as unknown as Record<string, string>;
    }

    if (selector.startsWith("#anchors")) {
      const group = selector.split("#").pop() || "";
      style.anchors[group] = styleJSON[selector] as unknown as Record<string, string>;
    }

    const el = document.querySelector(selector);
    if (!el) continue;

    for (const attribute in styleJSON[selector]) {
      const value = styleJSON[selector][attribute];

      if (value === "null" || value === null) {
        el.removeAttribute(attribute);
        continue;
      }

      const attributeValue = String(value);
      el.setAttribute(attribute, attributeValue);

      if (selector === "#texture") {
        const image = document.querySelector("#texture > image");
        if (image) {
          if (attribute === "data-x") image.setAttribute("x", attributeValue);
          if (attribute === "data-y") image.setAttribute("y", attributeValue);
          if (attribute === "data-href") image.setAttribute("href", attributeValue);
        }
      }

      if (selector === "#terrs" && attribute === "scheme" && typeof value === "string" && !(value in heightmapColorSchemes)) {
        addCustomColorScheme(value);
      }
    }
  }
}

export function requestStylePresetChange(preset: string) {
  const isConfirmed = sessionStorage.getItem("styleChangeConfirmed");
  if (isConfirmed) return changeStyle(preset);

  confirmationDialog({
    title: "Change style preset",
    message: "Are you sure you want to change the style preset? All unsaved style changes will be lost",
    confirm: "Change",
    onConfirm: () => {
      sessionStorage.setItem("styleChangeConfirmed", "true");
      changeStyle(preset);
    },
    onCancel: () => {
      stylePreset.value = stylePreset.dataset.old;
    }
  });
}

export async function changeStyle(desiredPreset: string) {
  const styleData = await getStylePreset(desiredPreset);
  const [presetName, style] = styleData;
  localStorage.setItem("presetStyle", presetName);
  applyStyleWithUiRefresh(style);
  if (layerIsOn("toggleBurgIcons")) drawBurgIcons();
  if (layerIsOn("toggleLabels")) {
    drawBurgLabels();
    drawStateLabels();
  }
}

export function applyStyleWithUiRefresh(style: StylePresetData) {
  applyStyle(style);
  updateElements();
  selectStyleElement();
  updateMapFilter();
  stylePreset.dataset.old = stylePreset.value;

  invokeActiveZooming();
  setPresetRemoveButtonVisibiliy();

  drawScaleBar(scaleBar, scale);
  fitScaleBar(scaleBar, svgWidth, svgHeight);
}

export function addStylePreset() {
  stylePresetsRuntime.$("#styleSaver").dialog({
    title: "Style Saver",
    width: "26em",
    position: {my: "center", at: "center", of: "svg"}
  });

  const styleName = stylePreset.value.replace(customPresetPrefix, "");
  styleSaverName.value = styleName;
  styleSaverJSON.value = JSON.stringify(collectStyleData(), null, 2);
  checkName();

  if (modules.saveStyle) return;
  modules.saveStyle = true;

  document.getElementById("styleSaverName").addEventListener("input", checkName);
  document.getElementById("styleSaverSave").addEventListener("click", saveStyle);
  document.getElementById("styleSaverDownload").addEventListener("click", styleDownload);
  document.getElementById("styleSaverLoad").addEventListener("click", () => styleToLoad.click());
  document.getElementById("styleToLoad").addEventListener("change", loadStyleFile);

  function collectStyleData(): StylePresetData {
    const style: StylePresetData = {};
    const attributes = {
      "#map": ["background-color", "filter", "data-filter"],
      "#armies": ["font-size", "box-size", "stroke", "stroke-width", "fill-opacity", "filter"],
      "#biomes": ["opacity", "filter", "mask"],
      "#stateBorders": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
      "#provinceBorders": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
      "#cells": ["opacity", "stroke", "stroke-width", "filter", "mask"],
      "#gridOverlay": [
        "opacity",
        "scale",
        "dx",
        "dy",
        "type",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linecap",
        "transform",
        "filter",
        "mask"
      ],
      "#coordinates": [
        "opacity",
        "data-size",
        "font-size",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linecap",
        "filter",
        "mask"
      ],
      "#compass": ["opacity", "transform", "filter", "mask", "shape-rendering"],
      "#compass > use": ["transform"],
      "#relig": ["opacity", "stroke", "stroke-width", "filter"],
      "#cults": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
      "#landmass": ["opacity", "fill", "filter"],
      "#markers": ["opacity", "rescale", "filter"],
      "#prec": ["opacity", "stroke", "stroke-width", "fill", "filter"],
      "#population": ["opacity", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter"],
      "#rural": ["stroke"],
      "#urban": ["stroke"],
      "#freshwater": ["opacity", "fill", "stroke", "stroke-width", "filter"],
      "#salt": ["opacity", "fill", "stroke", "stroke-width", "filter"],
      "#sinkhole": ["opacity", "fill", "stroke", "stroke-width", "filter"],
      "#frozen": ["opacity", "fill", "stroke", "stroke-width", "filter"],
      "#lava": ["opacity", "fill", "stroke", "stroke-width", "filter"],
      "#dry": ["opacity", "fill", "stroke", "stroke-width", "filter"],
      "#sea_island": ["opacity", "stroke", "stroke-width", "filter", "auto-filter"],
      "#lake_island": ["opacity", "stroke", "stroke-width", "filter"],
      "#terrain": ["opacity", "set", "size", "density", "filter", "mask"],
      "#rivers": ["opacity", "filter", "fill"],
      "#ruler": ["opacity", "filter"],
      "#roads": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
      "#trails": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
      "#searoutes": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
      "#statesBody": ["opacity", "filter"],
      "#statesHalo": ["opacity", "data-width", "stroke-width", "filter"],
      "#provs": ["opacity", "fill", "font-size", "font-family", "filter"],
      "#temperature": [
        "opacity",
        "font-size",
        "fill",
        "fill-opacity",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linecap",
        "filter"
      ],
      "#ice": ["opacity", "fill", "stroke", "stroke-width", "filter"],
      "#emblems": ["opacity", "stroke-width", "filter"],
      "#emblems > #stateEmblems": ["data-size"],
      "#emblems > #provinceEmblems": ["data-size"],
      "#emblems > #burgEmblems": ["data-size"],
      "#texture": ["opacity", "filter", "mask", "data-x", "data-y", "data-href"],
      "#zones": ["opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "filter", "mask"],
      "#oceanLayers": ["filter", "layers"],
      "#oceanBase": ["fill"],
      "#oceanicPattern": ["href", "opacity"],
      "#terrs #oceanHeights": [
        "data-render",
        "opacity",
        "scheme",
        "terracing",
        "skip",
        "relax",
        "curve",
        "filter",
        "mask"
      ],
      "#terrs #landHeights": ["opacity", "scheme", "terracing", "skip", "relax", "curve", "filter", "mask"],
      "#legend": [
        "data-size",
        "font-size",
        "font-family",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "stroke-linecap",
        "data-x",
        "data-y",
        "data-columns"
      ],
      "#legendBox": ["fill", "fill-opacity"],
      "#labels > #states": [
        "opacity",
        "fill",
        "stroke",
        "stroke-width",
        "style",
        "letter-spacing",
        "data-size",
        "font-size",
        "font-family",
        "filter"
      ],
      "#labels > #addedLabels": [
        "opacity",
        "fill",
        "stroke",
        "stroke-width",
        "style",
        "letter-spacing",
        "data-size",
        "font-size",
        "font-family",
        "filter"
      ],
      "#fogging": ["opacity", "fill", "filter"],
      "#vignette": ["opacity", "fill", "filter"],
      "#vignette-rect": ["x", "y", "width", "height", "rx", "ry", "filter"],
      "#scaleBar": ["opacity", "fill", "font-size", "data-bar-size", "data-x", "data-y", "data-label"],
      "#scaleBarBack": [
        "opacity",
        "fill",
        "stroke",
        "stroke-width",
        "filter",
        "data-top",
        "data-right",
        "data-bottom",
        "data-left"
      ]
    };

    const burgLabelsAttributes = [
      "opacity",
      "fill",
      "stroke",
      "stroke-width",
      "style",
      "letter-spacing",
      "data-size",
      "font-size",
      "font-family",
      "data-dx",
      "data-dy"
    ];
    const burgIconsAttributes = [
      "opacity",
      "data-icon",
      "font-size",
      "fill",
      "fill-opacity",
      "stroke",
      "stroke-width",
      "stroke-dasharray",
      "stroke-linecap",
      "stroke-linejoin",
      "filter"
    ];
    const anchorsAttributes = ["opacity", "fill", "font-size", "stroke", "stroke-width", "filter"];
    options.burgs.groups.forEach(({name}) => {
      attributes[`#burgLabels > g#${name}`] = burgLabelsAttributes;
      attributes[`#burgIcons > g#${name}`] = burgIconsAttributes;
      attributes[`#anchors > g#${name}`] = anchorsAttributes;
    });

    for (const selector in attributes) {
      const el = document.querySelector(selector);
      if (!el) continue;

      style[selector] = {};
      for (const attr of attributes[selector]) {
        let value = (el as Element & {style: CSSStyleDeclaration}).style[attr] || el.getAttribute(attr);
        if (attr === "font-size" && el.hasAttribute("data-size")) value = el.getAttribute("data-size");
        style[selector][attr] = parseValue(value);
      }
    }

    function parseValue(value: string | null): StyleAttributeValue {
      if (value === "null" || value === null) return null;
      if (value === "") return "";
      if (!isNaN(+value)) return +value;
      return value;
    }

    return style;
  }

  function checkName() {
    const styleName = customPresetPrefix + styleSaverName.value;

    const isSystem = systemPresets.includes(styleName) || systemPresets.includes(styleSaverName.value);
    if (isSystem) return (styleSaverTip.innerHTML = "default");

    const isExisting = Array.from(stylePreset.options).some((option: HTMLOptionElement) => option.value == styleName);
    if (isExisting) return (styleSaverTip.innerHTML = "existing");

    styleSaverTip.innerHTML = "new";
  }

  function saveStyle() {
    const styleJSON = styleSaverJSON.value;
    const desiredName = styleSaverName.value;

    if (!styleJSON) return tip("Please provide a style JSON", false, "error");
    if (!JSON.isValid(styleJSON)) return tip("JSON string is not valid, please check the format", false, "error");
    if (!desiredName) return tip("Please provide a preset name", false, "error");
    if (styleSaverTip.innerHTML === "default")
      return tip("You cannot overwrite default preset, please change the name", false, "error");

    const presetName = customPresetPrefix + desiredName;
    applyOption(stylePreset, presetName, desiredName + " [custom]");
    localStorage.setItem("presetStyle", presetName);
    localStorage.setItem(presetName, styleJSON);

    applyStyleWithUiRefresh(JSON.parse(styleJSON));
    tip("Style preset is saved and applied", false, "success", 4000);
    stylePresetsRuntime.$("#styleSaver").dialog("close");
  }

  function styleDownload() {
    const styleJSON = styleSaverJSON.value;
    const styleName = styleSaverName.value;

    if (!styleJSON) return tip("Please provide a style JSON", false, "error");
    if (!JSON.isValid(styleJSON)) return tip("JSON string is not valid, please check the format", false, "error");
    if (!styleName) return tip("Please provide a preset name", false, "error");

    downloadFile(styleJSON, styleName + ".json");
  }

  function loadStyleFile(this: HTMLInputElement) {
    const fileName = this.files?.[0]?.name.replace(/\.[^.]*$/, "") || "";
    uploadFile(this, styleUpload);

    function styleUpload(dataLoaded: string) {
      if (!dataLoaded) return tip("Cannot load the file. Please check the data format", false, "error");
      const isValid = JSON.isValid(dataLoaded);
      if (!isValid) return tip("Loaded data is not a valid JSON, please check the format", false, "error");

      styleSaverJSON.value = JSON.stringify(JSON.parse(dataLoaded), null, 2);
      styleSaverName.value = fileName;
      checkName();
      tip("Style preset is uploaded", false, "success", 4000);
    }
  }
}

export function requestRemoveStylePreset() {
  const isDefault = systemPresets.includes(stylePreset.value);
  if (isDefault) return tip("Cannot remove system preset", false, "error");

  confirmationDialog({
    title: "Remove style preset",
    message: "Are you sure you want to remove the style preset? This action cannot be undone.",
    confirm: "Remove",
    onConfirm: removeStylePreset
  });
}

function removeStylePreset() {
  localStorage.removeItem("presetStyle");
  localStorage.removeItem(stylePreset.value);
  stylePreset.selectedOptions[0].remove();

  changeStyle("default");
}

function updateMapFilter() {
  const filter = svg.attr("data-filter");
  mapFilters.querySelectorAll(".pressed").forEach(button => button.classList.remove("pressed"));
  if (!filter) return;
  mapFilters.querySelector("#" + filter)?.classList.add("pressed");
}

function setPresetRemoveButtonVisibiliy() {
  const isDefault = systemPresets.includes(stylePreset.value);
  removeStyleButton.style.display = isDefault ? "none" : "inline-block";
}

