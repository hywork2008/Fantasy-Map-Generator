import { type ReactNode, useLayoutEffect, useState } from "react";

interface SliderInputProps {
  id?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  value: string | number;
  onChange?: (value: string) => void;
  /** Fires once when the user finishes dragging/typing, and only if the value changed. */
  onCommit?: (value: string) => void;
  className?: string;
  children?: ReactNode;
  disabled?: boolean;
  "data-stored"?: string;
}

export const SliderInput = ({
  id,
  min = 0,
  max = 100,
  step = 1,
  value: valueProp,
  onChange,
  onCommit,
  className,
  children,
  disabled,
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

  const commit = (e: { currentTarget: HTMLInputElement }) => {
    const v = e.currentTarget.value;
    if (v !== String(valueProp)) onCommit?.(v);
  };
  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") commit(e);
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
        disabled={disabled}
        data-stored={dataStored}
        onChange={handleChange}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        data-stored={dataStored}
        onChange={handleChange}
        onBlur={commit}
        onKeyUp={commitOnEnter}
      />
    </div>
  );
};
