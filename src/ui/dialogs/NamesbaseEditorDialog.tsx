import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { type NamesbaseAnalysisData, NamesbaseEditor, type ParseError } from "../../controllers/namesbase-editor";
import { Names } from "../../generators/names-generator";
import { speak } from "../../services/speechService";
import { tip } from "../../services/tooltipService";
import { openURL } from "../../utils";
import { uploadFile } from "../../utils/editorHelpers";
import { Dialog } from "./Dialog";

const NamesbaseAnalysisDialog: React.FC<{ data: NamesbaseAnalysisData; onClose: () => void }> = ({ data, onClose }) => {
  const getLengthQuality = () => {
    if (data.length < 30)
      return (
        <span data-tip="Namesbase contains < 30 names - not enough to generate reasonable data">[not enough]</span>
      );
    if (data.length < 100)
      return <span data-tip="Namesbase contains < 100 names - not enough to generate good names">[low]</span>;
    if (data.length <= 400) return <span data-tip="Namesbase contains a reasonable number of samples">[good]</span>;
    return (
      <span data-tip="Namesbase contains > 400 names. That is too much, try to reduce it to ~300 names">
        [overmuch]
      </span>
    );
  };

  const getVarietyLevel = () => {
    if (data.variety < 15)
      return <span data-tip="Namesbase average variety < 15 - generated names will be too repetitive">[low]</span>;
    if (data.variety < 30)
      return <span data-tip="Namesbase average variety < 30 - names can be too repetitive">[mean]</span>;
    return <span data-tip="Namesbase variety is good">[good]</span>;
  };

  return (
    <Dialog isOpen={true} onClose={onClose} title="Data Analysis">
      <div>
        <div data-tip="Number of names provided">
          Namesbase length: {data.length} {getLengthQuality()}
        </div>
        <div data-tip="Average number of generation variants for each key in the chain">
          Namesbase variety: {data.variety} {getVarietyLevel()}
        </div>
        <hr />
        <div data-tip="The shortest name length">Min name length: {data.minLength}</div>
        <div data-tip="The longest name length">Max name length: {data.maxLength}</div>
        <div data-tip="Average name length">Mean name length: {data.meanLength}</div>
        <div data-tip="Common name length">Median name length: {data.medianLength}</div>
        <hr />
        <div data-tip="Characters outside of Basic Latin have bad font support">
          Non-basic chars: {data.nonBasicLatinChars}
        </div>
        <div data-tip="Characters that are frequently (more than 3 times) doubled">
          Doubled chars: {data.doubledStr}
        </div>
        <div data-tip="Names used more than one time">Duplicates: {data.duplicates}</div>
        <div data-tip="Percentage of names containing space character">Multi-word names: {data.multiwordRate}%</div>
      </div>
    </Dialog>
  );
};

const NamesbaseUploadErrorDialog: React.FC<{ errors: ParseError[]; totalCount: number; onClose: () => void }> = ({
  errors,
  totalCount,
  onClose
}) => {
  return (
    <Dialog isOpen={true} onClose={onClose} title="Parsing error">
      <div>
        <p>
          <strong>
            File parsing error. Only {totalCount - errors.length} out of {totalCount} namebases added.
          </strong>
          <br />
          Each namebase should be on its own line and follow the format: <code>name|min|max|duplication|m|names</code>.
          Parameters should be separated with the <code>|</code> character, and this character should not be used within
          the parameters. Another prohibited character is <code>/</code>. The most common issue is names and other
          parameters being on two separate lines.
        </p>
        <ul>
          <li>
            <code>name</code>: name of the base.
          </li>
          <li>
            <code>min</code>: minimal recommended length of generated names. It should be a number.
          </li>
          <li>
            <code>max</code>: maximal recommended length of generated names. It should be a number greater than minimal
            length.
          </li>
          <li>
            <code>duplication</code>: characters that can be duplicated in generated names. For example <code>lkd</code>{" "}
            means names like "Kalla", "Mikkor", "Dalddur" are possible. This parameter can be empty.
          </li>
          <li>
            <code>m</code>: unused parameter, populate with <code>0</code>.
          </li>
          <li>
            <code>names</code>: names data, separated with commas. It should contain at least 3 names to be valid.
          </li>
        </ul>
        <div>
          <ul>
            {errors.map(err => (
              <li key={err.id}>
                <div>
                  Line {err.id}: <span>{err.error}.</span> Data:
                </div>
                <div>{err.line || "<empty line>"}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Dialog>
  );
};

export const NamesbaseEditorContent: React.FC = () => {
  const [activeBaseIndex, setActiveBaseIndex] = useState(0);
  const [analysisData, setAnalysisData] = useState<NamesbaseAnalysisData | null>(null);
  const [uploadErrors, setUploadErrors] = useState<{ errors: ParseError[]; totalCount: number } | null>(null);

  // Use a trigger state to force re-reading the worldContext data
  const [_updateTrigger, setUpdateTrigger] = useState(0);

  const uploaderRef = useRef<HTMLInputElement>(null);
  const [uploadOverride, setUploadOverride] = useState(true);

  // Re-read when updateTrigger changes
  const bases = worldContext.nameBases;

  const activeBase = bases[activeBaseIndex];

  // Local state for the selected base
  const [namesData, setNamesData] = useState("");
  const [baseName, setBaseName] = useState("");
  const [minLen, setMinLen] = useState(2);
  const [maxLen, setMaxLen] = useState(10);
  const [doubleStr, setDoubleStr] = useState("");
  const [examples, setExamples] = useState("");

  // Populate local state when active base changes
  useEffect(() => {
    if (activeBase) {
      setNamesData(activeBase.b);
      setBaseName(activeBase.name);
      setMinLen(activeBase.min);
      setMaxLen(activeBase.max);
      setDoubleStr(activeBase.d);
    }
  }, [activeBase]);

  // Generate examples
  const generateExamples = useCallback(() => {
    if (!activeBase) return;
    let newExamples = "";
    for (let i = 0; i < 7; i++) {
      const example = Names.getBase(activeBaseIndex);
      if (example === undefined) {
        newExamples = "Cannot generate examples. Please verify the data";
        break;
      }
      if (i) newExamples += ", ";
      newExamples += example;
    }
    setExamples(newExamples);
  }, [activeBase, activeBaseIndex]);

  // Run initial example generation
  useEffect(() => {
    generateExamples();
  }, [generateExamples]);

  const handleNamesDataChange = (val: string) => {
    setNamesData(val);
    if (!activeBase) return;

    if (val.split(",").length < 3) {
      tip("The names data provided is too short or incorrect", false, "error");
    } else {
      const securedNamesData = val.replace(/[/|]/g, "");
      activeBase.b = securedNamesData;
      Names.updateChain(activeBaseIndex);
      generateExamples();
    }
  };

  const handleBaseNameChange = (val: string) => {
    const safeName = val.replace(/[/|]/g, "");
    setBaseName(safeName);
    if (activeBase) activeBase.name = safeName;
    setUpdateTrigger(t => t + 1); // trigger re-render of the dropdown
  };

  const handleMinChange = (val: number) => {
    if (activeBase && val > activeBase.max) {
      tip("Minimal length cannot be greater than maximal", false, "error");
      return;
    }
    setMinLen(val);
    if (activeBase) activeBase.min = val;
  };

  const handleMaxChange = (val: number) => {
    if (activeBase && val < activeBase.min) {
      tip("Maximal length should be greater than minimal", false, "error");
      return;
    }
    setMaxLen(val);
    if (activeBase) activeBase.max = val;
  };

  const handleDoubleChange = (val: string) => {
    setDoubleStr(val);
    if (activeBase) activeBase.d = val;
  };

  const handleAddBase = () => {
    const newId = NamesbaseEditor.namesbaseAdd();
    setUpdateTrigger(t => t + 1);
    setActiveBaseIndex(newId);
  };

  const handleRestoreDefault = () => {
    NamesbaseEditor.namesbaseRestoreDefault(() => {
      setUpdateTrigger(t => t + 1);
      setActiveBaseIndex(0);
    });
  };

  const handleAnalyze = () => {
    const data = NamesbaseEditor.analyzeNamesbase(namesData);
    if (!data) {
      tip("Names data should not be empty", false, "error");
    } else {
      setAnalysisData(data);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    uploadFile(e.target, data => {
      const result = NamesbaseEditor.namesbaseUpload(data, uploadOverride);
      setUpdateTrigger(t => t + 1);
      setActiveBaseIndex(0);
      if (result.errors.length > 0) {
        setUploadErrors(result);
      }
    });
    // Reset file input so it triggers again on same file
    if (uploaderRef.current) uploaderRef.current.value = "";
  };

  const triggerUpload = (override: boolean) => {
    setUploadOverride(override);
    uploaderRef.current?.click();
  };

  if (!activeBase) return null;

  return (
    <div id="namesbaseEditorContainer">
      <div id="namesbaseBasesTop">
        <span>Select base: </span>
        <select
          id="namesbaseSelect"
          data-tip="Select base to edit"
          value={activeBaseIndex}
          onChange={e => setActiveBaseIndex(+e.target.value)}
        >
          {bases.map((b, i) => (
            <option key={b.name || String(i)} value={i}>
              {b.name}
            </option>
          ))}
        </select>
        <span>Names data: </span>
      </div>
      <div id="namesbaseBody">
        <textarea
          id="namesbaseTextarea"
          rows={13}
          data-tip="Names data: a comma separated list of source names used for names generation"
          placeholder="Provide a names data: a comma separated list of source names"
          autoCorrect="off"
          spellCheck="false"
          value={namesData}
          onChange={e => handleNamesDataChange(e.target.value)}
        />
        <div>
          <span>Name: </span>
          <input
            id="namesbaseName"
            data-tip="Type to change a base name"
            placeholder="Base name"
            autoCorrect="off"
            spellCheck="false"
            value={baseName}
            onChange={e => handleBaseNameChange(e.target.value)}
          />
          <span>Length: </span>
          <input
            id="namesbaseMin"
            data-tip="Recommended minimum name length"
            type="number"
            min={2}
            max={100}
            value={minLen}
            onChange={e => handleMinChange(+e.target.value)}
          />
          <input
            id="namesbaseMax"
            data-tip="Recommended maximum name length"
            type="number"
            min={2}
            value={maxLen}
            onChange={e => handleMaxChange(+e.target.value)}
          />
          <span>Doubled: </span>
          <input
            id="namesbaseDouble"
            data-tip="Populate with letters that can be used twice in a row (geminates)"
            autoCorrect="off"
            spellCheck="false"
            value={doubleStr}
            onChange={e => handleDoubleChange(e.target.value)}
          />
        </div>
        <fieldset>
          <legend>Generated examples:</legend>
          <button
            type="button"
            id="namesbaseExamples"
            data-tip="Examples. Click to re-generate"
            onClick={generateExamples}
            className="d-block"
          >
            {examples}
          </button>
        </fieldset>
      </div>
      <div id="namesbaseFooter" className="fmg-dialog-footer">
        <button
          type="button"
          id="namesbaseUpdateExamples"
          data-tip="Re-generate examples based on provided data"
          className="icon-arrows-cw"
          onClick={generateExamples}
        />
        <button
          type="button"
          id="namesbaseAdd"
          data-tip="Add new namesbase"
          className="icon-plus"
          onClick={handleAddBase}
        />
        <button
          type="button"
          id="namesbaseDefault"
          data-tip="Restore default namesbase"
          className="icon-cancel"
          onClick={handleRestoreDefault}
        />
        <button
          type="button"
          id="namesbaseDownload"
          data-tip="Download namesbase to PC"
          className="icon-download"
          onClick={() => NamesbaseEditor.namesbaseDownload()}
        />
        <button
          type="button"
          id="namesbaseUpload"
          data-tip="Upload a namesbase from PC, replacing the current set"
          className="icon-upload"
          onClick={() => triggerUpload(true)}
        />
        <button
          type="button"
          id="namesbaseUploadExtend"
          data-tip="Upload a namesbase from PC, extending the current set"
          className="icon-up-circled2"
          onClick={() => triggerUpload(false)}
        />
        <button
          type="button"
          id="namesbaseCA"
          data-tip="Find or share custom namesbase on Cartography Assets portal"
          className="icon-drafting-compass"
          onClick={() =>
            openURL("https://cartographyassets.com/asset-category/specific-assets/azgaars-generator/namebases/")
          }
        />
        <button
          type="button"
          id="namesbaseAnalyze"
          data-tip="Analyze namesbase to get a validity and quality overview"
          className="icon-flask"
          onClick={handleAnalyze}
        />
        <button
          type="button"
          id="namesbaseSpeak"
          data-tip="Speak the examples. You can change voice and language in options"
          className="icon-voice"
          onClick={() => speak(examples)}
        />
      </div>
      <input type="file" className="d-none" ref={uploaderRef} onChange={handleUpload} accept=".txt" />

      {analysisData && <NamesbaseAnalysisDialog data={analysisData} onClose={() => setAnalysisData(null)} />}
      {uploadErrors && (
        <NamesbaseUploadErrorDialog
          errors={uploadErrors.errors}
          totalCount={uploadErrors.totalCount}
          onClose={() => setUploadErrors(null)}
        />
      )}
    </div>
  );
};
