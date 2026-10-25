import type { GenerationSettingIssue } from "../generators/generationSettingIssues";

/** Render field feedback without changing native validity or existing help text. */
export function renderGenerationSettingFeedback(
  output: HTMLElement,
  controls: Record<string, HTMLElement | null | undefined>,
  issues: GenerationSettingIssue[]
) {
  for (const control of Object.values(controls)) {
    if (!control) continue;
    control.classList.remove("ce-setting-invalid");
    control.removeAttribute("aria-invalid");
    const descriptions = (control.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(id => id && !id.startsWith(`${output.id}-`));
    if (descriptions.length) control.setAttribute("aria-describedby", descriptions.join(" "));
    else control.removeAttribute("aria-describedby");
  }
  output.replaceChildren();
  output.hidden = !issues.length;
  issues.forEach((issue, index) => {
    const item = document.createElement("p");
    item.id = `${output.id}-${index}`;
    item.textContent = `⚠ ${issue.message} ${issue.remedy}`;
    output.append(item);
    for (const field of issue.fields) {
      const control = controls[field];
      if (!control) continue;
      control.classList.add("ce-setting-invalid");
      control.setAttribute("aria-invalid", "true");
      control.setAttribute(
        "aria-describedby",
        [control.getAttribute("aria-describedby"), item.id].filter(Boolean).join(" ")
      );
    }
  });
}
