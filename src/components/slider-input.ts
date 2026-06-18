{
  const style = /* css */ `
    slider-input {
      display: flex;
      align-items: center;
      gap: .4em;
    }
  `;

  const styleElement = document.createElement("style");
  styleElement.setAttribute("type", "text/css");
  styleElement.innerHTML = style;
  document.head.appendChild(styleElement);
}

{
  const template = document.createElement("template");
  template.innerHTML = /* html */ `
    <input type="range" />
    <input type="number" />
  `;

  class SliderInput extends HTMLElement {
    static get observedAttributes() {
      return ["value", "min", "max", "step"];
    }

    connectedCallback() {
      if (!this.querySelector("input[type=range]")) {
        this.appendChild(template.content.cloneNode(true));

        const range = this.querySelector("input[type=range]") as HTMLInputElement;
        const number = this.querySelector("input[type=number]") as HTMLInputElement;

        // Set min/max/step before value so browser clamping works correctly
        range.min = number.min = this.getAttribute("min") || "0";
        range.max = number.max = this.getAttribute("max") || "100";
        range.step = number.step = this.getAttribute("step") || "1";
        const initialValue = this.getAttribute("value");
        range.value = number.value = initialValue !== null ? initialValue : range.min;

        range.addEventListener("input", this.handleEvent.bind(this));
        number.addEventListener("input", this.handleEvent.bind(this));
        range.addEventListener("change", this.handleEvent.bind(this));
        number.addEventListener("change", this.handleEvent.bind(this));
      }
    }

    attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
      const range = this.querySelector("input[type=range]") as HTMLInputElement | null;
      const number = this.querySelector("input[type=number]") as HTMLInputElement | null;
      if (!range || !number || newValue === null) return;
      if (name === "value") range.value = number.value = newValue;
      else if (name === "min") range.min = number.min = newValue;
      else if (name === "max") range.max = number.max = newValue;
      else if (name === "step") range.step = number.step = newValue;
    }

    handleEvent(e: Event) {
      const value = (e.target as HTMLInputElement).value;
      const valueIsNaN = Number.isNaN(Number(value));
      if (valueIsNaN || value === "") return e.stopPropagation();

      this.value = value; // setter clamps to valid range
      const clampedValue = this.value; // read back browser-clamped value from getter

      this.dispatchEvent(
        new CustomEvent(e.type, {
          detail: { value: clampedValue },
          bubbles: true,
          composed: true
        })
      );
    }

    set value(value: string) {
      const range = this.querySelector("input[type=range]") as HTMLInputElement | null;
      const number = this.querySelector("input[type=number]") as HTMLInputElement | null;
      if (!range || !number) return;
      const numVal = parseFloat(value);
      const min = parseFloat(range.min);
      const max = parseFloat(range.max);
      const clamped =
        !Number.isNaN(numVal) && !Number.isNaN(min) && !Number.isNaN(max)
          ? String(Math.min(Math.max(numVal, min), max))
          : value;
      range.value = number.value = clamped;
    }

    get value() {
      // Use range.value — the browser clamps it to [min, max] automatically
      const range = this.querySelector("input[type=range]") as HTMLInputElement | null;
      return range ? range.value : "";
    }

    get valueAsNumber() {
      const number = this.querySelector("input[type=number]") as HTMLInputElement | null;
      return number?.valueAsNumber ?? NaN;
    }
  }

  customElements.define("slider-input", SliderInput);
}
