type AssistantDeps = {
  showDataTip: (this: HTMLElement, event: Event) => void;
};

type TourDeps = {
  document: Document;
  localStorage: Storage;
  startTour: () => void;
};

let isAssistantLoaded = false;
let assistantLoadPromise: Promise<void> | null = null;

function loadAssistantScript() {
  if (assistantLoadPromise) return assistantLoadPromise;

  assistantLoadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("openwidget-loader") as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load assistant widget")), { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "openwidget-loader";
    script.src = "libs/openwidget.min.js";
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true }
    );
    script.addEventListener("error", () => reject(new Error("Failed to load assistant widget")), { once: true });
    document.head.appendChild(script);
  });

  return assistantLoadPromise;
}

export function toggleAssistantWidget({ showDataTip }: AssistantDeps) {
  const assistantToggle = document.getElementById("azgaarAssistant") as HTMLInputElement | HTMLSelectElement | null;
  const showAssistant = assistantToggle?.value === "show";
  if (showAssistant) {
    if (isAssistantLoaded) {
      const assistantContainer = document.getElementById("chat-widget-container");
      if (assistantContainer) assistantContainer.style.display = "block";
    } else {
      loadAssistantScript()
        .then(() => {
          isAssistantLoaded = true;
          setTimeout(() => {
            const bubble = document.getElementById("chat-widget-minimized");
            if (bubble instanceof HTMLElement) {
              bubble.dataset.tip = "Click to open the Assistant";
              bubble.addEventListener("mouseover", function (event) {
                showDataTip.call(this, event);
              });
            }
          }, 5000);
        })
        .catch(error => console.error(error));
    }
  } else if (isAssistantLoaded) {
    const assistantContainer = document.getElementById("chat-widget-container");
    if (assistantContainer) assistantContainer.style.display = "none";
  }
}

export function initTourPromptButtonUI({ document, localStorage, startTour }: TourDeps) {
  const MAX_SHOWS = 3;
  const STORAGE_KEY = "fmg-tour-prompt-count";
  const btn = document.getElementById("tourPromptButton");
  if (!btn) return;

  const count = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  if (count >= MAX_SHOWS) return;

  localStorage.setItem(STORAGE_KEY, String(count + 1));
  btn.style.display = "flex";
  btn.addEventListener("click", () => {
    startTour();
  });
}
