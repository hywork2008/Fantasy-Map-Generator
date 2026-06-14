import type React from "react";

interface SliderInputProps {
  id?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
}

export const SliderInput: React.FC<SliderInputProps> = ({
  id,
  min = "0",
  max = "100",
  step = "1",
  value,
  onChange,
  className = ""
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4em" }} className={className} id={id}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={handleChange} style={{ flex: 1 }} />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        style={{ width: "4em" }}
      />
    </div>
  );
};
