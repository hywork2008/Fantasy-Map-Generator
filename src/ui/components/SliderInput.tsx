import { type ReactNode, useLayoutEffect, useState } from "react";

interface SliderInputProps {
  id?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  value: string | number;
  onChange?: (value: string) => void;
  className?: string;
  children?: ReactNode;
  "data-stored"?: string;
}

export const SliderInput = ({
  id,
  min = 0,
  max = 100,
  step = 1,
  value: valueProp,
  onChange,
  className,
  children,
  "data-stored": dataStored
}: SliderInputProps) => {
  const [value, setValue] = useState(String(valueProp));

  // External updates (for example, generation option randomization) should be
  // reflected before repaint.
  useLayoutEffect(() => {
    setValue(String(valueProp));
  }, [valueProp]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    onChange?.(e.target.value);
  };

  return (
    <div className={`d-flex ${className}`}>
      {children}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-stored={dataStored}
        onChange={handleChange}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        data-stored={dataStored}
        onChange={handleChange}
      />
    </div>
  );
};
