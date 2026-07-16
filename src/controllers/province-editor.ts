import { setProvinceEditorState } from "../store/provinceEditorState";
import { openDialog } from "../ui/dialogs/dialogService";

/** Opens the single-province Province Editor dialog (Overview / Burgs tabs), reset to the Overview tab. */
export function openProvinceEditor(provinceId: number): void {
  setProvinceEditorState({ provinceId, activeTab: "overview" });
  openDialog("provinceEditor");
}
