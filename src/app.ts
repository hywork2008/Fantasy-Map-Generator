import { appServices } from "./context/appServices";
import { viewContext } from "./context/viewContext";
import { worldContext } from "./context/worldContext";
import { initControllers } from "./controllers/index";
import { initMain } from "./main";
import { initModules } from "./modules/index";
import { initRenderers } from "./renderers/index";
import { initUtils } from "./utils/index";

async function initApp(): Promise<void> {
  console.log("initApp starting...");
  console.log("Initializing React UI...");
  const { initReactUI } = await import("./ui/index");
  initReactUI();
  await new Promise(resolve => setTimeout(resolve, 0));

  console.log("Initializing utils...");
  initUtils();
  console.log("Initializing modules...");
  initModules();
  console.log("Initializing renderers...");
  initRenderers();
  console.log("Initializing controllers...");
  initControllers(worldContext, viewContext, appServices);
  console.log("Initializing main...");
  initMain();
  console.log("initApp completed!");
}

initApp();
