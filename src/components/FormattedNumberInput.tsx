import React, { useLayoutEffect, useRef, useState } from 'react';

interface FormattedNumberInputProps {
  value: string | number;
  onValueChange: (numericString: string, numericValue: number) => void;
  allowDecimal?: boolean;
  prefix?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  className?: string;
  inputClassName?: string;
  'aria-label'?: string;
}

/**
 * Formats an internal numeric string (e.g. "1500000" or "106.25")
 * into Indonesian display format ("1.500.000" or "106,25").
 */
export function formatThousandDisplay(rawInternal: string, allowDecimal: boolean): string {
  if (!rawInternal) return '';
  const cleaned = rawInternal.replace(/[^\d.]/g, '');
  if (!cleaned) return '';

  if (allowDecimal && cleaned.includes('.')) {
    const dotIdx = cleaned.indexOf('.');
    const intPart = cleaned.slice(0, dotIdx).replace(/\./g, '');
    const decPart = cleaned.slice(dotIdx + 1).replace(/\./g, '');
    const formattedInt = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formattedInt},${decPart}`;
  }

  const intOnly = cleaned.replace(/\./g, '');
  return intOnly.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function parseDisplayToInternal(display: string, allowDecimal: boolean): string {
  if (!display) return '';
  if (!allowDecimal) {
    const digits = display.replace(/\D/g, '');
    // Strip leading zeros except single "0" if needed; keep clean positive digits
    return digits.replace(/^0+(?=\d)/, '');
  }

  // In Indonesian display, '.' is thousand separator and ',' is decimal separator
  let seenComma = false;
  let intDigits = '';
  let decDigits = '';

  for (const ch of display) {
    if (ch >= '0' && ch <= '9') {
      if (seenComma) decDigits += ch;
      else intDigits += ch;
    } else if (ch === ',' && !seenComma) {
      seenComma = true;
    }
  }

  intDigits = intDigits.replace(/^0+(?=\d)/, '');
  if (seenComma) {
    return `${intDigits || '0'}.${decDigits}`;
  }
  return intDigits;
}

export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onValueChange,
  allowDecimal = false,
  prefix,
  placeholder = '0',
  required,
  min,
  className = '',
  inputClassName = '',
  'aria-label': ariaLabel,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingCaretDigitsRef = useRef<number | null>(null);
  const [trailingComma, setTrailingComma] = useState(false);

  const internalStr =
    value === '' || value === null || value === undefined
      ? ''
      : typeof value === 'number'
        ? value === 0
          ? ''
          : String(value)
        : String(value);

  const baseDisplay = formatThousandDisplay(internalStr, allowDecimal);
  const displayValue =
    allowDecimal && trailingComma && !baseDisplay.includes(',')
      ? `${baseDisplay || '0'},`
      : baseDisplay;

  useLayoutEffect(() => {
    const el = inputRef.current;
    const targetDigits = pendingCaretDigitsRef.current;
    if (!el || targetDigits === null) return;
    pendingCaretDigitsRef.current = null;

    let count = 0;
    let pos = el.value.length;
    for (let i = 0; i < el.value.length; i++) {
      const ch = el.value[i];
      if ((ch >= '0' && ch <= '9') || (allowDecimal && ch === ',')) {
        count++;
      }
      if (count >= targetDigits) {
        pos = i + 1;
        break;
      }
    }
    if (targetDigits === 0) pos = 0;
    el.setSelectionRange(pos, pos);
  }, [displayValue, allowDecimal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDisplay = e.target.value;
    const selStart = e.target.selectionStart ?? rawDisplay.length;

    // Count meaningful characters (digits + comma) before cursor
    let meaningfulBefore = 0;
    for (let i = 0; i < selStart; i++) {
      const ch = rawDisplay[i];
      if ((ch >= '0' && ch <= '9') || (allowDecimal && ch === ',')) {
        meaningfulBefore++;
      }
    }
    pendingCaretDigitsRef.current = meaningfulBefore;

    const hasTrailingComma =
      allowDecimal && rawDisplay.endsWith(',') && rawDisplay.indexOf(',') === rawDisplay.length - 1;
    setTrailingComma(hasTrailingComma);

    const nextInternal = parseDisplayToInternal(rawDisplay, allowDecimal);
    const num = nextInternal ? Number(nextInternal) : 0;
    onValueChange(nextInternal, Number.isFinite(num) ? num : 0);
  };

  const isInvalidMin =
    min !== undefined && internalStr !== '' && Number(internalStr) < min;

  return (
    <div className={`relative flex items-center ${className}`}>
      {prefix && (
        <span className="pointer-events-none absolute left-3 text-xs font-semibold text-slate-400 dark:text-slate-500 select-none">
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={isInvalidMin || undefined}
        value={displayValue}
        placeholder={placeholder}
        onChange={handleChange}
        className={`${inputClassName} ${prefix ? '!pl-9' : ''}`}
      />
    </div>
  );
};
