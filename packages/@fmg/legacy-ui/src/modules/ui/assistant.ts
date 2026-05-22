type AssistantDeps = {
  showDataTip: (...args: any[]) => void;
};

type TourDeps = {
  document: Document;
  localStorage: Storage;
  UITour: { start: () => void };
};

let isAssistantLoaded = false;

export function toggleAssistantWidget({ showDataTip }: AssistantDeps) {
  const showAssistant = document.getElementById("azgaarAssistant")?.value === "show";
  if (showAssistant) {
    if (isAssistantLoaded) {
      const assistantContainer = document.getElementById("chat-widget-container");
      if (assistantContainer) assistantContainer.style.display = "block";
    } else {
      import("../../libs/openwidget.min.js").then(() => {
        isAssistantLoaded = true;
        setTimeout(() => {
          const bubble = document.getElementById("chat-widget-minimized");
          if (bubble) {
            bubble.dataset.tip = "Click to open the Assistant";
            bubble.on("mouseover", showDataTip);
          }
        }, 5000);
      });
    }
  } else if (isAssistantLoaded) {
    const assistantContainer = document.getElementById("chat-widget-container");
    if (assistantContainer) assistantContainer.style.display = "none";
  }
}

export function initTourPromptButtonUI({ document, localStorage, UITour }: TourDeps) {
  const MAX_SHOWS = 3;
  const STORAGE_KEY = "fmg-tour-prompt-count";
  const btn = document.getElementById("tourPromptButton");
  if (!btn) return;

  const count = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  if (count >= MAX_SHOWS) return;

  localStorage.setItem(STORAGE_KEY, String(count + 1));
  btn.style.display = "flex";
  btn.addEventListener("click", () => {
    UITour.start();
  });
}
