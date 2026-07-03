import type React from "react";
import type { ButtonHTMLAttributes } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: string;
  tooltip?: string;
  "data-tip"?: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  tooltip,
  className = "",
  "data-tip": dataTip,
  children,
  ...props
}) => {
  const tip = tooltip || dataTip;
  const combinedClassName = `icon-btn ${icon || ""} ${className}`.trim();
  const ariaLabel = props["aria-label"] || tip || "Icon button";

  return (
    <button type="button" className={combinedClassName} data-tip={tip} aria-label={ariaLabel} {...props}>
      {children}
    </button>
  );
};
