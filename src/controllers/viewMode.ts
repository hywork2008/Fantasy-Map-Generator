import { worldContext } from "../context/worldContext";
import { ThreeDRenderer } from "../renderers/three-d-renderer";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules } from "../store/editorState";
import { use3DOptionsStore } from "../store/options3dStore";
import { closeDialog, isDialogOpen, openDialog } from "../ui/dialogs/dialogService";
import { fitContent } from "../utils/domUtils";
import { EditorBus } from "../utils/editorBus";
import { getElementById } from "../utils/nodeUtils";

function getRequiredElementById<T extends Element>(id: string): T {
  const element = getElementById<T>(id);
  if (!element) throw new Error(`Element #${id} is not found`);
  return element;
}

// ─── View mode / 3D ───────────────────────────────────────────────────────────

export function changeViewMode(event: MouseEvent): void {
  const button = event.target as HTMLElement;
  if (button.tagName !== "BUTTON") return;
  const pressed = button.classList.contains("pressed");
  enterStandardView();

  const viewStandardEl = getElementById<HTMLElement>("viewStandard");
  if (!pressed && button.id !== "viewStandard") {
    viewStandardEl?.classList.remove("pressed");
    button.classList.add("pressed");
    enter3dView(button.id);
  }
}

export function enterStandardView(): void {
  const viewModeEl = getElementById<HTMLElement>("viewMode");
  const heightmap3DViewEl = getElementById<HTMLElement>("heightmap3DView");
  const viewStandardEl = getElementById<HTMLElement>("viewStandard");

  viewModeEl?.querySelectorAll(".pressed").forEach(button => {
    button.classList.remove("pressed");
  });
  heightmap3DViewEl?.classList.remove("pressed");
  viewStandardEl?.classList.add("pressed");

  const canvas3d = getElementById<HTMLCanvasElement>("canvas3d");
  if (!canvas3d) return;
  ThreeDRenderer.stop();
  canvas3d.remove();

  const mapEl = getElementById<SVGSVGElement>("map");
  if (mapEl) {
    mapEl.style.visibility = "visible";
    mapEl.style.pointerEvents = "auto";
  }

  if (isDialogOpen("options3d")) closeDialog("options3d");
  if (isDialogOpen("preview3d")) closeDialog("preview3d");
}

async function enter3dView(type: string): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.id = "canvas3d";
  canvas.dataset.type = type;

  if (type === "heightmap3DView") {
    canvas.width = parseFloat(preview3d.style.width) || worldContext.graphWidth / 3;
    canvas.height = canvas.width / (worldContext.graphWidth / worldContext.graphHeight);
    canvas.style.display = "block";
  } else {
    canvas.width = view.svgWidth;
    canvas.height = view.svgHeight;
    canvas.style.position = "absolute";
    canvas.style.display = "none";
    canvas.style.pointerEvents = "auto";
  }

  const started = await ThreeDRenderer.create(canvas, type);
  if (!started) return;

  canvas.style.display = "block";
  canvas.onmouseenter = () => {
    const help = "Drag to pan • Scroll to zoom • Right-click drag to rotate • <b>O</b> to toggle options";
    +(canvas.dataset.hovered ?? 0) > 2 ? tip("") : tip(help);
    canvas.dataset.hovered = String((+(canvas.dataset.hovered ?? 0) | 0) + 1);
  };

  if (type === "heightmap3DView") {
    getRequiredElementById<HTMLElement>("preview3d").appendChild(canvas);
    openDialog("preview3d", {
      title: "3D Preview",

      position: { my: "left bottom", at: "left+10 bottom-20", of: "svg" },
      resizeStop: resize3d,
      onClose: enterStandardView
    });
  } else {
    optionsContainer.parentNode?.insertBefore(canvas, optionsContainer);

    // Hide SVG
    const mapEl = getElementById<SVGSVGElement>("map");
    if (mapEl) {
      mapEl.style.visibility = "hidden";
      mapEl.style.pointerEvents = "none";
    }

    if (typeof EditorBus.unselect === "function") EditorBus.unselect();
  }

  toggle3dOptions();
}

function resize3d(): void {
  const canvas = getElementById<HTMLCanvasElement>("canvas3d");
  if (!canvas) return;
  canvas.width = parseFloat(preview3d.style.width);
  canvas.height = parseFloat(preview3d.style.height) - 2;
  ThreeDRenderer.redraw();
}

export function toggle3dOptions(): void {
  if (isDialogOpen("options3d")) {
    closeDialog("options3d");
    return;
  }
  openDialog("options3d", {
    title: "3D mode settings",

    width: fitContent(),
    position: { my: "right top", at: "right-30 top+10", of: "svg", collision: "fit" }
  });

  setTimeout(() => {
    const addOptions3dListener = (id: string, eventName: string, handler: EventListenerOrEventListenerObject): void => {
      getRequiredElementById<HTMLElement>(id).addEventListener(eventName, handler);
    };

    updateValues();

    if (modules.options3d) return;
    modules.options3d = true;

    addOptions3dListener("options3dUpdate", "click", () => ThreeDRenderer.update());
    addOptions3dListener("options3dSave", "click", ThreeDRenderer.saveScreenshot);
    addOptions3dListener("options3dOBJSave", "click", ThreeDRenderer.saveOBJ);

    addOptions3dListener("options3dScaleRange", "input", changeHeightScale);
    addOptions3dListener("options3dScaleNumber", "change", changeHeightScale);
    addOptions3dListener("options3dLightnessRange", "input", changeLightness);
    addOptions3dListener("options3dLightnessNumber", "change", changeLightness);
    addOptions3dListener("options3dSunX", "change", changeSunPosition);
    addOptions3dListener("options3dSunY", "change", changeSunPosition);
    addOptions3dListener("options3dMeshSkinResolution", "change", changeResolutionScale);
    addOptions3dListener("options3dMeshRotationRange", "input", changeRotation);
    addOptions3dListener("options3dMeshRotationNumber", "change", changeRotation);
    addOptions3dListener("options3dGlobeRotationRange", "input", changeRotation);
    addOptions3dListener("options3dGlobeRotationNumber", "change", changeRotation);
    addOptions3dListener("options3dMeshLabels3d", "change", toggleLabels3d);
    addOptions3dListener("options3dMeshSkyMode", "change", toggleSkyMode);
    addOptions3dListener("options3dMeshSky", "input", changeColors);
    addOptions3dListener("options3dMeshWater", "input", changeColors);
    addOptions3dListener("options3dGlobeResolution", "change", changeResolution);
    addOptions3dListener("options3dMeshWireframeMode", "change", toggleWireframe3d);
    addOptions3dListener("options3dSunColor", "input", changeSunColor);
    addOptions3dListener("options3dSubdivide", "change", toggle3dSubdivision);
    addOptions3dListener("options3dTimeOfDay", "change", changeTimeOfDay);

    addOptions3dListener("options3dSatellite", "change", toggleSatellite);
    addOptions3dListener("options3dErosion", "change", toggleErosion);
    addOptions3dListener("options3dErosionDetail", "change", changeErosionDetail);
    addOptions3dListener("options3dErosionStrengthRange", "input", changeErosionStrength);
    addOptions3dListener("options3dErosionStrengthNumber", "change", changeErosionStrength);
    addOptions3dListener("options3dErosionRiverDepthRange", "input", changeErosionRiverDepth);
    addOptions3dListener("options3dErosionRiverDepthNumber", "change", changeErosionRiverDepth);
    addOptions3dListener("options3dErosionOctaves", "change", changeErosionOctaves);

    document.addEventListener("fmg:sync-erosion-ui", syncErosionUI);

    function updateValues(): void {
      const globe = getRequiredElementById<HTMLCanvasElement>("canvas3d").dataset.type === "viewGlobe";
      options3dMesh.style.display = globe ? "none" : "block";
      options3dGlobe.style.display = globe ? "block" : "none";
      options3dOBJSave.style.display = globe ? "none" : "inline-block";
      (options3dScaleRange as HTMLInputElement).value = (options3dScaleNumber as HTMLInputElement).value = String(
        ThreeDRenderer.options.scale
      );
      (options3dLightnessRange as HTMLInputElement).value = (options3dLightnessNumber as HTMLInputElement).value =
        String(ThreeDRenderer.options.lightness * 100);
      (options3dSunX as HTMLInputElement).value = String(ThreeDRenderer.options.sun.x);
      (options3dSunY as HTMLInputElement).value = String(ThreeDRenderer.options.sun.y);
      (options3dMeshRotationRange as HTMLInputElement).value = (options3dMeshRotationNumber as HTMLInputElement).value =
        String(ThreeDRenderer.options.rotateMesh);
      (options3dMeshSkinResolution as HTMLInputElement).value = String(ThreeDRenderer.options.resolutionScale);
      (options3dGlobeRotationRange as HTMLInputElement).value = (
        options3dGlobeRotationNumber as HTMLInputElement
      ).value = String(ThreeDRenderer.options.rotateGlobe);
      (options3dMeshLabels3d as HTMLInputElement).value = String(ThreeDRenderer.options.labels3d);
      options3dMeshSkyMode.value = String(ThreeDRenderer.options.extendedWater);
      options3dColorSection.style.display = ThreeDRenderer.options.extendedWater ? "block" : "none";
      (options3dMeshSky as HTMLInputElement).value = ThreeDRenderer.options.skyColor;
      (options3dMeshWater as HTMLInputElement).value = ThreeDRenderer.options.waterColor;
      (options3dGlobeResolution as HTMLInputElement).value = String(ThreeDRenderer.options.resolution);
      (options3dSunColor as HTMLInputElement).value = ThreeDRenderer.options.sunColor;
      (options3dSubdivide as HTMLInputElement).value = String(ThreeDRenderer.options.subdivide);
      getRequiredElementById<HTMLInputElement>("options3dSatellite").checked = ThreeDRenderer.options.satellite;
      getRequiredElementById<HTMLInputElement>("options3dErosion").checked = ThreeDRenderer.options.erosion;
      getRequiredElementById<HTMLSelectElement>("options3dErosionDetail").value = String(
        ThreeDRenderer.options.erosionDetail
      );
      getRequiredElementById<HTMLInputElement>("options3dErosionStrengthRange").value =
        getRequiredElementById<HTMLInputElement>("options3dErosionStrengthNumber").value = String(
          ThreeDRenderer.options.erosionStrength
        );
      getRequiredElementById<HTMLInputElement>("options3dErosionRiverDepthRange").value =
        getRequiredElementById<HTMLInputElement>("options3dErosionRiverDepthNumber").value = String(
          ThreeDRenderer.options.erosionRiverDepth
        );
      getRequiredElementById<HTMLSelectElement>("options3dErosionOctaves").value = String(
        ThreeDRenderer.options.erosionOctaves
      );
      syncErosionUI();
      updateTimeOfDayPreset();

      // Sync to Zustand store
      use3DOptionsStore.getState().syncFromThreeDRenderer(ThreeDRenderer.options);
    }

    function updateTimeOfDayPreset(): void {
      const presetSelect = getElementById<HTMLSelectElement>("options3dTimeOfDay");
      if (!presetSelect) return;

      const { sun, sunColor, lightness } = ThreeDRenderer.options;

      let matchingPreset = "custom";
      for (const [name, preset] of Object.entries(ThreeDRenderer.timeOfDayPresets)) {
        if (
          preset.sun.x === sun.x &&
          preset.sun.y === sun.y &&
          preset.sun.z === sun.z &&
          preset.sunColor === sunColor &&
          Math.abs(preset.lightness - lightness) < 0.05
        ) {
          matchingPreset = name;
          break;
        }
      }

      presetSelect.value = matchingPreset;
    }

    function changeTimeOfDay(this: HTMLSelectElement): void {
      const presetName = this.value;
      if (presetName === "custom") return;
      ThreeDRenderer.setTimeOfDay(presetName);
      updateValues();
    }

    function changeHeightScale(this: HTMLInputElement): void {
      (options3dScaleRange as HTMLInputElement).value = (options3dScaleNumber as HTMLInputElement).value = this.value;
      ThreeDRenderer.setScale(+this.value);
      use3DOptionsStore.getState().updateValue("scale", +this.value);
    }

    function changeResolutionScale(this: HTMLInputElement): void {
      (options3dMeshSkinResolution as HTMLInputElement).value = this.value;
      ThreeDRenderer.setResolutionScale(+this.value);
      use3DOptionsStore.getState().updateValue("resolutionScale", +this.value);
    }

    function changeLightness(this: HTMLInputElement): void {
      (options3dLightnessRange as HTMLInputElement).value = (options3dLightnessNumber as HTMLInputElement).value =
        this.value;
      ThreeDRenderer.setLightness(+this.value / 100);
      use3DOptionsStore.getState().updateValue("lightness", +this.value);
      const presetSelect = getElementById<HTMLSelectElement>("options3dTimeOfDay");
      if (presetSelect && presetSelect.value !== "custom") presetSelect.value = "custom";
    }

    function changeSunColor(this: HTMLInputElement): void {
      const sunColor = (options3dSunColor as HTMLInputElement).value;
      ThreeDRenderer.setSunColor(sunColor);
      use3DOptionsStore.getState().updateValue("sunColor", sunColor);
      const presetSelect = getElementById<HTMLSelectElement>("options3dTimeOfDay");
      if (presetSelect && presetSelect.value !== "custom") presetSelect.value = "custom";
    }

    function changeSunPosition(this: HTMLInputElement): void {
      const x = +(options3dSunX as HTMLInputElement).value;
      const y = +(options3dSunY as HTMLInputElement).value;
      ThreeDRenderer.setSun(x, y, ThreeDRenderer.options.sun.z);
      use3DOptionsStore.getState().updateValue("sunX", x);
      use3DOptionsStore.getState().updateValue("sunY", y);
      const presetSelect = getElementById<HTMLSelectElement>("options3dTimeOfDay");
      if (presetSelect && presetSelect.value !== "custom") presetSelect.value = "custom";
    }

    function changeRotation(this: HTMLInputElement): void {
      const sibling = (this.nextElementSibling || this.previousElementSibling) as HTMLInputElement;
      sibling.value = this.value;
      ThreeDRenderer.setRotation(+this.value);
      const id = this.id;
      if (id.includes("Mesh")) {
        use3DOptionsStore.getState().updateValue("rotateMesh", +this.value);
      } else if (id.includes("Globe")) {
        use3DOptionsStore.getState().updateValue("rotateGlobe", +this.value);
      }
    }

    function toggleLabels3d(): void {
      ThreeDRenderer.toggleLabels();
      use3DOptionsStore.getState().updateValue("labels3d", ThreeDRenderer.options.labels3d);
    }

    function toggle3dSubdivision(): void {
      ThreeDRenderer.toggle3dSubdivision();
      use3DOptionsStore.getState().updateValue("subdivide", ThreeDRenderer.options.subdivide);
    }

    function toggleWireframe3d(): void {
      ThreeDRenderer.toggleWireframe();
    }

    function toggleSkyMode(): void {
      const hide = ThreeDRenderer.options.extendedWater;
      options3dColorSection.style.display = hide ? "none" : "block";
      ThreeDRenderer.toggleSky();
      use3DOptionsStore.getState().updateValue("extendedWater", Boolean(ThreeDRenderer.options.extendedWater));
    }

    function changeColors(): void {
      const skyColor = (options3dMeshSky as HTMLInputElement).value;
      const waterColor = (options3dMeshWater as HTMLInputElement).value;
      ThreeDRenderer.setColors(skyColor, waterColor);
      use3DOptionsStore.getState().updateValue("skyColor", skyColor);
      use3DOptionsStore.getState().updateValue("waterColor", waterColor);
    }

    function changeResolution(this: HTMLInputElement): void {
      ThreeDRenderer.setResolution(+this.value);
      use3DOptionsStore.getState().updateValue("resolution", +this.value);
    }

    function toggleSatellite(this: HTMLInputElement): void {
      ThreeDRenderer.toggleSatellite();
      use3DOptionsStore.getState().updateValue("satellite", ThreeDRenderer.options.satellite);
      syncErosionUI();
    }

    function toggleErosion(this: HTMLInputElement): void {
      ThreeDRenderer.toggleErosion();
      use3DOptionsStore.getState().updateValue("erosion", ThreeDRenderer.options.erosion);
      syncErosionUI();
    }

    function changeErosionDetail(this: HTMLSelectElement): void {
      ThreeDRenderer.setErosionDetail(+this.value);
      use3DOptionsStore.getState().updateValue("erosionDetail", +this.value);
    }

    function changeErosionStrength(this: HTMLInputElement): void {
      getRequiredElementById<HTMLInputElement>("options3dErosionStrengthRange").value =
        getRequiredElementById<HTMLInputElement>("options3dErosionStrengthNumber").value = this.value;
      ThreeDRenderer.setErosionStrength(+this.value);
      use3DOptionsStore.getState().updateValue("erosionStrength", +this.value);
    }

    function changeErosionRiverDepth(this: HTMLInputElement): void {
      getRequiredElementById<HTMLInputElement>("options3dErosionRiverDepthRange").value =
        getRequiredElementById<HTMLInputElement>("options3dErosionRiverDepthNumber").value = this.value;
      ThreeDRenderer.setErosionRiverDepth(+this.value);
      use3DOptionsStore.getState().updateValue("erosionRiverDepth", +this.value);
    }

    function changeErosionOctaves(this: HTMLSelectElement): void {
      ThreeDRenderer.setErosionOctaves(+this.value);
      use3DOptionsStore.getState().updateValue("erosionOctaves", +this.value);
    }

    function syncErosionUI(): void {
      const erosionChecked = getRequiredElementById<HTMLInputElement>("options3dErosion").checked;
      getRequiredElementById<HTMLElement>("options3dErosionSection").style.display = erosionChecked ? "block" : "none";

      const useSubdivide = !erosionChecked;
      const subdivideCheck = getRequiredElementById<HTMLInputElement>("options3dSubdivide");
      subdivideCheck.disabled = !useSubdivide;
      if (!useSubdivide) {
        subdivideCheck.checked = false;
        subdivideCheck.parentElement!.style.opacity = "0.5";
      } else {
        subdivideCheck.checked = Boolean(ThreeDRenderer.options.subdivide);
        subdivideCheck.parentElement!.style.opacity = "1";
      }
    }
  }, 100);
}
