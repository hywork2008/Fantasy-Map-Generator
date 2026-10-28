import { editorOptionText, editorText } from "../../i18n/editorMessages";
import { getUrbanDwellings } from "../../utils/urbanDwellings";
import { shoreDistanceMeters } from "../generators/site/shoreDistance";
import { renderFixedSitePreview } from "../renderers/fixedSitePreview";
import type { BurgSiteDescriptor } from "../types/contracts/burgSiteDescriptor";
import type { IncomingOrigin } from "../types/contracts/incomingCity";
import { formatDistance } from "../utils/editorUnits";
export function describeImportedSite(descriptor: BurgSiteDescriptor, origin: IncomingOrigin | null): Node[] {
  const water = descriptor.waterbody
    ? `${editorOptionText(descriptor.waterbody.kind)}${descriptor.waterbody.isPort ? ` · ${editorOptionText("port")}` : ""}`
    : "none";
  const yesNo = (value: boolean): string =>
    value ? editorText("cityEditor.messages.yes") : editorText("cityEditor.messages.no");
  const source =
    origin === "world"
      ? editorText("cityEditor.messages.fromWorldMap")
      : origin === "link"
        ? editorText("cityEditor.messages.fromSharedLink")
        : editorText("cityEditor.messages.importedSite");
  const roads = descriptor.roads.filter(road => road.group !== "searoutes");
  const dwellings = descriptor.burg.dwellings ?? getUrbanDwellings(descriptor.burg.population);
  const rows: [string, string][] = [
    [source, descriptor.burg.name || "(unnamed burg)"],
    [editorText("cityEditor.messages.population"), descriptor.burg.population.toLocaleString()],
    [editorText("cityEditor.messages.dwellings"), dwellings.toLocaleString()],
    [editorText("cityEditor.messages.radius"), `${Math.round(descriptor.frame.cityRadiusMeters)} m`],
    [editorText("cityEditor.messages.coast"), water],
    [editorText("cityEditor.messages.rivers"), String(descriptor.rivers.length)],
    [editorText("cityEditor.messages.roads"), String(roads.length)],
    [editorText("cityEditor.messages.gates"), String(descriptor.suggestedGates)],
    [editorText("cityEditor.messages.walls"), yesNo(descriptor.burg.walls)],
    [editorText("cityEditor.messages.citadel"), yesNo(descriptor.burg.citadel)],
    [
      editorText("cityEditor.messages.plazaTemple"),
      `${yesNo(descriptor.burg.plaza)} · ${yesNo(descriptor.burg.temple)}`
    ],
    [
      editorText("cityEditor.messages.port"),
      descriptor.burg.waterAccess
        ? [
            descriptor.burg.waterAccess.port.sea && editorText("cityEditor.fmgParameters.seaPort"),
            descriptor.burg.waterAccess.port.river && editorText("cityEditor.fmgParameters.riverPort"),
            descriptor.burg.waterAccess.port.lake && editorText("cityEditor.fmgParameters.lakePort")
          ]
            .filter(Boolean)
            .join(" · ") || yesNo(false)
        : descriptor.burg.port
          ? descriptor.waterbody
            ? yesNo(true)
            : editorText("cityEditor.messages.yesNoWaterbody")
          : yesNo(false)
    ]
  ];
  if (descriptor.urbanMorphology) {
    const history = descriptor.urbanMorphology;
    rows.push([
      editorText(
        history.foundedSource === "estimated"
          ? "cityEditor.messages.estimatedUrbanFounding"
          : "cityEditor.messages.urbanFounding"
      ),
      String(history.foundedYear)
    ]);
    rows.push([
      editorText("cityEditor.messages.urbanWallYears"),
      history.wallPhases.map(p => p.year).join(" → ") || "—"
    ]);
  }
  const distanceText = (distance: number | null | undefined): string =>
    distance != null && Number.isFinite(distance) && distance >= 0
      ? formatDistance(distance)
      : editorText("cityEditor.fmgParameters.unknownDistance");
  const waterDistances: [string, string][] = [];
  if (descriptor.waterbody) {
    waterDistances.push([
      editorText(
        descriptor.waterbody.kind === "lake"
          ? "cityEditor.fmgParameters.lakeShoreDistance"
          : "cityEditor.fmgParameters.coastDistance"
      ),
      distanceText(shoreDistanceMeters(descriptor.waterbody))
    ]);
  }
  for (const river of descriptor.rivers) {
    const riverName = river.name || editorText("cityEditor.fmgParameters.unnamedRiver", { id: river.riverId });
    waterDistances.push([
      editorText("cityEditor.fmgParameters.riverDistance", { river: riverName }),
      distanceText(river.rawOffsetMeters ?? river.offsetMeters)
    ]);
  }
  rows.splice(6, 0, ...waterDistances);
  const waterfront = descriptor.burg.waterfrontCheck;
  if (waterfront?.status === "failed") {
    const issues = waterfront.issues.map(issue =>
      issue.kind === "shore-distance"
        ? editorText("cityEditor.fmgParameters.shoreBeyond", { meters: issue.excessMeters ?? 0 })
        : issue.kind === "bank-distance"
          ? editorText("cityEditor.fmgParameters.bankBeyond", { meters: issue.excessMeters ?? 0 })
          : issue.kind === "river-unresolved"
            ? editorText("cityEditor.fmgParameters.riverUnresolved", { reason: issue.reason ?? "" })
            : editorText("cityEditor.fmgParameters.shoreMissing")
    );
    rows.unshift([
      editorText("cityEditor.fmgParameters.waterfrontCheck"),
      editorText("cityEditor.fmgParameters.waterfrontFailed", { issues: issues.join("; ") })
    ]);
  }
  const nodes: Node[] = rows.map(([key, value]) => {
    const line = document.createElement("div");
    line.className = "ce-imported-row";
    if (waterDistances.some(([label]) => label === key)) {
      line.title = editorText("cityEditor.fmgParameters.distanceReference");
    }
    if (waterfront && key === editorText("cityEditor.fmgParameters.waterfrontCheck")) {
      line.title = editorText("cityEditor.fmgParameters.waterfrontReview");
      line.classList.add("ce-imported-warning");
      line.style.color = "#c62828";
    }
    const labelNode = document.createElement("span");
    labelNode.textContent = key;
    const valueNode = document.createElement("strong");
    valueNode.textContent = value;
    valueNode.title = value;
    line.append(labelNode, valueNode);
    return line;
  });
  const preview = renderFixedSitePreview(descriptor);
  if (preview) {
    const caption = document.createElement("div");
    caption.textContent = editorText("cityEditor.messages.importedFixedRiverCrossingsAndRoadDirections");
    nodes.push(caption, preview);
  }
  return nodes;
}
