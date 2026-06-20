import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { confirmationDialog } from "../controllers/editors";
import { layerIsOn } from "../controllers/layers";
import type { Burg, BurgGroup } from "../modules/burgs-generator";
import { Burgs } from "../modules/burgs-generator";
import { BurgIconsRenderer, BurgLabelsRenderer } from "../renderers";
import { modules } from "../store/editorState";
import { closeDialog, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { ensureEl } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { fitContent, tip } from "../utils/uiHelpers";

let worldContext: WorldContext;
let viewContext: ViewContext;
let appServices: AppServices;

type LimitEntity = { i?: number; name?: string; fullName?: string; color?: string; removed?: boolean };
type ParsedValue = string | number | boolean | Record<string, boolean> | null;

const GROUP_NAME_REGEXP = /^[\p{L}_][\p{L}\p{N}_-]*$/u;

export function editBurgGroups(): void {
  if (viewContext.customization) return;
  addLines();

  openDialog("burgGroupsEditor", {
    title: "Configure Burg groups",
    resizable: false,
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      Apply: () => {
        (ensureEl("burgGroupsForm") as HTMLFormElement).requestSubmit();
      },
      Add: () => {
        ensureEl("burgGroupsBody").insertAdjacentHTML("beforeend", createLine({ name: "", active: true, order: 1 }));
      },
      Restore: () => {
        worldContext.options.burgs.groups = Burgs.getDefaultGroups();
        addLines();
      },
      Cancel: () => {
        /* $(this).dialog("close") removed */
      }
    }
  });

  if (modules.editBurgGroups) return;
  modules.editBurgGroups = true;

  // add listeners
  const formEl = ensureEl("burgGroupsForm");
  formEl.addEventListener("change", validateForm);
  formEl.addEventListener("submit", submitForm);
  ensureEl("burgGroupsBody").addEventListener("click", (ev: Event) => {
    const e = ev as MouseEvent;
    const el = e.target as HTMLElement;
    const line = el.closest("tr") as HTMLTableRowElement | null;
    if (!line) return;

    if (el.getAttribute("name") === "biomes") {
      const biomes = Array(worldContext.biomesData.i.length)
        .fill(null)
        .map((_, i) => ({ i, name: worldContext.biomesData.name[i], color: worldContext.biomesData.color[i] }));
      return selectLimitation(el as HTMLButtonElement, biomes);
    }
    if (el.getAttribute("name") === "states")
      return selectLimitation(el as HTMLButtonElement, worldContext.pack.states);
    if (el.getAttribute("name") === "cultures")
      return selectLimitation(el as HTMLButtonElement, worldContext.pack.cultures);
    if (el.getAttribute("name") === "religions")
      return selectLimitation(el as HTMLButtonElement, worldContext.pack.religions);
    if (el.getAttribute("name") === "features") return selectFeaturesLimitation(el as HTMLButtonElement);
    if (el.getAttribute("name") === "up") return line.parentNode!.insertBefore(line, line.previousElementSibling);
    if (el.getAttribute("name") === "down") return line.parentNode!.insertBefore(line.nextElementSibling!, line);
    if (el.getAttribute("name") === "remove") return removeLine(line);
  });

  function addLines(): void {
    const lines = worldContext.options.burgs.groups.map(createLine);
    ensureEl("burgGroupsBody").innerHTML = lines.join("");
  }

  function createLine(group: BurgGroup): string {
    const count = worldContext.pack.burgs.filter((burg: Burg) => !burg.removed && burg.group === group.name).length;
    // prettier-ignore
    return /* html */ `<tr name="${group.name}">
      <td data-tip="Rendering order: higher values are rendered on top"><input type="number" name="order" min="1" max="999" step="1" required value="${group.order || ""}" /></td>
      <td data-tip="Type group name. Must start with a letter or underscore, followed by letters, digits, underscores, or dashes. Spaces are not allowed"><input type="text" name="name" value="${group.name}" required /></td>
      <td data-tip="Burg preview generator">
        <select name="preview">
          <option value="" ${!group.preview ? "selected" : ""}>no</option>
          <option value="watabou-city" ${group.preview === "watabou-city" ? "selected" : ""}>Watabou City</option>
          <option value="watabou-village" ${group.preview === "watabou-village" ? "selected" : ""}>Watabou Village</option>
          <option value="watabou-dwelling" ${group.preview === "watabou-dwelling" ? "selected" : ""}>Watabou Dwelling</option>
        </select>
      </td>
      <td data-tip="Set min population constraint in population points (see the multiplier in Units Editor)"><input type="number" name="min" min="0" step="any" value="${group.min || ""}" /></td>
      <td data-tip="Set max population constraint in population points (see the multiplier in Units Editor)"><input type="number" name="max" min="0" step="any" value="${group.max || ""}" /></td>
      <td data-tip="Set population percentile: 0-100, where 90 means the burg must have a population higher than 90% of all burgs"><input type="number" name="percentile" min="0" max="100" step="any" value="${group.percentile || ""}" /></td>
      <td data-tip="Select allowed biomes">
        <input type="hidden" name="biomes" value="${group.biomes || ""}">
        <button type="button" name="biomes">${group.biomes ? "some" : "all"}</button>
      </td>
      <td data-tip="Select allowed states">
        <input type="hidden" name="states" value="${group.states || ""}">
        <button type="button" name="states">${group.states ? "some" : "all"}</button>
      </td>
      <td data-tip="Select allowed cultures">
        <input type="hidden" name="cultures" value="${group.cultures || ""}">
        <button type="button" name="cultures">${group.cultures ? "some" : "all"}</button>
      </td>
      <td data-tip="Select allowed religions">
        <input type="hidden" name="religions" value="${group.religions || ""}">
        <button type="button" name="religions">${group.religions ? "some" : "all"}</button>
      </td>
      <td data-tip="Select allowed features" >
        <input type="hidden" name="features" value='${JSON.stringify(group.features || {})}'>
        <button type="button" name="features">${Object.keys(group.features || {}).length ? "some" : "any"}</button>
      </td>
      <td data-tip="Number of burgs in group">${count}</td>
      <td data-tip="Activate/deactivate group"><input type="checkbox" name="active" class="native" ${group.active && "checked"} /></td>
      <td data-tip="Select group to be assigned if other groups are not passed"><input type="radio" name="isDefault" ${group.isDefault && "checked"}></td>
      <td data-tip="Assignment order: move group up"><button type="button" name="up" class="icon-up-big"></button></td>
      <td data-tip="Assignment order: move group down"><button type="button" name="down" class="icon-down-big"></button></td>
      <td data-tip="Remove group"><button type="button" name="remove" class="icon-trash"></button></td>
    </tr>`;
  }

  function selectLimitation(el: HTMLButtonElement, data: LimitEntity[]): void {
    const hiddenInput = el.previousElementSibling as HTMLInputElement;
    const value = hiddenInput.value;
    const initial = value ? value.split(",").map(v => +v) : [];

    const filtered = data.filter(datum => datum.i && !datum.removed);
    const lines = filtered.map(
      ({ i, name, fullName, color }) => /* html */ `
        <tr data-tip="${name}">
          <td>
            <span style="color:${color}">⬤</span>
          </td>
          <td>
            <input data-i="${i}" id="el${i}" type="checkbox" class="checkbox" ${
              !initial.length || (i !== undefined && initial.includes(i)) ? "checked" : ""
            } >
            <label for="el${i}" class="checkbox-label">${fullName || name}</label>
          </td>
        </tr>`
    );

    alertMessage.innerHTML = /* html */ `<b>Limit group by ${el.getAttribute("name")}:</b>
      <table style="margin-top:.3em">
        <tbody>
          ${lines.join("")}
        </tbody>
      </table>`;

    openRichDialog({
      content: alertMessage.innerHTML,
      width: fitContent(),
      title: "Limit group",
      buttons: {
        Invert: () => {
          alertMessage.querySelectorAll("input").forEach(inp => {
            (inp as HTMLInputElement).checked = !(inp as HTMLInputElement).checked;
          });
        },
        Apply: () => {
          const inputs = Array.from(alertMessage.querySelectorAll("input")) as HTMLInputElement[];
          const selected = inputs.reduce((acc: string[], input) => {
            if (input.checked) acc.push(input.dataset.i!);
            return acc;
          }, []);

          if (!selected.length) return tip("Select at least one element", false, "error");

          const allAreSelected = selected.length === inputs.length;
          hiddenInput.value = allAreSelected ? "" : selected.join(",");
          el.innerHTML = allAreSelected ? "all" : "some";
          /* $(this).dialog("close") removed */
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function selectFeaturesLimitation(el: HTMLButtonElement): void {
    const hiddenInput = el.previousElementSibling as HTMLInputElement;
    const value = hiddenInput.value;
    const initial: Record<string, boolean> = value ? JSON.parse(value) : {};

    const features = [
      { name: "capital", icon: "icon-star" },
      { name: "port", icon: "icon-anchor" },
      { name: "citadel", icon: "icon-chess-rook" },
      { name: "walls", icon: "icon-fort-awesome" },
      { name: "plaza", icon: "icon-store" },
      { name: "temple", icon: "icon-chess-bishop" },
      { name: "shanty", icon: "icon-campground" }
    ];

    const lines = features.map(
      // prettier-ignore
      ({ name, icon }) => /* html */ `
        <tr data-tip="Select limitation for burg feature: ${name}">
          <td>
            <span class="${icon}"></span>
            <span style="margin-left:.2em">${name}</span>
          </td>
          <td>
            <input type="radio" name="${name}" value="true" ${initial[name] === true ? "checked" : ""} style="margin:0" >
          </td>
          <td>
            <input type="radio" name="${name}" value="false" ${initial[name] === false ? "checked" : ""} style="margin:0">
          </td>
          <td>
            <input type="radio" name="${name}" value="undefined" ${initial[name] === undefined ? "checked" : ""} style="margin:0">
          </td>
        </tr>`
    );

    alertMessage.innerHTML = /* html */ `
      <form id="featuresLimitationForm">
        <table>
          <thead style="font-weight:bold">
            <td style="width:6em">Features</td>
            <td style="width:3em">True</td>
            <td style="width:3em">False</td>
            <td style="width:3em">Any</td>
          </thead>
          <tbody>
            ${lines.join("")}
          </tbody>
        </table>
      </form>`;

    openRichDialog({
      content: alertMessage.innerHTML,
      width: fitContent(),
      title: "Limit group by features",
      buttons: {
        Apply: () => {
          const form = ensureEl("featuresLimitationForm") as HTMLFormElement;
          const values = features.reduce((acc: Record<string, boolean>, { name }) => {
            const value = (form.elements.namedItem(name) as HTMLInputElement | null)?.value;
            if (value !== "undefined") acc[name] = value === "true";
            return acc;
          }, {});

          hiddenInput.value = JSON.stringify(values);
          el.innerHTML = Object.keys(values).length ? "some" : "any";
          /* $(this).dialog("close") removed */
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function removeLine(line: HTMLTableRowElement): void {
    const lines = ensureEl("burgGroupsBody").children;
    if (lines.length < 2) {
      tip("At least one group should be defined", false, "error");
      return;
    }

    confirmationDialog({
      title: "Remove group",
      message:
        "Are you sure you want to remove the group? <br>This WON'T change the burgs unless the changes are applied",
      confirm: "Remove",
      onConfirm: () => {
        line.remove();
        validateForm();
      }
    });
  }

  function validateForm(): boolean {
    const form = ensureEl("burgGroupsForm") as HTMLFormElement;
    const nameInputs = form.querySelectorAll<HTMLInputElement>("[name='name']");

    if (nameInputs.length > 1) {
      const names = Array.from(nameInputs).map(input => input.value);
      nameInputs.forEach(nameInput => {
        const value = nameInput.value;
        const isFormatValid = GROUP_NAME_REGEXP.test(value);
        const isUnique = names.filter(n => n === value).length === 1;
        const message = !isFormatValid
          ? "Group name must start with a letter or underscore and then contain only letters, digits, underscores, or dashes"
          : !isUnique
            ? "Group name should be unique"
            : "";
        nameInput.setCustomValidity(message);
      });
    } else if (nameInputs.length === 1) {
      const value = nameInputs[0].value;
      const isFormatValid = GROUP_NAME_REGEXP.test(value);
      const message = isFormatValid
        ? ""
        : "Group name must start with a letter or underscore and then contain only letters, digits, underscores, or dashes";
      nameInputs[0].setCustomValidity(message);
    }

    const activeInputs = form.querySelectorAll<HTMLInputElement>("[name='active']");
    if (activeInputs.length > 1) {
      const active = Array.from(activeInputs).map(input => input.checked);
      activeInputs[0].setCustomValidity(active.includes(true) ? "" : "At least one group should be active");
    } else if (activeInputs.length === 1) {
      activeInputs[0].setCustomValidity(activeInputs[0].checked ? "" : "At least one group should be active");
    }

    const defaultInputs = form.querySelectorAll<HTMLInputElement>("[name='isDefault']");
    if (defaultInputs.length > 1) {
      const checked = Array.from(defaultInputs).map(input => input.checked);
      defaultInputs[0].setCustomValidity(checked.includes(true) ? "" : "At least one group should be default");
    } else if (defaultInputs.length === 1) {
      defaultInputs[0].setCustomValidity(defaultInputs[0].checked ? "" : "At least one group should be default");
    }

    const isValid = form.checkValidity();
    if (!isValid) form.reportValidity();
    return isValid;
  }

  function submitForm(event: Event): void {
    event.preventDefault();
    if (!validateForm()) return;

    const lines = Array.from(ensureEl("burgGroupsBody").children) as HTMLTableRowElement[];
    if (!lines.length) {
      tip("At least one group should be defined", false, "error");
      return;
    }

    function parseInput(input: HTMLInputElement | HTMLSelectElement): ParsedValue {
      if (input.name === "name") return input.value;
      if (input.name === "features") {
        const isValid = JSON.isValid(input.value);
        const parsed = isValid ? JSON.parse(input.value) : {};
        if (Object.keys(parsed).length) return parsed;
        return null;
      }
      if (input.type === "hidden") return input.value || null;
      if (input.type === "radio") return (input as HTMLInputElement).checked;
      if (input.type === "checkbox") return (input as HTMLInputElement).checked;
      if (input.type === "number") {
        const value = (input as HTMLInputElement).valueAsNumber;
        if (value === 0 || Number.isNaN(value)) return null;
        return value;
      }
      return input.value || null;
    }

    worldContext.options.burgs.groups = lines.map((line: HTMLTableRowElement) => {
      const inputs = line.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select");
      const group = Array.from(inputs).reduce((obj: Record<string, ParsedValue>, input) => {
        const value = parseInput(input);
        if (value !== null) obj[input.name] = value;
        return obj;
      }, {});
      return group as unknown as BurgGroup;
    });
    localStorage.setItem("burg-groups", JSON.stringify(worldContext.options.burgs.groups));

    // put burgs to new groups
    const validBurgs = worldContext.pack.burgs.filter((b: Burg) => b.i && !b.removed);
    const populations = validBurgs
      .map((b: Burg) => b.population)
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b);
    validBurgs.forEach((burg: Burg) => {
      Burgs.defineGroup(burg, populations);
    });

    if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
    if (layerIsOn("toggleLabels")) BurgLabelsRenderer.render(worldContext, viewContext, appServices);
    if (burgsOverviewRefresh?.offsetParent) burgsOverviewRefresh.click();

    closeDialog("burgGroupsEditor");
  }
}

export function initBurgGroupEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
