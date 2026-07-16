import { setStateEditorState } from "../store/stateEditorState";
import { openDialog } from "../ui/dialogs/dialogService";

/** Opens the single-state State Editor dialog (Overview / Provinces / Burgs tabs), reset to the Overview tab. */
export function openStateEditor(stateId: number): void {
  setStateEditorState({ stateId, activeTab: "overview" });
  openDialog("stateEditor");
}
