// City Generator — vanilla DOM shell.
//
// M0: scaffold only. Renders a placeholder so the Vite MPA entry and the
// src/city-generator/ module graph are proven to load at /city/.
// M1+ adds the SVG canvas, the generation-step slider, layer toggles and
// pan/zoom (see docs/city-generator/design.md §2, §4, §5).

/** Mount the City Generator UI into the given container. */
export function mountCityGenerator(root: HTMLElement): void {
  root.replaceChildren(buildPlaceholder());
}

function buildPlaceholder(): HTMLElement {
  const box = document.createElement("div");
  box.className = "cg-placeholder";

  const title = document.createElement("h1");
  title.textContent = "City Generator";

  const note = document.createElement("p");
  note.textContent = "Scaffold ready — generation pipeline lands in M1.";

  box.append(title, note);
  return box;
}
