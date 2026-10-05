import { mountRegionEditor } from "./ui/RegionEditorPage";
import "./ui/region-editor.css";

const root = document.getElementById("region-editor-root");
if (!root) throw new Error("Region Editor: #region-editor-root not found");
mountRegionEditor(root);
