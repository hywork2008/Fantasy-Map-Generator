import { expect, it } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import share from "../data/fixtures/amerford-20261027.json";
import type { BurgSiteDescriptor } from "../types/contracts/burgSiteDescriptor";
import { describeImportedSite } from "./importedSite";

it("lists sea and river port access independently in the FMG parameters", () => {
  const site = structuredClone(share.descriptor) as BurgSiteDescriptor;
  const text = () =>
    describeImportedSite(site, "link")
      .map(node => node.textContent)
      .join("\n");
  expect(text()).toContain(
    `${editorText("cityEditor.fmgParameters.seaPort")} · ${editorText("cityEditor.fmgParameters.riverPort")}`
  );
  site.burg.waterAccess!.port.river = false;
  expect(text()).toContain(editorText("cityEditor.fmgParameters.seaPort"));
  expect(text()).not.toContain(editorText("cityEditor.fmgParameters.riverPort"));
  site.burg.waterAccess!.port.sea = false;
  site.burg.waterAccess!.port.river = true;
  expect(text()).toContain(editorText("cityEditor.fmgParameters.riverPort"));
});
