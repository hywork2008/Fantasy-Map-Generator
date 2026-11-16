import { setEditorPageMetadata } from "../i18n/editorMessages";
import { mountCityEditor } from "./components/CityEditorPage";
import { DEFAULT_EDITOR_MODE } from "./components/modeSwitch";

setEditorPageMetadata("cityEditor");

const root = document.getElementById("city-editor-root");
if (!root) throw new Error("City Editor: #city-editor-root not found");
mountCityEditor(root, { startMode: DEFAULT_EDITOR_MODE });
