// @ts-nocheck
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
        constructor() {
            super();
            this.appendChild(template.content.cloneNode(true));
            const range = this.querySelector("input[type=range]");
            const number = this.querySelector("input[type=number]");
            range.value = number.value = this.value || this.getAttribute("value") || "50";
            range.min = number.min = this.getAttribute("min") || "0";
            range.max = number.max = this.getAttribute("max") || "100";
            range.step = number.step = this.getAttribute("step") || "1";
            const boundHandler = this.handleEvent.bind(this);
            range.addEventListener("input", boundHandler);
            number.addEventListener("input", boundHandler);
            range.addEventListener("change", boundHandler);
            number.addEventListener("change", boundHandler);
        }
        handleEvent(e) {
            const target = e.target;
            const value = target?.value;
            const isInvalid = value === undefined || Number.isNaN(Number(value));
            if (isInvalid || value === "")
                return e.stopPropagation();
            const range = this.querySelector("input[type=range]");
            const number = this.querySelector("input[type=number]");
            this.value = range.value = number.value = value;
            this.dispatchEvent(new CustomEvent(e.type, {
                detail: { value },
                bubbles: true,
                composed: true
            }));
        }
        set value(value) {
            const range = this.querySelector("input[type=range]");
            const number = this.querySelector("input[type=number]");
            range.value = number.value = value;
        }
        get value() {
            const number = this.querySelector("input[type=number]");
            return number.value;
        }
        get valueAsNumber() {
            const number = this.querySelector("input[type=number]");
            return number.valueAsNumber;
        }
    }
    customElements.define("slider-input", SliderInput);
}
