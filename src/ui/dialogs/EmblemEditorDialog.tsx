import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const EmblemEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("emblemEditor"));

  return (
    <Dialog isOpen={isOpen} title="Emblem Editor" onClose={() => closeDialog("emblemEditor")}>
      <div id="emblemEditorContainer">
        <div>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <use id="emblemImage" />
          </svg>
          <div id="emblemBody">
            <div>
              <b id="emblemArmiger" />
            </div>
            <hr />
            <div data-tip="Select state">
              <div className="label">State:</div>
              <select id="emblemStates" />
            </div>
            <div data-tip="Select province in state">
              <div className="label">Province:</div>
              <select id="emblemProvinces" />
            </div>
            <div data-tip="Select burg in province or state">
              <div className="label">Burg:</div>
              <select id="emblemBurgs" />
            </div>
            <hr />
            <div data-tip="Select shape of the emblem">
              <div className="label">Shape:</div>
              <select id="emblemShapeSelector">
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
            <div data-tip="Set size of particular Emblem. To hide set to 0. To change the entire category go to Menu ⭢ Style ⭢ Emblems">
              <div className="label" style={{ width: "2.8em" }}>
                Size:
              </div>
              <input id="emblemSizeSlider" type="range" min={0} max={5} step=".1" style={{ width: "7em" }} />
              <input id="emblemSizeNumber" type="number" min={0} max={5} step=".1" />
            </div>
          </div>
          <div id="emblemsFooter">
            <button type="button" id="emblemsRegenerate" data-tip="Regenerate emblem" className="icon-shuffle" />
            <button
              type="button"
              id="emblemsArmoria"
              data-tip="Edit the emblem in Armoria - dedicated heraldry editor. Download emblem and upload it back map the generator"
              className="icon-brush"
            />
            <button
              type="button"
              id="emblemsDownload"
              data-tip="Set size, select file format and download emblem image"
              className="icon-download"
            />
            <button
              type="button"
              id="emblemsUpload"
              data-tip="Upload png, jpg or svg image from Armoria or other sources as emblem"
              className="icon-upload"
            />
            <button
              type="button"
              id="emblemsGallery"
              data-tip="Download emblems gallery as html document (open in browser; downloading takes some time)"
              className="icon-layer-group"
            />
            <button
              type="button"
              id="emblemsFocus"
              data-tip="Show emblem associated area or place"
              className="icon-target"
            />
          </div>
          <div id="emblemUploadControl" className="hidden">
            <button
              type="button"
              id="emblemsUploadImage"
              data-tip="Upload SVG or PNG image from any source. Make sure background is transparent"
            >
              Any image
            </button>
            <button
              type="button"
              id="emblemsUploadSVG"
              data-tip="Upload prepared SVG image (SVG from Armoria or SVG processed with 'Optimize vector' tool)"
            >
              Prepared SVG
            </button>
            <a
              href="https://www.iloveimg.com/compress-image"
              target="_blank"
              data-tip="Use external tool to compress/resize raster images before upload"
              rel="noopener"
            >
              Comperess raster
            </a>
            <span> | </span>
            <a
              href="https://jakearchibald.github.io/svgomg"
              target="_blank"
              data-tip="Use external tool to optimize vector images before upload"
              rel="noopener"
            >
              Optimize vector
            </a>
          </div>
          <div id="emblemDownloadControl" className="hidden">
            <input
              id="emblemsDownloadSize"
              data-tip="Set image size in pixels"
              type="number"
              defaultValue={500}
              step={100}
              min={100}
              max={10000}
            />
            <button
              type="button"
              id="emblemsDownloadSVG"
              data-tip="Download as SVG: scalable vector image. Best quality, can be opened in browser or Inkscape"
            >
              SVG
            </button>
            <button
              type="button"
              id="emblemsDownloadPNG"
              data-tip="Download as PNG: lossless raster image with transparent background"
            >
              PNG
            </button>
            <button
              type="button"
              id="emblemsDownloadJPG"
              data-tip="Download as JPG: lossy compressed raster image with solid white background"
            >
              JPG
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
