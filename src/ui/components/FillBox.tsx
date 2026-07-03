interface FillBoxProps {
  fill?: string;
  size?: string;
  disabled?: boolean;
  onClick?: () => void;
  "data-tip"?: string;
  className?: string;
}

export const FillBox = ({
  fill = "#333",
  size = "1em",
  disabled,
  onClick,
  "data-tip": dataTip,
  className
}: FillBoxProps) => {
  const tip = dataTip ?? (disabled ? undefined : "Fill style. Click to change");

  return (
    <span
      style={{ cursor: disabled ? undefined : "pointer", display: "inline-block" }}
      onClick={disabled ? undefined : onClick}
      data-tip={tip}
      className={className}
    >
      <svg width={size} height={size} aria-hidden="true">
        <rect x={0} y={0} width="100%" height="100%" fill={fill} stroke="#666666" strokeWidth={2} />
      </svg>
    </span>
  );
};
