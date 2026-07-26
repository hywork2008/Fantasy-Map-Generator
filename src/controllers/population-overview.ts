import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";

export function overviewPopulation(): void {
  closeDialogs("#populationOverview, .stable");
  openDialog("populationOverview", {
    title: "Population Overview"
  });
}
