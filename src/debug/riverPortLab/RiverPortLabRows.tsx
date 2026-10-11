import type React from "react";
import { useState } from "react";
import { LAB_SITE_KINDS } from "./classifyRiverSite";
import { getLabOptions, type RiverPortLabOptions, setLabOptions } from "./labOptions";

/** Dev-only Generation Settings rows for River-Port Lab (docs/plan/river-port-lab.md); English only. */
export const RiverPortLabRows: React.FC = () => {
  const [lab, setLab] = useState<RiverPortLabOptions>(getLabOptions);
  const update = (patch: Partial<RiverPortLabOptions>) => setLab({ ...setLabOptions(patch) });

  return (
    <>
      <tr data-tip="Debug: boosts rivers and forces burgs onto river/sea sites (Province scope only)">
        <td />
        <th>Debug: River-port lab</th>
        <td>
          <input type="checkbox" checked={lab.enabled} onChange={e => update({ enabled: e.target.checked })} />
        </td>
        <td />
      </tr>
      {lab.enabled && (
        <>
          <tr data-tip="River-forming flux threshold divisor (1 = normal)">
            <td />
            <th>River density</th>
            <td>
              <input
                type="range"
                min="1"
                max="10"
                value={lab.riverDensity}
                onChange={e => update({ riverDensity: Number(e.target.value) })}
              />
            </td>
            <td>
              <output>{lab.riverDensity}</output>
            </td>
          </tr>
          <tr>
            <td />
            <th>Ignore climate / fill towns</th>
            <td>
              <input
                type="checkbox"
                checked={lab.ignoreClimate}
                onChange={e => update({ ignoreClimate: e.target.checked })}
              />
              <input type="checkbox" checked={lab.fillTowns} onChange={e => update({ fillTowns: e.target.checked })} />
            </td>
            <td />
          </tr>
          {LAB_SITE_KINDS.map(kind => (
            <tr key={kind}>
              <td />
              <th>Quota: {kind}</th>
              <td>
                <input
                  type="number"
                  min="0"
                  max="50"
                  style={{ width: "4em" }}
                  value={lab.siteQuota[kind] ?? 0}
                  onChange={e => update({ siteQuota: { ...lab.siteQuota, [kind]: Number(e.target.value) } })}
                />
              </td>
              <td />
            </tr>
          ))}
        </>
      )}
    </>
  );
};
