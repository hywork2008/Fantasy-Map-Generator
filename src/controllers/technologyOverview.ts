import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";

export function overviewTechnology(): void {
  closeDialogs("#technologyOverview, .stable");
  openDialog("technologyOverview", {
    title: "Technology Overview"
  });
}
