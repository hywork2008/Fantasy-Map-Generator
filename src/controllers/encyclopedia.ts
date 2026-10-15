import { encyclopediaStore } from "../store/encyclopediaState";
import { isDialogOpen, openDialog } from "../ui/dialogs/dialogService";

/** Opens the Encyclopedia, optionally at a specific entry (e.g. "feature:cost-of-living"). */
export function openEncyclopedia(entryId?: string): void {
  if (entryId) encyclopediaStore.getState().select(entryId);
  if (!isDialogOpen("encyclopedia")) openDialog("encyclopedia", { title: "Encyclopedia" });
}
