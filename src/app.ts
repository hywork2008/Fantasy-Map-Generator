import { initControllers } from "./controllers/index";
import { initMain } from "./main";
import { initModules } from "./modules/index";
import { initRenderers } from "./renderers/index";
import { initUtils } from "./utils/index";

function initApp(): void {
  console.log("initApp starting...");
  console.log("Initializing utils...");
  initUtils();
  console.log("Initializing modules...");
  initModules();
  console.log("Initializing renderers...");
  initRenderers();
  console.log("Initializing controllers...");
  initControllers();
  console.log("Initializing main...");
  initMain();
  console.log("initApp completed!");
}

initApp();
