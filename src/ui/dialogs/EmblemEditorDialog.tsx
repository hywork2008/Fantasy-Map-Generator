import type React from "react";
import { closeEmblemEditor, emblemEditorActions } from "../../editors/emblems-editor";
import { useEmblemEditorState } from "../../store/emblemEditorState";
import { Dialog } from "./Dialog";

export const EmblemEditorDialog: React.FC = () => {
  const {
    isOpen,
    targetId,
    armigerName,
    shape,
    size,
    isCustom,
    states,
    provinces,
    burgs,
    selectedState,
    selectedProvince,
    selectedBurg,
    uploadMode,
    downloadMode,
    downloadSize
  } = useEmblemEditorState();

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      title="Edit Emblem"
      onClose={closeEmblemEditor}
      style={{ width: "18.2em", height: "auto", resize: "both", overflow: "hidden" }}
    >
      <div id="emblemEditorContainer" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div>
          <svg viewBox="0 0 200 200" aria-hidden="true" style={{ width: "100%", height: "auto" }}>
            {targetId && <use id="emblemImage" href={`#${targetId}`} />}
          </svg>
          <div id="emblemBody" style={{ marginTop: "1em" }}>
            <div style={{ textAlign: "center", marginBottom: "0.5em" }}>
              <b id="emblemArmiger">{armigerName}</b>
            </div>
            <hr style={{ margin: "0.5em 0" }} />
            <div data-tip="Select state" style={{ display: "flex", alignItems: "center", marginBottom: "0.2em" }}>
              <div className="label" style={{ width: "4em" }}>
                State:
              </div>
              <select
                id="emblemStates"
                value={selectedState}
                onChange={e => emblemEditorActions.selectState(Number(e.target.value))}
                style={{ flexGrow: 1 }}
              >
                {states.map(s => (
                  <option key={s.i} value={s.i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div
              data-tip="Select province in state"
              style={{ display: "flex", alignItems: "center", marginBottom: "0.2em" }}
            >
              <div className="label" style={{ width: "4em" }}>
                Province:
              </div>
              <select
                id="emblemProvinces"
                value={selectedProvince}
                onChange={e => emblemEditorActions.selectProvince(Number(e.target.value))}
                style={{ flexGrow: 1 }}
              >
                {provinces.map(p => (
                  <option key={p.i} value={p.i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div
              data-tip="Select burg in province or state"
              style={{ display: "flex", alignItems: "center", marginBottom: "0.2em" }}
            >
              <div className="label" style={{ width: "4em" }}>
                Burg:
              </div>
              <select
                id="emblemBurgs"
                value={selectedBurg}
                onChange={e => emblemEditorActions.selectBurg(Number(e.target.value))}
                style={{ flexGrow: 1 }}
              >
                {burgs.map(b => (
                  <option key={b.i} value={b.i} disabled={b.isDisabled}>
                    {b.isCapital ? `👑 ${b.name}` : b.name}
                  </option>
                ))}
              </select>
            </div>
            <hr style={{ margin: "0.5em 0" }} />
            <div
              data-tip="Select shape of the emblem"
              style={{ display: "flex", alignItems: "center", marginBottom: "0.2em" }}
            >
              <div className="label" style={{ width: "4em" }}>
                Shape:
              </div>
              <select
                id="emblemShapeSelector"
                value={shape}
                onChange={e => emblemEditorActions.changeShape(e.target.value)}
                disabled={isCustom}
                style={{ flexGrow: 1 }}
              >
                <optgroup label="Basic">
                  <option value="heater">Heater</option>
                  <option value="spanish">Spanish</option>
                  <option value="french">French</option>
                </optgroup>
                <optgroup label="Regional">
                  <option value="horsehead">Horsehead</option>
                  <option value="horsehead2">Horsehead Edgy</option>
                  <option value="polish">Polish</option>
                  <option value="hessen">Hessen</option>
                  <option value="swiss">Swiss</option>
                </optgroup>
                <optgroup label="Historical">
                  <option value="boeotian">Boeotian</option>
                  <option value="roman">Roman</option>
                  <option value="kite">Kite</option>
                  <option value="oldFrench">Old French</option>
                  <option value="renaissance">Renaissance</option>
                  <option value="baroque">Baroque</option>
                </optgroup>
                <optgroup label="Specific">
                  <option value="targe">Targe</option>
                  <option value="targe2">Targe2</option>
                  <option value="pavise">Pavise</option>
                  <option value="wedged">Wedged</option>
                </optgroup>
                <optgroup label="Banner">
                  <option value="flag">Flag</option>
                  <option value="pennon">Pennon</option>
                  <option value="guidon">Guidon</option>
                  <option value="banner">Banner</option>
                  <option value="dovetail">Dovetail</option>
                  <option value="gonfalon">Gonfalon</option>
                  <option value="pennant">Pennant</option>
                </optgroup>
                <optgroup label="Simple">
                  <option value="round">Round</option>
                  <option value="oval">Oval</option>
                  <option value="vesicaPiscis">Vesica Piscis</option>
                  <option value="square">Square</option>
                  <option value="diamond">Diamond</option>
                </optgroup>
                <optgroup label="Fantasy">
                  <option value="fantasy1">Fantasy1</option>
                  <option value="fantasy2">Fantasy2</option>
                  <option value="fantasy3">Fantasy3</option>
                  <option value="fantasy4">Fantasy4</option>
                  <option value="fantasy5">Fantasy5</option>
                </optgroup>
                <optgroup label="Middle Earth">
                  <option value="noldor">Noldor</option>
                  <option value="gondor">Gondor</option>
                  <option value="easterling">Easterling</option>
                  <option value="erebor">Erebor</option>
                  <option value="ironHills">Iron Hills</option>
                  <option value="urukHai">UrukHai</option>
                  <option value="moriaOrc">Moria Orc</option>
                </optgroup>
              </select>
            </div>
            <div
              data-tip="Set size of particular Emblem. To hide set to 0. To change the entire category go to Menu ⭢ Style ⭢ Emblems"
              style={{ display: "flex", alignItems: "center", marginBottom: "0.2em" }}
            >
              <div className="label" style={{ width: "4em" }}>
                Size:
              </div>
              <input
                id="emblemSizeSlider"
                type="range"
                min={0}
                max={5}
                step=".1"
                value={size}
                onChange={e => emblemEditorActions.changeSize(Number(e.target.value))}
                style={{ width: "7em", marginRight: "0.5em" }}
              />
              <input
                id="emblemSizeNumber"
                type="number"
                min={0}
                max={5}
                step=".1"
                value={size}
                onChange={e => emblemEditorActions.changeSize(Number(e.target.value))}
                style={{ width: "3em" }}
              />
            </div>
          </div>

          <div
            id="emblemsFooter"
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "1em",
              padding: "0.5em 0",
              borderTop: "1px solid #ddd"
            }}
          >
            <button
              type="button"
              id="emblemsRegenerate"
              data-tip="Regenerate emblem"
              className="icon-shuffle"
              onClick={emblemEditorActions.regenerate}
            />
            <button
              type="button"
              id="emblemsArmoria"
              data-tip="Edit the emblem in Armoria - dedicated heraldry editor. Download emblem and upload it back map the generator"
              className="icon-brush"
              onClick={emblemEditorActions.openInArmoria}
            />
            <button
              type="button"
              id="emblemsDownload"
              data-tip="Set size, select file format and download emblem image"
              className={`icon-download ${downloadMode ? "pressed" : ""}`}
              onClick={emblemEditorActions.toggleDownload}
            />
            <button
              type="button"
              id="emblemsUpload"
              data-tip="Upload png, jpg or svg image from Armoria or other sources as emblem"
              className={`icon-upload ${uploadMode ? "pressed" : ""}`}
              onClick={emblemEditorActions.toggleUpload}
            />
            <button
              type="button"
              id="emblemsGallery"
              data-tip="Download emblems gallery as html document (open in browser; downloading takes some time)"
              className="icon-layer-group"
              onClick={emblemEditorActions.downloadGallery}
            />
            <button
              type="button"
              id="emblemsFocus"
              data-tip="Show emblem associated area or place"
              className="icon-target"
              onClick={emblemEditorActions.showArea}
            />
          </div>

          {uploadMode && (
            <div
              id="emblemUploadControl"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5em",
                marginTop: "0.5em",
                padding: "0.5em",
                background: "#f0f0f0",
                borderRadius: "4px"
              }}
            >
              <div style={{ display: "flex", gap: "0.5em" }}>
                <input
                  type="file"
                  id="emblemImageToLoad"
                  accept=".png, .jpg, .jpeg"
                  style={{ display: "none" }}
                  onChange={e => {
                    if (e.target.files?.[0]) emblemEditorActions.uploadImage(e.target.files[0], "image");
                  }}
                />
                <button
                  type="button"
                  id="emblemsUploadImage"
                  data-tip="Upload SVG or PNG image from any source. Make sure background is transparent"
                  onClick={() => document.getElementById("emblemImageToLoad")?.click()}
                  style={{ flexGrow: 1 }}
                >
                  Any image
                </button>

                <input
                  type="file"
                  id="emblemSVGToLoad"
                  accept=".svg"
                  style={{ display: "none" }}
                  onChange={e => {
                    if (e.target.files?.[0]) emblemEditorActions.uploadImage(e.target.files[0], "svg");
                  }}
                />
                <button
                  type="button"
                  id="emblemsUploadSVG"
                  data-tip="Upload prepared SVG image (SVG from Armoria or SVG processed with 'Optimize vector' tool)"
                  onClick={() => document.getElementById("emblemSVGToLoad")?.click()}
                  style={{ flexGrow: 1 }}
                >
                  Prepared SVG
                </button>
              </div>
              <div style={{ fontSize: "0.85em", textAlign: "center" }}>
                <a
                  href="https://www.iloveimg.com/compress-image"
                  target="_blank"
                  data-tip="Use external tool to compress/resize raster images before upload"
                  rel="noopener noreferrer"
                >
                  Compress raster
                </a>
                <span> | </span>
                <a
                  href="https://jakearchibald.github.io/svgomg"
                  target="_blank"
                  data-tip="Use external tool to optimize vector images before upload"
                  rel="noopener noreferrer"
                >
                  Optimize vector
                </a>
              </div>
            </div>
          )}

          {downloadMode && (
            <div
              id="emblemDownloadControl"
              style={{
                display: "flex",
                gap: "0.5em",
                marginTop: "0.5em",
                padding: "0.5em",
                background: "#f0f0f0",
                borderRadius: "4px",
                alignItems: "center"
              }}
            >
              <input
                id="emblemsDownloadSize"
                data-tip="Set image size in pixels"
                type="number"
                value={downloadSize}
                onChange={e => useEmblemEditorState.setState({ downloadSize: Number(e.target.value) })}
                step={100}
                min={100}
                max={10000}
                style={{ width: "4em" }}
              />
              <button
                type="button"
                id="emblemsDownloadSVG"
                data-tip="Download as SVG: scalable vector image. Best quality, can be opened in browser or Inkscape"
                onClick={() => emblemEditorActions.download("svg")}
              >
                SVG
              </button>
              <button
                type="button"
                id="emblemsDownloadPNG"
                data-tip="Download as PNG: lossless raster image with transparent background"
                onClick={() => emblemEditorActions.download("png")}
              >
                PNG
              </button>
              <button
                type="button"
                id="emblemsDownloadJPG"
                data-tip="Download as JPG: lossy compressed raster image with solid white background"
                onClick={() => emblemEditorActions.download("jpeg")}
              >
                JPG
              </button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
