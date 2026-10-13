import { setEditorPageMetadata } from "../i18n/editorMessages";
import { mountCityEditor } from "./components/CityEditorPage";

setEditorPageMetadata("cityEditor");

const root = document.getElementById("city-editor-root");
if (!root) throw new Error("City Editor: #city-editor-root not found");
mountCityEditor(root);
