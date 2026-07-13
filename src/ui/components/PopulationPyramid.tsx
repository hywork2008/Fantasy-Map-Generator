import type React from "react";

interface PopulationPyramidProps {
  childrenCount: number;
  maleAdults: number;
  femaleAdults: number;
  elders: number;
}

export const PopulationPyramid: React.FC<PopulationPyramidProps> = ({
  childrenCount,
  maleAdults,
  femaleAdults,
  elders
}) => {
  const mAdults = Math.round(maleAdults);
  const fAdults = Math.round(femaleAdults);
  const adultTotal = mAdults + fAdults;

  // Children keep a natural birth sex ratio. Elders inherit the settlement's adult sex ratio
  // so military forts (etc.) show a male-heavy older cohort instead of a fixed 49:51 split.
  const maleChildren = Math.round(childrenCount * 0.49);
  const femaleChildren = Math.round(childrenCount * 0.51);
  const elderMaleRatio = adultTotal > 0 ? mAdults / adultTotal : 0.49;
  const maleElders = Math.round(elders * elderMaleRatio);
  const femaleElders = Math.max(0, Math.round(elders) - maleElders);

  const maxVal = Math.max(maleChildren, femaleChildren, mAdults, fAdults, maleElders, femaleElders);

  // Avoid division by zero
  const scale = maxVal > 0 ? 100 / maxVal : 1;

  const Row = ({ label, male, female }: { label: string; male: number; female: number }) => (
    <div style={{ display: "flex", alignItems: "center", marginBottom: "2px", fontSize: "0.8em" }}>
      {/* Male Side */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", paddingRight: "4px" }}>
        <div
          data-tip={`${male.toLocaleString()} Males`}
          style={{
            height: "14px",
            backgroundColor: "#4a90e2",
            width: `${male * scale}%`,
            minWidth: male > 0 ? "2px" : "0",
            transition: "width 0.3s ease"
          }}
        />
      </div>
      {/* Center Label */}
      <div style={{ width: "40px", textAlign: "center", color: "var(--text-color-light)" }}>{label}</div>
      {/* Female Side */}
      <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", paddingLeft: "4px" }}>
        <div
          data-tip={`${female.toLocaleString()} Females`}
          style={{
            height: "14px",
            backgroundColor: "#e24a8d",
            width: `${female * scale}%`,
            minWidth: female > 0 ? "2px" : "0",
            transition: "width 0.3s ease"
          }}
        />
      </div>
    </div>
  );

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "250px",
        marginTop: "10px",
        padding: "8px",
        background: "rgba(0,0,0,0.1)",
        borderRadius: "4px"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.75em",
          color: "var(--text-color-light)",
          marginBottom: "4px",
          padding: "0 45px"
        }}
      >
        <span>Male</span>
        <span>Female</span>
      </div>
      <Row label="50+" male={maleElders} female={femaleElders} />
      <Row label="15-50" male={mAdults} female={fAdults} />
      <Row label="0-14" male={maleChildren} female={femaleChildren} />
    </div>
  );
};
