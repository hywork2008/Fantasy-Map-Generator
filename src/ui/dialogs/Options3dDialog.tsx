import type React from "react";
import { useEffect, useState } from "react";
import { ThreeDRenderer } from "../../renderers/three-d-renderer";
import { useDialogState } from "../../store/dialogState";
import { use3DOptionsStore } from "../../store/options3dStore";
import { Dialog } from "./Dialog";
import { closeDialog, openDialog } from "./dialogService";

export const Options3dDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("options3d"));
  const options = use3DOptionsStore();
  const [isGlobe, setIsGlobe] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState("custom");

  useEffect(() => {
    if (isOpen) {
      const canvas = document.getElementById("canvas3d");
      setIsGlobe(canvas?.dataset.type === "viewGlobe");

      // Calculate time of day preset
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
      setTimeOfDay(matchingPreset);
    }
  }, [isOpen]);

  const handleChange = (key: string, value: unknown, action: () => void) => {
    action();
    options.updateValue(key, value);
    if (key === "sunX" || key === "sunY" || key === "sunColor" || key === "lightness") {
      setTimeOfDay("custom");
    }
  };

  return (
    <Dialog isOpen={isOpen} title="3D Options" onClose={() => closeDialog("options3d")}>
      <div id="options3dContainer">
        <div>
          <div style={{ display: isGlobe ? "none" : "block" }}>
            <div data-tip="Set map rotation speed. Set to 0 is you want to toggle off the rotation">
              <div>Rotation:</div>
              <input
                type="range"
                min={0}
                max={10}
                step=".1"
                value={options.rotateMesh}
                onChange={e =>
                  handleChange("rotateMesh", +e.target.value, () => ThreeDRenderer.setRotation(+e.target.value))
                }
              />
              <input
                type="number"
                min={0}
                max={10}
                step=".1"
                style={{ width: "4em" }}
                value={options.rotateMesh}
                onChange={e =>
                  handleChange("rotateMesh", +e.target.value, () => ThreeDRenderer.setRotation(+e.target.value))
                }
              />
            </div>
            <div data-tip="Set height scale">
              <div>Height scale:</div>
              <input
                type="range"
                min={0}
                max={100}
                value={options.scale}
                onChange={e => handleChange("scale", +e.target.value, () => ThreeDRenderer.setScale(+e.target.value))}
              />
              <input
                type="number"
                min={0}
                max={1000}
                style={{ width: "4em" }}
                value={options.scale}
                onChange={e => handleChange("scale", +e.target.value, () => ThreeDRenderer.setScale(+e.target.value))}
              />
            </div>
            <div data-tip="Set scene lightness">
              <div>Lightness:</div>
              <input
                type="range"
                min={0}
                max={100}
                value={options.lightness}
                onChange={e =>
                  handleChange("lightness", +e.target.value, () => ThreeDRenderer.setLightness(+e.target.value / 100))
                }
              />
              <input
                type="number"
                min={0}
                max={500}
                style={{ width: "4em" }}
                value={options.lightness}
                onChange={e =>
                  handleChange("lightness", +e.target.value, () => ThreeDRenderer.setLightness(+e.target.value / 100))
                }
              />
            </div>
            <div data-tip="Set mesh texture resolution">
              <div>Texture resolution:</div>
              <select
                style={{ width: "10em" }}
                value={options.resolutionScale}
                onChange={e =>
                  handleChange("resolutionScale", +e.target.value, () =>
                    ThreeDRenderer.setResolutionScale(+e.target.value)
                  )
                }
              >
                <option value={512}>512x512px</option>
                <option value={1024}>1024x1024px</option>
                <option value={2048}>2048x2048px</option>
                <option value={4096}>4096x4096px</option>
                <option value={8192}>8192x8192px</option>
              </select>
            </div>
            <div data-tip="Quick preset lighting for different times of day" style={{ marginTop: "0.4em" }}>
              <label htmlFor="timeOfDay">Time of day:</label>
              <select
                id="timeOfDay"
                style={{ width: "10em", marginBottom: "0.3em" }}
                value={timeOfDay}
                onChange={e => {
                  const presetName = e.target.value;
                  setTimeOfDay(presetName);
                  if (presetName !== "custom") {
                    ThreeDRenderer.setTimeOfDay(presetName);
                    options.syncFromThreeDRenderer(ThreeDRenderer.options);
                  }
                }}
              >
                <option value="custom">Custom</option>
                <option value="dawn">Dawn</option>
                <option value="noon">Noon</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </select>
            </div>
            <div data-tip="Set sun position (x, y) and color" style={{ marginTop: "0.4em" }}>
              <span>Sun position and color:</span>
              <div style={{ display: "flex", gap: "0.2em" }}>
                <input
                  type="number"
                  min={-2500}
                  max={2500}
                  step={100}
                  style={{ width: "4.7em" }}
                  value={options.sunX}
                  onChange={e =>
                    handleChange("sunX", +e.target.value, () =>
                      ThreeDRenderer.setSun(+e.target.value, options.sunY, ThreeDRenderer.options.sun.z)
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={5000}
                  step={100}
                  style={{ width: "4.7em" }}
                  value={options.sunY}
                  onChange={e =>
                    handleChange("sunY", +e.target.value, () =>
                      ThreeDRenderer.setSun(options.sunX, +e.target.value, ThreeDRenderer.options.sun.z)
                    )
                  }
                />
                <input
                  type="color"
                  style={{ padding: 0, height: "1.5em", border: "none" }}
                  value={options.sunColor}
                  onChange={e =>
                    handleChange("sunColor", e.target.value, () => ThreeDRenderer.setSunColor(e.target.value))
                  }
                />
              </div>
            </div>
            <div data-tip="Toggle 3d labels" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
              <input
                id="options3dMeshLabels3d"
                className="checkbox"
                type="checkbox"
                checked={Boolean(options.labels3d)}
                onChange={() => handleChange("labels3d", options.labels3d ? 0 : 1, () => ThreeDRenderer.toggleLabels())}
              />
              <label htmlFor="options3dMeshLabels3d" className="checkbox-label">
                <i>Show 3D labels</i>
              </label>
            </div>
            <div data-tip="Toggle sky mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
              <input
                id="options3dMeshSkyMode"
                className="checkbox"
                type="checkbox"
                checked={options.extendedWater}
                onChange={() => handleChange("extendedWater", !options.extendedWater, () => ThreeDRenderer.toggleSky())}
              />
              <label htmlFor="options3dMeshSkyMode" className="checkbox-label">
                <i>Show sky and extend water</i>
              </label>
            </div>
            <div
              data-tip="Increases the polygon count to smooth the sharp points. Please note that it can take some time to calculate"
              style={{ margin: "0.6em 0 0.3em -0.2em", opacity: options.erosion ? 0.5 : 1 }}
            >
              <input
                id="options3dSubdivide"
                className="checkbox"
                type="checkbox"
                disabled={options.erosion}
                checked={Boolean(options.subdivide)}
                onChange={() =>
                  handleChange("subdivide", options.subdivide ? 0 : 1, () => ThreeDRenderer.toggle3dSubdivision())
                }
              />
              <label htmlFor="options3dSubdivide" className="checkbox-label">
                <i>
                  Smooth geometry <small style={{ color: "darkred" }}>[slow]</small>
                </i>
              </label>
            </div>
            <div
              data-tip="Texture the terrain as a satellite image. Replaces the standard map texture"
              style={{ margin: "0.6em 0 0.3em -0.2em" }}
            >
              <input
                id="options3dSatellite"
                className="checkbox"
                type="checkbox"
                checked={options.satellite}
                onChange={() => handleChange("satellite", !options.satellite, () => ThreeDRenderer.toggleSatellite())}
              />
              <label htmlFor="options3dSatellite" className="checkbox-label">
                <i>Satellite texture</i>
              </label>
            </div>
            <div
              data-tip="Bake procedural erosion detail into the 3D terrain. Visual only, the map data is not changed"
              style={{ margin: "0.6em 0 0.3em -0.2em" }}
            >
              <input
                id="options3dErosion"
                className="checkbox"
                type="checkbox"
                checked={options.erosion}
                onChange={() => handleChange("erosion", !options.erosion, () => ThreeDRenderer.toggleErosion())}
              />
              <label htmlFor="options3dErosion" className="checkbox-label">
                <i>Erode terrain</i>
              </label>
            </div>

            <div style={{ display: options.erosion ? "block" : "none" }}>
              <div data-tip="Set eroded mesh detail level (vertices on the long side)">
                <div>Mesh detail:</div>
                <select
                  style={{ width: "10em" }}
                  value={options.erosionDetail}
                  onChange={e =>
                    handleChange("erosionDetail", +e.target.value, () =>
                      ThreeDRenderer.setErosionDetail(+e.target.value)
                    )
                  }
                >
                  <option value="256">256</option>
                  <option value="512">512</option>
                  <option value="1024">1024</option>
                  <option value="2048">2048 [slow]</option>
                </select>
              </div>

              <div data-tip="Set the strength of erosion gullies and ridges">
                <div>Gully strength:</div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={options.erosionStrength}
                  onChange={e =>
                    handleChange("erosionStrength", +e.target.value, () =>
                      ThreeDRenderer.setErosionStrength(+e.target.value)
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  style={{ width: "4em" }}
                  value={options.erosionStrength}
                  onChange={e =>
                    handleChange("erosionStrength", +e.target.value, () =>
                      ThreeDRenderer.setErosionStrength(+e.target.value)
                    )
                  }
                />
              </div>

              <div data-tip="Set how deep the valleys are carved along the rivers">
                <div>River valleys:</div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={options.erosionRiverDepth}
                  onChange={e =>
                    handleChange("erosionRiverDepth", +e.target.value, () =>
                      ThreeDRenderer.setErosionRiverDepth(+e.target.value)
                    )
                  }
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  style={{ width: "4em" }}
                  value={options.erosionRiverDepth}
                  onChange={e =>
                    handleChange("erosionRiverDepth", +e.target.value, () =>
                      ThreeDRenderer.setErosionRiverDepth(+e.target.value)
                    )
                  }
                />
              </div>

              <div data-tip="Set the number of erosion detail layers. More octaves add finer gullies">
                <div>Detail octaves:</div>
                <select
                  style={{ width: "6em" }}
                  value={options.erosionOctaves}
                  onChange={e =>
                    handleChange("erosionOctaves", +e.target.value, () =>
                      ThreeDRenderer.setErosionOctaves(+e.target.value)
                    )
                  }
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>
            </div>
            <div data-tip="Toggle wireframe mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
              <input
                id="options3dMeshWireframeMode"
                className="checkbox"
                type="checkbox"
                onChange={() => ThreeDRenderer.toggleWireframe()}
              />
              <label htmlFor="options3dMeshWireframeMode" className="checkbox-label">
                <i>Show wireframe</i>
              </label>
            </div>
            <div data-tip="Set sky and water color" style={{ display: options.extendedWater ? "block" : "none" }}>
              <span>Sky:</span>
              <input
                type="color"
                style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
                value={options.skyColor}
                onChange={e =>
                  handleChange("skyColor", e.target.value, () =>
                    ThreeDRenderer.setColors(e.target.value, options.waterColor)
                  )
                }
              />
              <span>Water:</span>
              <input
                type="color"
                style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
                value={options.waterColor}
                onChange={e =>
                  handleChange("waterColor", e.target.value, () =>
                    ThreeDRenderer.setColors(options.skyColor, e.target.value)
                  )
                }
              />
            </div>
          </div>
          <div style={{ display: isGlobe ? "block" : "none" }}>
            <div data-tip="Set globe rotation speed. Set to 0 is you want to toggle off the rotation">
              <div>Rotation:</div>
              <input
                type="range"
                min={0}
                max={10}
                step=".1"
                value={options.rotateGlobe}
                onChange={e =>
                  handleChange("rotateGlobe", +e.target.value, () => ThreeDRenderer.setRotation(+e.target.value))
                }
              />
              <input
                type="number"
                min={0}
                max={10}
                step=".1"
                style={{ width: "4em" }}
                value={options.rotateGlobe}
                onChange={e =>
                  handleChange("rotateGlobe", +e.target.value, () => ThreeDRenderer.setRotation(+e.target.value))
                }
              />
            </div>
            <div data-tip="Set globe texture resolution">
              <div>Texture resolution:</div>
              <select
                style={{ width: "5em" }}
                value={options.resolution}
                onChange={e =>
                  handleChange("resolution", +e.target.value, () => ThreeDRenderer.setResolution(+e.target.value))
                }
              >
                <option value="0.5">0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
                <option value={8}>8x</option>
              </select>
            </div>
            <div
              data-tip="Equirectangular projection is used: distortion is maximum on poles. Use map with aspect ratio 2:1 for best result"
              style={{ fontStyle: "italic", margin: "0.2em 0" }}
            >
              Equirectangular projection is used
            </div>
          </div>
          <div id="options3dFooter" style={{ marginTop: "0.2em" }}>
            <button
              type="button"
              data-tip="Update the scene"
              className="icon-cw"
              onClick={() => ThreeDRenderer.update()}
            />
            <button
              type="button"
              data-tip="Configure world and map size and climate settings"
              className="icon-globe"
              onClick={() => {
                closeDialog("options3d");
                openDialog("worldConfigurator");
              }}
            />
            <button
              type="button"
              data-tip="Save screenshot of the 3d scene"
              className="icon-button-screenshot"
              onClick={() => ThreeDRenderer.saveScreenshot()}
            />
            <button
              type="button"
              data-tip="Save OBJ file of the 3d scene"
              className="icon-download"
              onClick={() => ThreeDRenderer.saveOBJ()}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
