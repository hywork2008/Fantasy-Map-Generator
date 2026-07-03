export function injectInfrastructure(container: HTMLElement): void {
  // Tooltip
  const tooltip = document.createElement("div");
  tooltip.id = "tooltip";
  tooltip.style.opacity = "0";
  tooltip.setAttribute("data-main", "Click the arrow button for options. Zoom in to see the map in details");
  container.appendChild(tooltip);

  // Map Overlay
  const mapOverlay = document.createElement("div");
  mapOverlay.id = "mapOverlay";
  mapOverlay.style.display = "none";
  mapOverlay.textContent = "Drop a map file to open";
  container.appendChild(mapOverlay);

  // File Inputs
  const fileInputs = document.createElement("div");
  fileInputs.id = "fileInputs";
  fileInputs.style.display = "none";
  fileInputs.innerHTML = `
    <input type="file" accept=".map,.gz" id="mapToLoad" />
    <input type="file" accept=".txt,.csv" id="burgsListToLoad" />
    <input type="file" accept=".txt" id="legendsToLoad" />
    <input type="file" accept="image/*" id="imageToLoad" />
    <input type="file" accept="image/*" id="emblemImageToLoad" />
    <input type="file" accept=".svg" id="emblemSVGToLoad" />
    <input type="file" accept=".txt" id="templateToLoad" />
    <input type="file" accept=".txt" id="namesbaseToLoad" />
    <input type="file" accept=".json" id="styleToLoad" />
    <input type="file" accept=".csv" id="culturesCSVToLoad" />
  `;
  container.appendChild(fileInputs);
}

export function injectVisibleUI(container: HTMLElement): void {
  // Loading screen
  const loading = document.createElement("div");
  loading.id = "loading";
  loading.innerHTML = `
    <svg width="100%" height="100%">
      <rect x="-1%" y="-1%" width="102%" height="102%" fill="#466eab" />
      <rect x="-1%" y="-1%" width="102%" height="102%" fill="url(#oceanic)" />
    </svg>
    <svg id="loading-rose" width="100%" height="100%" viewBox="0 0 700 700">
      <use href="#defs-compass-rose" x="50%" y="50%" />
    </svg>
    <div id="loading-typography">
      <div id="titleName">Azgaar's</div>
      <div id="title">Fantasy Map Generator</div>
      <div id="versionText">‎ ‎</div>
      <p id="loading-text">LOADING<span>.</span><span>.</span><span>.</span></p>
    </div>
  `;
  container.appendChild(loading);

  // Dialogs container
  const dialogs = document.createElement("div");
  dialogs.id = "dialogs";
  container.appendChild(dialogs);

  // Tour Prompt Button
  const tourPromptButton = document.createElement("div");
  tourPromptButton.id = "tourPromptButton";
  tourPromptButton.style.display = "none";
  tourPromptButton.setAttribute("data-tip", "Take an interactive tour of the map generator");
  tourPromptButton.innerHTML = `
    <button type="button" aria-label="Launch UI Tour">
      <svg preserveAspectRatio="xMidYMid" viewBox="0 0 58 52" height="30px" width="30px">
        <path d="M20 10 L20 42 L42 26 Z" />
      </svg>
    </button>
  `;
  container.appendChild(tourPromptButton);

  // React UI Root
  const reactUiRoot = document.createElement("div");
  reactUiRoot.id = "react-ui-root";
  container.appendChild(reactUiRoot);
}
