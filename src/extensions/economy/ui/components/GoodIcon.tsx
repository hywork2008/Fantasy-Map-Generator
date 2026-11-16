import "./goodIcon.css";

const GOODS_ICON_BASE = `${import.meta.env.BASE_URL}images/goods/`;

export function goodIconUrl(icon: string): string {
  return `${GOODS_ICON_BASE}${icon}.png`;
}

type GoodIconProps = {
  icon: string;
  size?: string;
  color?: string;
  stroke?: string;
  label?: string;
  tip?: string;
};

/** Product art is a 128 PNG. The colored circle, when present, is this frame. */
export function GoodIcon({ icon, size = "2em", color, stroke, label, tip }: GoodIconProps) {
  const framed = color !== undefined;
  const className = framed ? "goodIcon framed" : "goodIcon";
  const style = { width: size, height: size, background: color, borderColor: stroke };
  const image = <img src={goodIconUrl(icon)} alt="" draggable={false} />;
  if (label) {
    return (
      <span className={className} style={style} role="img" aria-label={label} data-tip={tip}>
        {image}
      </span>
    );
  }
  return (
    <span className={className} style={style} aria-hidden="true" data-tip={tip}>
      {image}
    </span>
  );
}
