import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { worldContext } from "../../context/worldContext";
import { getWorldLandProposalReport, subscribeWorldLandProposalReports } from "../../services/worldLandProposalReport";

/** Read-only last assessment; road/bridge shapes continue to come exclusively
 * from validated registered sections. No construction button or inferred bridge. */
export function LandConnectionAssessmentReport() {
  const { t } = useTranslation();
  const report = useSyncExternalStore(subscribeWorldLandProposalReports, () =>
    getWorldLandProposalReport(worldContext)
  );
  if (!report) return null;
  const score = (value: number | null) =>
    value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return (
    <details className="land-connection-assessment-report">
      <summary>{t("landConnections.title", "Last connection assessment")}</summary>
      <p>
        {t(
          "landConnections.description",
          "Scores compare travel and construction effort. They are not money or travel time."
        )}
      </p>
      {report.status === "unresolved" && (
        <p role="status">
          {t("landConnections.unresolved", "Assessment incomplete")}:{" "}
          {t(`landConnections.reasons.${report.reason}`, report.reason ?? "")}
        </p>
      )}
      <table className="fmg-table">
        <thead>
          <tr>
            <th>{t("landConnections.cities", "Cities")}</th>
            <th>{t("landConnections.decision", "Decision")}</th>
            <th>{t("landConnections.reason", "Reason")}</th>
            <th>{t("landConnections.travel", "Travel score")}</th>
            <th>{t("landConnections.construction", "New construction")}</th>
            <th>{t("landConnections.benefit", "Net benefit")}</th>
          </tr>
        </thead>
        <tbody>
          {report.explanations.map(entry => (
            <tr key={entry.key} data-assessment-key={entry.key}>
              <td>{entry.cityIds.map(id => worldContext.pack.burgs[id]?.name ?? String(id)).join(" / ")}</td>
              <td>
                {t(`landConnections.status.${entry.status}`, entry.status)}
                {entry.kind === "shared" ? ` (${t("landConnections.shared", "shared bridge")})` : ""}
              </td>
              <td>{t(`landConnections.reasons.${entry.reason}`, entry.reason)}</td>
              <td>
                {score(
                  entry.travelScoreMeters === null ? null : entry.travelScoreMeters + (entry.repeatScoreMeters ?? 0)
                )}
              </td>
              <td>{score(entry.constructionScoreMeters)}</td>
              <td>{score(entry.netBenefitMeters)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
