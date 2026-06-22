import { max as d3max, min as d3min, mean, median } from "d3";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { downloadFile, getFileName, uploadFile } from "../controllers/editors";
import { Names } from "../modules/names-generator";
import { closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { openURL, rn, unique } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { ERROR } from "../utils/debug";
import { speak, tip } from "../utils/uiHelpers";

const unsafe = /[|/]/g;

const escapeHtml = (str: string): string =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

interface ParseError {
  id: number;
  line: string;
  error: string;
}

class NamesbaseEditorModule {
  private listenersAdded = false;

  init(): void {
    // Listeners are now added lazily on first open because React might not have rendered the DOM yet.
  }

  open(): void {
    if (viewContext.customization) return;
    closeDialogs("#namesbaseEditor, .stable");

    if (!this.listenersAdded) {
      this.addListeners();
      this.listenersAdded = true;
    }

    this.createBasesList();
    this.updateInputs();

    openDialog("namesbaseEditor", {
      title: "Namesbase Editor",
      width: "60vw",
      position: { my: "center", at: "center", of: "svg" }
    });
  }

  private addListeners(): void {
    const uploader = document.getElementById("namesbaseToLoad") as HTMLInputElement;

    document.getElementById("namesbaseSelect")!.addEventListener("change", () => this.updateInputs());
    document.getElementById("namesbaseTextarea")!.addEventListener("change", () => this.updateNamesData());
    document.getElementById("namesbaseUpdateExamples")!.addEventListener("click", () => this.updateExamples());
    document.getElementById("namesbaseExamples")!.addEventListener("click", () => this.updateExamples());
    document
      .getElementById("namesbaseName")!
      .addEventListener("input", e => this.updateBaseName((e.target as HTMLInputElement).value));
    document
      .getElementById("namesbaseMin")!
      .addEventListener("input", e => this.updateBaseMin((e.target as HTMLInputElement).value));
    document
      .getElementById("namesbaseMax")!
      .addEventListener("input", e => this.updateBaseMax((e.target as HTMLInputElement).value));
    document
      .getElementById("namesbaseDouble")!
      .addEventListener("input", e => this.updateBaseDuplication((e.target as HTMLInputElement).value));
    document.getElementById("namesbaseAdd")!.addEventListener("click", () => this.namesbaseAdd());
    document.getElementById("namesbaseAnalyze")!.addEventListener("click", () => this.analyzeNamesbase());
    document.getElementById("namesbaseDefault")!.addEventListener("click", () => this.namesbaseRestoreDefault());
    document.getElementById("namesbaseDownload")!.addEventListener("click", () => this.namesbaseDownload());
    document.getElementById("namesbaseUpload")!.addEventListener("click", () => {
      uploader.addEventListener(
        "change",
        e => uploadFile(e.target as HTMLInputElement, d => this.namesbaseUpload(d, true)),
        {
          once: true
        }
      );
      uploader.click();
    });
    document.getElementById("namesbaseUploadExtend")!.addEventListener("click", () => {
      uploader.addEventListener(
        "change",
        e => uploadFile(e.target as HTMLInputElement, d => this.namesbaseUpload(d, false)),
        {
          once: true
        }
      );
      uploader.click();
    });
    document
      .getElementById("namesbaseCA")!
      .addEventListener("click", () =>
        openURL("https://cartographyassets.com/asset-category/specific-assets/azgaars-generator/namebases/")
      );
    document
      .getElementById("namesbaseSpeak")!
      .addEventListener("click", () => speak(document.getElementById("namesbaseExamples")!.textContent ?? ""));
  }

  private createBasesList(): void {
    const select = document.getElementById("namesbaseSelect") as HTMLSelectElement;
    select.innerHTML = "";
    worldContext.nameBases.forEach((b, i) => {
      select.options.add(new Option(b.name, String(i)));
    });
  }

  private updateInputs(): void {
    const base = +(document.getElementById("namesbaseSelect") as HTMLSelectElement).value;
    if (!worldContext.nameBases[base]) {
      tip(`Namesbase ${base} is not defined`, false, "error");
      return;
    }
    (document.getElementById("namesbaseTextarea") as HTMLTextAreaElement).value = worldContext.nameBases[base].b;
    (document.getElementById("namesbaseName") as HTMLInputElement).value = worldContext.nameBases[base].name;
    (document.getElementById("namesbaseMin") as HTMLInputElement).value = String(worldContext.nameBases[base].min);
    (document.getElementById("namesbaseMax") as HTMLInputElement).value = String(worldContext.nameBases[base].max);
    (document.getElementById("namesbaseDouble") as HTMLInputElement).value = worldContext.nameBases[base].d;
    this.updateExamples();
  }

  private updateExamples(): void {
    const base = +(document.getElementById("namesbaseSelect") as HTMLSelectElement).value;
    let examples = "";
    for (let i = 0; i < 7; i++) {
      const example = Names.getBase(base);
      if (example === undefined) {
        examples = "Cannot generate examples. Please verify the data";
        break;
      }
      if (i) examples += ", ";
      examples += example;
    }
    document.getElementById("namesbaseExamples")!.innerHTML = examples;
  }

  private updateNamesData(): void {
    const base = +(document.getElementById("namesbaseSelect") as HTMLSelectElement).value;
    const input = document.getElementById("namesbaseTextarea") as HTMLTextAreaElement;
    if (input.value.split(",").length < 3) {
      tip("The names data provided is too short or incorrect", false, "error");
      return;
    }
    const securedNamesData = input.value.replace(/[/|]/g, "");
    worldContext.nameBases[base].b = securedNamesData;
    input.value = securedNamesData;
    Names.updateChain(base);
  }

  private updateBaseName(rawName: string): void {
    const select = document.getElementById("namesbaseSelect") as HTMLSelectElement;
    const base = +select.value;
    const name = rawName.replace(/[/|]/g, "");
    select.options[select.selectedIndex].innerHTML = name;
    worldContext.nameBases[base].name = name;
  }

  private updateBaseMin(value: string): void {
    const base = +(document.getElementById("namesbaseSelect") as HTMLSelectElement).value;
    if (+value > worldContext.nameBases[base].max) {
      tip("Minimal length cannot be greater than maximal", false, "error");
      return;
    }
    worldContext.nameBases[base].min = +value;
  }

  private updateBaseMax(value: string): void {
    const base = +(document.getElementById("namesbaseSelect") as HTMLSelectElement).value;
    if (+value < worldContext.nameBases[base].min) {
      tip("Maximal length should be greater than minimal", false, "error");
      return;
    }
    worldContext.nameBases[base].max = +value;
  }

  private updateBaseDuplication(value: string): void {
    const base = +(document.getElementById("namesbaseSelect") as HTMLSelectElement).value;
    worldContext.nameBases[base].d = value;
  }

  private analyzeNamesbase(): void {
    const namesSourceString = (document.getElementById("namesbaseTextarea") as HTMLTextAreaElement).value;
    const namesArray = namesSourceString.toLowerCase().split(",");
    const length = namesArray.length;
    if (!namesSourceString || !length) {
      tip("Names data should not be empty", false, "error");
      return;
    }

    const chain = Names.calculateChain(namesSourceString);
    const chainValues = Object.values(chain) as string[][];
    const variety = rn(mean(chainValues.map(kv => kv.length)) ?? 0);

    const wordsLength = namesArray.map(n => n.length);

    const nonLatin = namesSourceString.match(/[\u0080-\uFFFF]/gu);
    const nonBasicLatinChars = nonLatin
      ? unique(
          namesSourceString
            .match(/[\u0080-\uFFFF]/gu)!
            .join("")
            .toLowerCase()
            .split("")
        ).join("")
      : "none";

    const geminate = namesArray.flatMap(name => name.match(/[^\w\s]|(.)(?=\1)/g) ?? []);
    const doubled = unique(geminate).filter(char => geminate.filter(d => d === char).length > 3);
    const doubledStr = doubled.length ? doubled.join("") : "none";

    const duplicates = unique(namesArray.filter((e, i, a) => a.indexOf(e) !== i)).join(", ") || "none";
    const multiwordRate = mean(namesArray.map(n => +n.includes(" "))) ?? 0;

    const getLengthQuality = (): string => {
      if (length < 30)
        return "<span data-tip='Namesbase contains < 30 names - not enough to generate reasonable data' style='color:red'>[not enough]</span>";
      if (length < 100)
        return "<span data-tip='Namesbase contains < 100 names - not enough to generate good names' style='color:darkred'>[low]</span>";
      if (length <= 400)
        return "<span data-tip='Namesbase contains a reasonable number of samples' style='color:green'>[good]</span>";
      return "<span data-tip='Namesbase contains > 400 names. That is too much, try to reduce it to ~300 names' style='color:darkred'>[overmuch]</span>";
    };

    const getVarietyLevel = (): string => {
      if (variety < 15)
        return "<span data-tip='Namesbase average variety < 15 - generated names will be too repetitive' style='color:red'>[low]</span>";
      if (variety < 30)
        return "<span data-tip='Namesbase average variety < 30 - names can be too repetitive' style='color:orange'>[mean]</span>";
      return "<span data-tip='Namesbase variety is good' style='color:green'>[good]</span>";
    };

    alertMessage.innerHTML = /* html */ `<div style="line-height: 1.6em; max-width: 20em">
      <div data-tip="Number of names provided">Namesbase length: ${length} ${getLengthQuality()}</div>
      <div data-tip="Average number of generation variants for each key in the chain">Namesbase variety: ${variety} ${getVarietyLevel()}</div>
      <hr />
      <div data-tip="The shortest name length">Min name length: ${d3min(wordsLength)}</div>
      <div data-tip="The longest name length">Max name length: ${d3max(wordsLength)}</div>
      <div data-tip="Average name length">Mean name length: ${rn(mean(wordsLength) ?? 0, 1)}</div>
      <div data-tip="Common name length">Median name length: ${median(wordsLength)}</div>
      <hr />
      <div data-tip="Characters outside of Basic Latin have bad font support">Non-basic chars: ${nonBasicLatinChars}</div>
      <div data-tip="Characters that are frequently (more than 3 times) doubled">Doubled chars: ${doubledStr}</div>
      <div data-tip="Names used more than one time">Duplicates: ${duplicates}</div>
      <div data-tip="Percentage of names containing space character">Multi-word names: ${rn(multiwordRate * 100, 2)}%</div>
    </div>`;

    openRichDialog({
      content: alertMessage.innerHTML,
      resizable: false,
      title: "Data Analysis",
      width: "auto",
      position: { my: "left top-30", at: "right+10 top", of: "#namesbaseEditor" },
      buttons: {
        OK: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  private namesbaseAdd(): void {
    const baseId = worldContext.nameBases.length;
    const b =
      "This,is,an,example,of,name,base,showing,correct,format,It,should,have,at,least,one,hundred,names,separated,with,comma";
    worldContext.nameBases.push({
      name: `Base${baseId}`,
      i: baseId,
      min: 5,
      max: 12,
      d: "",
      m: 0,
      b
    });
    const newSelect = document.getElementById("namesbaseSelect") as HTMLSelectElement;
    newSelect.add(new Option(`Base${baseId}`, String(baseId)));
    newSelect.value = String(baseId);
    (document.getElementById("namesbaseTextarea") as HTMLTextAreaElement).value = b;
    (document.getElementById("namesbaseName") as HTMLInputElement).value = `Base${baseId}`;
    (document.getElementById("namesbaseMin") as HTMLInputElement).value = "5";
    (document.getElementById("namesbaseMax") as HTMLInputElement).value = "12";
    (document.getElementById("namesbaseDouble") as HTMLInputElement).value = "";
    document.getElementById("namesbaseExamples")!.innerHTML = "Please provide names data";
  }

  private namesbaseRestoreDefault(): void {
    alertMessage.innerHTML = /* html */ `Are you sure you want to restore default namesbase?`;

    openRichDialog({
      content: alertMessage.innerHTML,
      resizable: false,
      title: "Restore default data",
      buttons: {
        Restore: () => {
          /* $(this).dialog("close") removed */
          Names.clearChains();
          worldContext.nameBases = Names.getNameBases();
          this.createBasesList();
          this.updateInputs();
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  private namesbaseDownload(): void {
    const data = worldContext.nameBases.map(b => `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${b.b}`).join("\r\n");
    const name = `${getFileName("Namesbase")}.txt`;
    downloadFile(data, name);
  }

  private namesbaseUpload(dataLoaded: string, override = true): void {
    const lines = dataLoaded
      .replace(/\r\n|\r/g, "\n")
      .split("\n")
      .filter(Boolean);
    if (!lines.length) {
      tip("Cannot load a namesbase. Please check the data format", false, "error");
      return;
    }

    Names.clearChains();
    if (override) worldContext.nameBases = [];

    const errors: ParseError[] = [];
    lines.forEach((line, index) => {
      try {
        const [rawName, min, max, d, m, rawNames] = line.split("|");
        const name = rawName?.replace(unsafe, "");
        if (!name) throw new Error("Name is missing");
        const names = rawNames?.replace(unsafe, "");
        if (!names) throw new Error("Names are missing");
        worldContext.nameBases.push({
          name,
          i: worldContext.nameBases.length,
          min: +min,
          max: +max,
          d,
          m: +m,
          b: names
        });
      } catch (e) {
        errors.push({ id: index + 1, line, error: (e as Error).message });
        ERROR && console.error(e);
      }
    });

    if (errors.length > 0) {
      ERROR && console.error("Namesbase upload errors", errors);
      const errorItems = errors
        .map(
          ({ id, line, error }) => /* html */ `<li style="padding:0.6em 0;border-top:1px solid #ddd;">
            <div>
              Line ${id}:
              <span style="color:#8b0000">${escapeHtml(error)}.</span> Data:
            </div>
            <div style="margin-top:0.35em;font-family:var(--font-monospace,monospace);font-size:0.95em;line-height:1.4;word-break:break-word;color:#333;">
              ${escapeHtml(line) || "<empty line>"}
            </div>
          </li>`
        )
        .join("");

      alertMessage.innerHTML = /* html */ `<div>
        <p style="margin:0.75em;">
          <strong>File parsing error. Only ${lines.length - errors.length} out of ${lines.length} namebases added.</strong>
          Each namebase should be on its own line and follow the format: <code>name|min|max|duplication|m|names</code>. Parameters should be separated with the <code>|</code> character, and this character should not be used within the parameters. Another prohibited character is <code>/</code>. The most common issue is names and other parameters being on two separate lines.
          <ul style="margin:0.5em;">
            <li><code>name</code>: name of the base.</li>
            <li><code>min</code>: minimal recommended length of generated names. It should be a number.</li>
            <li><code>max</code>: maximal recommended length of generated names. It should be a number greater than minimal length.</li>
            <li><code>duplication</code>: characters that can be duplicated in generated names. For example <code>lkd</code> means names like "Kalla", "Mikkor", "Dalddur" are possible. This parameter can be empty.</li>
            <li><code>m</code>: unused parameter, populate with <code>0</code>.</li>
            <li><code>names</code>: names data, separated with commas. It should contain at least 3 names to be valid.</li>
          </ul>
        </p>
        <div>
          <ul style="margin:0;padding-left:1.5em;">
            ${errorItems}
          </ul>
        </div>
      </div>`;

      openRichDialog({
        content: alertMessage.innerHTML,
        resizable: false,
        title: "Parsing error",
        width: "min(72vw, 68em)",
        position: { my: "center center-4em", at: "center", of: "svg" },
        buttons: {
          Continue: () => {
            /* $(this).dialog("close") removed */
          }
        }
      });
    }

    this.createBasesList();
    this.updateInputs();
  }
}

export const NamesbaseEditor = new NamesbaseEditorModule();
export function initNamesbaseEditor(): void {
  NamesbaseEditor.init();
}
