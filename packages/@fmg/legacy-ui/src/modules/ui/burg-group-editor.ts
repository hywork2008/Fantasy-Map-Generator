"use strict";

import type { BurgGroup } from "@fmg/types";
import type { Burg } from "@fmg/core/modules/burgs-generator";
import { fitContent } from "./editors";

const GROUP_NAME_REGEXP = /^[\p{L}_][\p{L}\p{N}_-]*$/u;

type EditableBurgGroup = Partial<BurgGroup> & {
  name: string;
  order?: number;
  states?: string;
  cultures?: string;
  religions?: string;
  biomes?: number[] | string;
  preview?: string | null;
  features?: Record<string, boolean>;
};

type LimitationDatum = {
  i: number;
  name: string;
  fullName?: string;
  color?: string;
  removed?: boolean;
};

type ParsedInputValue = string | number | boolean | Record<string, boolean> | null;

const parseFeatureMap = (value: string): Record<string, boolean> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.entries(parsed as Record<string, unknown>).reduce((acc: Record<string, boolean>, [key, item]) => {
      if (typeof item === "boolean") acc[key] = item;
      return acc;
    }, {});
  } catch {
    return {};
  }
};

const getInputsByName = (form: HTMLFormElement, name: string): HTMLInputElement[] => {
  const controls = form.elements.namedItem(name);
  if (!controls) return [];
  if (controls instanceof RadioNodeList) {
    return Array.from(controls).filter((item): item is HTMLInputElement => item instanceof HTMLInputElement);
  }
  return controls instanceof HTMLInputElement ? [controls] : [];
};

class BurgGroupEditor {
  public open() {
    if (customization) return;
    this.addLines();

    $("#burgGroupsEditor").dialog({
      title: "Configure Burg groups",
      resizable: false,
      position: {my: "center", at: "center", of: "svg"},
      buttons: {
        Apply: () => {
          ensureEl("burgGroupsForm").requestSubmit();
        },
        Add: () => {
          ensureEl("burgGroupsBody").insertAdjacentHTML("beforeend", this.createLine({name: "", active: true, preview: null}));
        },
        Restore: () => {
          options.burgs.groups = Burgs.getDefaultGroups();
          this.addLines();
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });

    if (modules.editBurgGroups) return;
    modules.editBurgGroups = true;

    ensureEl("burgGroupsForm").on("change", () => this.validateForm()).on("submit", (ev: Event) => this.submitForm(ev));
    ensureEl("burgGroupsBody").on("click", (ev: MouseEvent) => {
      const el = ev.target as HTMLButtonElement;
      const line = el.closest("tr") as HTMLElement;
      if (!line) return;

      if (el.name === "biomes") {
        const biomes = Array(biomesData.i.length)
          .fill(null)
          .map((_: null, i: number) => ({i, name: biomesData.name[i], color: biomesData.color[i]}));
        return this.selectLimitation(el, biomes);
      }
      if (el.name === "states") return this.selectLimitation(el, pack.states);
      if (el.name === "cultures") return this.selectLimitation(el, pack.cultures);
      if (el.name === "religions") return this.selectLimitation(el, pack.religions);
      if (el.name === "features") return this.selectFeaturesLimitation(el);
      if (el.name === "up") return line.parentNode!.insertBefore(line, line.previousElementSibling);
      if (el.name === "down") return line.parentNode!.insertBefore(line.nextElementSibling!, line);
      if (el.name === "remove") return this.removeLine(line);
    });
  }

  private addLines() {
    const lines = options.burgs.groups.map(g => this.createLine(g as EditableBurgGroup));
    ensureEl("burgGroupsBody").innerHTML = lines.join("");
  }

  private createLine(group: EditableBurgGroup): string {
    const count = pack.burgs.filter((burg: Burg) => !burg.removed && burg.group === group.name).length;
    return /* html */ `<tr name="${group.name}">
      <td data-tip="Rendering order: higher values are rendered on top"><input type="number" name="order" min="1" max="999" step="1" required value="${group.order || ''}" /></td>
      <td data-tip="Type group name. Must start with a letter or underscore, followed by letters, digits, underscores, or dashes. Spaces are not allowed"><input type="text" name="name" value="${group.name}" required /></td>
      <td data-tip="Burg preview generator">
        <select name="preview">
          <option value="" ${!group.preview ? "selected" : ""}>no</option>
          <option value="watabou-city" ${group.preview === "watabou-city" ? "selected" : ""}>Watabou City</option>
          <option value="watabou-village" ${group.preview === "watabou-village" ? "selected" : ""}>Watabou Village</option>
          <option value="watabou-dwelling" ${group.preview === "watabou-dwelling" ? "selected" : ""}>Watabou Dwelling</option>
        </select>
      </td>
      <td data-tip="Set min population constraint in population points (see the multiplier in Units Editor)"><input type="number" name="min" min="0" step="any" value="${group.min || ''}" /></td>
      <td data-tip="Set max population constraint in population points (see the multiplier in Units Editor)"><input type="number" name="max" min="0" step="any" value="${group.max || ''}" /></td>
      <td data-tip="Set population percentile: 0-100, where 90 means the burg must have a population higher than 90% of all burgs"><input type="number" name="percentile" min="0" max="100" step="any" value="${group.percentile || ''}" /></td>
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

  private selectLimitation(el: HTMLButtonElement, data: LimitationDatum[]) {
    const value = (el.previousElementSibling as HTMLInputElement).value;
    const initial = value ? value.split(",").map(v => +v) : [];

    const filtered = data.filter(datum => datum.i && !datum.removed);
    const lines = filtered.map(
      ({i, name, fullName, color}: LimitationDatum) => /* html */ `
        <tr data-tip="${name}">
          <td>
            <span style="color:${color}">⬤</span>
          </td>
          <td>
            <input data-i="${i}" id="el${i}" type="checkbox" class="checkbox" ${
              !initial.length || initial.includes(i) ? "checked" : ""
            } >
            <label for="el${i}" class="checkbox-label">${fullName || name}</label>
          </td>
        </tr>`
    );

    alertMessage.innerHTML = /* html */ `<b>Limit group by ${el.name}:</b>
      <table style="margin-top:.3em">
        <tbody>
          ${lines.join("")}
        </tbody>
      </table>`;

    $("#alert").dialog({
      width: fitContent(),
      title: "Limit group",
      buttons: {
        Invert: function () {
          alertMessage.querySelectorAll("input").forEach((el: Element) => ((el as HTMLInputElement).checked = !(el as HTMLInputElement).checked));
        },
        Apply: function () {
          const inputs = Array.from(alertMessage.querySelectorAll("input")) as HTMLInputElement[];
          const selected = inputs.reduce((acc: string[], input) => {
            if (input.checked) acc.push(input.dataset.i!);
            return acc;
          }, []);

          if (!selected.length) return tip("Select at least one element", false, "error");

          const allAreSelected = selected.length === inputs.length;
          (el.previousElementSibling as HTMLInputElement).value = allAreSelected ? "" : selected.join(",");
          el.innerHTML = allAreSelected ? "all" : "some";
          $(this).dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private selectFeaturesLimitation(el: HTMLButtonElement) {
    const value = (el.previousElementSibling as HTMLInputElement).value;
    const initial = value ? JSON.parse(value) : {};

    const features = [
      {name: "capital", icon: "icon-star"},
      {name: "port", icon: "icon-anchor"},
      {name: "citadel", icon: "icon-chess-rook"},
      {name: "walls", icon: "icon-fort-awesome"},
      {name: "plaza", icon: "icon-store"},
      {name: "temple", icon: "icon-chess-bishop"},
      {name: "shanty", icon: "icon-campground"}
    ];

    const lines = features.map(
      ({name, icon}) => /* html */ `
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

    $("#alert").dialog({
      width: fitContent(),
      title: "Limit group by features",
      buttons: {
        Apply: function () {
          const form = ensureEl("featuresLimitationForm") as HTMLFormElement;
          const formData = new FormData(form);
          const values = features.reduce((acc: Record<string, boolean>, {name}) => {
            const value = formData.get(name);
            if (value !== "undefined") acc[name] = value === "true";
            return acc;
          }, {});

          (el.previousElementSibling as HTMLInputElement).value = JSON.stringify(values);
          el.innerHTML = Object.keys(values).length ? "some" : "any";

          $(this).dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private removeLine(line: HTMLElement) {
    const lines = ensureEl("burgGroupsBody").children;
    if (lines.length < 2) return tip("At least one group should be defined", false, "error");

    confirmationDialog({
      title: "Remove group",
      message:
        "Are you sure you want to remove the group? <br>This WON'T change the burgs unless the changes are applied",
      confirm: "Remove",
      onConfirm: () => {
        line.remove();
        this.validateForm();
      }
    });
  }

  private validateForm(): boolean {
    const form = ensureEl("burgGroupsForm") as HTMLFormElement;
    const nameInputs = getInputsByName(form, "name");

    if (nameInputs.length > 1) {
      const names = nameInputs.map(input => input.value);
      nameInputs.forEach((nameInput: HTMLInputElement) => {
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
    } else {
      const value = nameInputs[0]?.value || "";
      const isFormatValid = GROUP_NAME_REGEXP.test(value);
      const message = isFormatValid
        ? ""
        : "Group name must start with a letter or underscore and then contain only letters, digits, underscores, or dashes";
      nameInputs[0]?.setCustomValidity(message);
    }

    const activeInputs = getInputsByName(form, "active");
    if (activeInputs.length > 1) {
      const active = activeInputs.map(input => input.checked);
      activeInputs[0].setCustomValidity(active.includes(true) ? "" : "At least one group should be active");
    } else {
      const active = activeInputs[0]?.checked;
      activeInputs[0]?.setCustomValidity(active ? "" : "At least one group should be active");
    }

    const defaultInputs = getInputsByName(form, "isDefault");
    if (defaultInputs.length > 1) {
      const checked = defaultInputs.map(input => input.checked);
      defaultInputs[0].setCustomValidity(checked.includes(true) ? "" : "At least one group should be default");
    } else {
      const checked = defaultInputs[0]?.checked;
      defaultInputs[0]?.setCustomValidity(checked ? "" : "At least one group should be default");
    }

    const isValid = form.checkValidity();
    if (!isValid) form.reportValidity();
    return isValid;
  }

  private submitForm(event: Event) {
    event.preventDefault();
    if (!this.validateForm()) return;

    const lines = Array.from(ensureEl("burgGroupsBody").children);
    if (!lines.length) return tip("At least one group should be defined", false, "error");

    options.burgs.groups = lines.map(line => {
      const lineEl = line as HTMLElement;
      const inputs = lineEl.querySelectorAll("input, select");
      const group = Array.from(inputs).reduce((obj: Record<string, unknown>, input) => {
        const formInput = input as HTMLInputElement;
        const value = this.parseInput(formInput);
        if (value !== null) obj[formInput.name] = value;
        return obj;
      }, {});
      return group;
    }) as BurgGroup[];
    localStorage.setItem("burg-groups", JSON.stringify(options.burgs.groups));

    const validBurgs = pack.burgs.filter((b: Burg) => b.i && !b.removed);
    const populations = validBurgs
      .map((b: Burg) => b.population)
      .filter((value): value is number => typeof value === "number")
      .sort((a: number, b: number) => a - b);
    validBurgs.forEach((burg: Burg) => Burgs.defineGroup(burg, populations));

    if (layerIsOn("toggleBurgIcons")) drawBurgIcons();
    if (layerIsOn("toggleLabels")) drawBurgLabels();
    if ((ensureEl("burgsOverviewRefresh") as HTMLElement).offsetParent) burgsOverviewRefresh.click();

    $("#burgGroupsEditor").dialog("close");
  }

  private parseInput(input: HTMLInputElement): ParsedInputValue {
    if (input.name === "name") return input.value;
    if (input.name === "features") {
      const parsed = parseFeatureMap(input.value);
      if (Object.keys(parsed).length) return parsed;
      return null;
    }
    if (input.type === "hidden") return input.value || null;
    if (input.type === "radio") return input.checked;
    if (input.type === "checkbox") return input.checked;
    if (input.type === "number") {
      const value = input.valueAsNumber;
      if (value === 0 || isNaN(value)) return null;
      return value;
    }
    return input.value || null;
  }
}

const burgGroupEditor = new BurgGroupEditor();

export function editBurgGroups() {
  burgGroupEditor.open();
}
