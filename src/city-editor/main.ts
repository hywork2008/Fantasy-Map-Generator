import { mountCityEditor } from "./ui/CityEditorPage";

const root = document.getElementById("city-editor-root");
if (!root) throw new Error("City Editor: #city-editor-root not found");
mountCityEditor(root);
