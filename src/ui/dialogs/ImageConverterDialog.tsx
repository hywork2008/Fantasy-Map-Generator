import type React from "react";
import { useRef } from "react";
import { HeightmapEditorActions } from "../../controllers/heightmapEditor";
import { useDialogState } from "../../store/dialogState";
import { setHeightmapEditorState, useHeightmapEditorState } from "../../store/heightmapEditorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ImageConverterDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("imageConverter"));
  const {
    imageConverterOverlay,
    imageConverterUnassigned,
    imageConverterAssigned,
    imageConverterSelectedColor,
    imageConverterHoveredHeight
  } = useHeightmapEditorState();

  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleColorClick = (color: string) => {
    HeightmapEditorActions.imageConverterSelectColor?.(color);
  };

  const handlePaletteHover = (height: number) => {
    setHeightmapEditorState({ imageConverterHoveredHeight: height });
  };

  const handlePaletteLeave = () => {
    setHeightmapEditorState({ imageConverterHoveredHeight: null });
  };

  const handlePaletteClick = (height: number) => {
    if (imageConverterSelectedColor) {
      HeightmapEditorActions.imageConverterAssignHeight?.(height);
    }
  };

  // Pre-generate palette colors 0 to 100 for display
  const palette = Array.from({ length: 101 }, (_, i) => i);

  return (
    <Dialog isOpen={isOpen} title="Image Converter" onClose={() => closeDialog("imageConverter")}>
      <div id="imageConverterContainer">
        <div>
          <div id="convertImageButtons">
            <input
              ref={imageInputRef}
              type="file"
              id="imageConverterFileInput"
              style={{ display: "none" }}
              accept="image/*"
              onChange={e => HeightmapEditorActions.imageConverterUploadImage?.(e.target as HTMLInputElement)}
            />
            <button
              type="button"
              id="convertImageLoad"
              data-tip="Load image to convert"
              className="icon-upload"
              onClick={() => imageInputRef.current?.click()}
            />
            <button
              type="button"
              id="convertAutoLum"
              data-tip="Auto-assign colors based on liminosity (good for monochrome images)"
              className="icon-adjust"
              onClick={() => HeightmapEditorActions.imageConverterAutoAssign?.("lum")}
            />
            <button
              type="button"
              id="convertAutoHue"
              data-tip="Auto-assign colors based on hue (good for colored images)"
              className="icon-paint-roller"
              onClick={() => HeightmapEditorActions.imageConverterAutoAssign?.("hue")}
            />
            <button
              type="button"
              id="convertAutoFMG"
              data-tip="Auto-assign colors using generator scheme (for exported colored heightmaps)"
              className="icon-layer-group"
              onClick={() => HeightmapEditorActions.imageConverterAutoAssign?.("scheme")}
            />
            <button
              type="button"
              id="convertColorsButton"
              data-tip="Set maximum number of colors"
              className="icon-signal"
              onClick={HeightmapEditorActions.imageConverterSetColorsNumber}
            />
            <button
              type="button"
              id="convertCancel"
              data-tip="Cancel the conversion. Previous heightmap will be restored"
              className="icon-cancel"
              onClick={HeightmapEditorActions.imageConverterCancel}
            />
          </div>
          <div data-tip="Set opacity of the loaded image" style={{ paddingTop: "0.4em" }}>
            <i>Overlay opacity:</i>
            <br />
            <input
              id="convertOverlay"
              type="range"
              min={0}
              max={1}
              step=".01"
              value={imageConverterOverlay}
              onChange={e => HeightmapEditorActions.imageConverterSetOverlayOpacity?.(+e.target.value)}
              style={{ width: "12.6em" }}
            />
            <input
              id="convertOverlayNumber"
              type="number"
              min={0}
              max={1}
              step=".01"
              value={imageConverterOverlay}
              onChange={e => HeightmapEditorActions.imageConverterSetOverlayOpacity?.(+e.target.value)}
              style={{ width: "4.2em" }}
            />
          </div>

          <div
            data-tip="Select a color below and assign a height value for it"
            id="colorsSelect"
            style={{
              display: imageConverterUnassigned.length || Object.keys(imageConverterAssigned).length ? "block" : "none"
            }}
          >
            <i>Set height: </i>
            <span id="colorsSelectValue">{imageConverterHoveredHeight !== null ? imageConverterHoveredHeight : 0}</span>
            <span>
              (
              <span id="colorsSelectFriendly">
                {imageConverterHoveredHeight !== null ? imageConverterHoveredHeight : 0}
              </span>
              )
            </span>
            <br />
            <div id="imageConverterPalette">
              {palette.map(h => (
                <div
                  key={h}
                  data-color={h}
                  className={`color-div ${imageConverterHoveredHeight === h ? "hoveredColor" : ""}`}
                  style={{ backgroundColor: `hsl(${h}, 50%, 50%)` /* Approximation for visual */ }}
                  onMouseEnter={() => handlePaletteHover(h)}
                  onMouseLeave={handlePaletteLeave}
                  onClick={() => handlePaletteClick(h)}
                />
              ))}
            </div>
          </div>

          <div
            data-tip="Select a color to re-assign the height value"
            id="colorsAssigned"
            style={{ display: Object.keys(imageConverterAssigned).length ? "block" : "none" }}
          >
            <i>Assigned colors ({Object.keys(imageConverterAssigned).length}):</i>
            <div id="colorsAssignedContainer" className="colorsContainer">
              {Object.entries(imageConverterAssigned)
                .sort(([, hA], [, hB]) => hA - hB)
                .map(([color, height]) => (
                  <div
                    key={color}
                    data-color={color}
                    data-height={height}
                    className={`color-div ${imageConverterSelectedColor === color ? "selectedColor" : ""}`}
                    style={{ backgroundColor: color }}
                    onClick={() => handleColorClick(color)}
                  />
                ))}
            </div>
          </div>

          <div
            data-tip="Select a color to assign a height value"
            id="colorsUnassigned"
            style={{ display: imageConverterUnassigned.length ? "block" : "none" }}
          >
            <i>Unassigned colors ({imageConverterUnassigned.length}):</i>
            <div id="colorsUnassignedContainer" className="colorsContainer">
              {imageConverterUnassigned.map(color => (
                <div
                  key={color}
                  data-color={color}
                  className={`color-div ${imageConverterSelectedColor === color ? "selectedColor" : ""}`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorClick(color)}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            id="convertComplete"
            data-tip="Complete the conversion. All unassigned colors will be considered as ocean"
            style={{ margin: "0.4em 0" }}
            className="glow"
            onClick={HeightmapEditorActions.imageConverterApply}
          >
            Complete the conversion
          </button>
        </div>
      </div>
    </Dialog>
  );
};
