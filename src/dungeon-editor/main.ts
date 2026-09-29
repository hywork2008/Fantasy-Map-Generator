import { mountDungeonEditor } from "./ui/DungeonEditorPage";
import "./ui/dungeon-editor.css";

const root = document.getElementById("dungeon-editor-root");
if (!root) throw new Error("Dungeon Editor: #dungeon-editor-root not found");
mountDungeonEditor(root);
