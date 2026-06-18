import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const Options3dDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("options3d"));

  return (
    <Dialog isOpen={isOpen} title="3D Options" onClose={() => closeDialog("options3d")}>
      <div id="options3dContainer">
        <div>
          <div id="options3dMesh" style={{ display: "none" }}>
            <div data-tip="Set map rotation speed. Set to 0 is you want to toggle off the rotation">
              <div>Rotation:</div>
              <input id="options3dMeshRotationRange" type="range" min={0} max={10} step=".1" />
              <input
                id="options3dMeshRotationNumber"
                type="number"
                min={0}
                max={10}
                step=".1"
                style={{ width: "4em" }}
              />
            </div>
            <div data-tip="Set height scale">
              <div>Height scale:</div>
              <input id="options3dScaleRange" type="range" min={0} max={100} />
              <input id="options3dScaleNumber" type="number" min={0} max={1000} style={{ width: "4em" }} />
            </div>
            <div data-tip="Set scene lightness">
              <div>Lightness:</div>
              <input id="options3dLightnessRange" type="range" min={0} max={100} />
              <input id="options3dLightnessNumber" type="number" min={0} max={500} style={{ width: "4em" }} />
            </div>
            <div data-tip="Set mesh texture resolution">
              <div>Texture resolution:</div>
              <select id="options3dMeshSkinResolution" style={{ width: "10em" }}>
                <option value={512}>512x512px</option>
                <option value={1024}>1024x1024px</option>
                <option value={2048}>2048x2048px</option>
                <option value={4096}>4096x4096px</option>
                <option value={8192}>8192x8192px</option>
              </select>
            </div>
            <div data-tip="Quick preset lighting for different times of day" style={{ marginTop: "0.4em" }}>
              <label>Time of day:</label>
              <select id="options3dTimeOfDay" style={{ width: "10em", marginBottom: "0.3em" }} defaultValue="noon">
                <option value="custom">Custom</option>
                <option value="dawn">Dawn</option>
                <option value="noon">Noon</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </select>
            </div>
            <div data-tip="Set sun position (x, y) and color" style={{ marginTop: "0.4em" }}>
              <label>Sun position and color:</label>
              <div style={{ display: "flex", gap: "0.2em" }}>
                <input id="options3dSunX" type="number" min={-2500} max={2500} step={100} style={{ width: "4.7em" }} />
                <input id="options3dSunY" type="number" min={0} max={5000} step={100} style={{ width: "4.7em" }} />
                <input id="options3dSunColor" type="color" style={{ padding: 0, height: "1.5em", border: "none" }} />
              </div>
            </div>
            <div data-tip="Toggle 3d labels" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
              <input id="options3dMeshLabels3d" className="checkbox" type="checkbox" />
              <label htmlFor="options3dMeshLabels3d" className="checkbox-label">
                <i>Show 3D labels</i>
              </label>
            </div>
            <div data-tip="Toggle sky mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
              <input id="options3dMeshSkyMode" className="checkbox" type="checkbox" />
              <label htmlFor="options3dMeshSkyMode" className="checkbox-label">
                <i>Show sky and extend water</i>
              </label>
            </div>
            <div
              data-tip="Increases the polygon count to smooth the sharp points. Please note that it can take some time to calculate"
              style={{ margin: "0.6em 0 0.3em -0.2em" }}
            >
              <input id="options3dSubdivide" className="checkbox" type="checkbox" />
              <label htmlFor="options3dSubdivide" className="checkbox-label">
                <i>
                  Smooth geometry <small style={{ color: "darkred" }}>[slow]</small>
                </i>
              </label>
            </div>
            <div data-tip="Toggle wireframe mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
              <input id="options3dMeshWireframeMode" className="checkbox" type="checkbox" />
              <label htmlFor="options3dMeshWireframeMode" className="checkbox-label">
                <i>Show wireframe</i>
              </label>
            </div>
            <div data-tip="Set sky and water color" id="options3dColorSection" style={{ display: "none" }}>
              <span>Sky:</span>
              <input
                id="options3dMeshSky"
                type="color"
                style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
              />
              <span>Water:</span>
              <input
                id="options3dMeshWater"
                type="color"
                style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
              />
            </div>
          </div>
          <div id="options3dGlobe" style={{ display: "none" }}>
            <div data-tip="Set globe rotation speed. Set to 0 is you want to toggle off the rotation">
              <div>Rotation:</div>
              <input id="options3dGlobeRotationRange" type="range" min={0} max={10} step=".1" />
              <input
                id="options3dGlobeRotationNumber"
                type="number"
                min={0}
                max={10}
                step=".1"
                style={{ width: "4em" }}
              />
            </div>
            <div data-tip="Set globe texture resolution">
              <div>Texture resolution:</div>
              <select id="options3dGlobeResolution" style={{ width: "5em" }}>
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
            <button type="button" id="options3dUpdate" data-tip="Update the scene" className="icon-cw" />
            <button type="button" data-tip="Configure world and map size and climate settings" className="icon-globe" />
            <button
              type="button"
              id="options3dSave"
              data-tip="Save screenshot of the 3d scene"
              className="icon-button-screenshot"
            />
            <button
              type="button"
              id="options3dOBJSave"
              data-tip="Save OBJ file of the 3d scene"
              className="icon-download"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
