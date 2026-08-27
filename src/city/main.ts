// Entry point for the standalone City Generator page (Vite MPA entry `city`).
// Deliberately isolated from src/main.ts / src/app.ts — the world map bundle and
// this one share no module graph. See docs/city-generator/design.md.

import { mountCityGenerator } from "../city-generator/ui/CityGeneratorPage";

const root = document.getElementById("city-generator-root");

if (!root) {
  throw new Error("City Generator: #city-generator-root not found");
}

try {
  mountCityGenerator(root);
} catch (err) {
  console.error(err);
  root.textContent = String(err);
}
