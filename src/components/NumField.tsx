import { useEffect, useId, useState } from 'react';
import { parseNumber } from '../lib/table';

interface Props {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  suffix?: string;
  hideLabel?: boolean;
  className?: string;
}

/** Number input that tolerates Turkish formats ("1.200", "1,5") and half-typed values. */
export function NumField({ label, value, onChange, min = 0, max = 1e7, integer = false, suffix, hideLabel, className }: Props) {
  const id = useId();
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (parseNumber(current) === value ? current : String(value)));
  }, [value]);

  const commit = (raw: string) => {
    const n = parseNumber(raw);
    if (n === null) return;
    const clamped = Math.min(max, Math.max(min, integer ? Math.round(n) : n));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <label className={`num ${className ?? ''}`} htmlFor={id}>
      <span className={hideLabel ? 'visually-hidden' : 'num-label'}>{label}</span>
      <span className="num-box">
        <input
          id={id}
          inputMode={integer ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => setText(String(value))}
        />
        {suffix && <span className="num-suffix">{suffix}</span>}
      </span>
    </label>
  );
}
