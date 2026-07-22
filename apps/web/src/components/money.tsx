"use client";

import { useEffect, useState } from "react";
import { Input } from "@mep/ui";
import { parseMoneyToMinor } from "@mep/types";
import { formatMoney } from "@/lib/money";

export function MoneyText({ minor, currency = "EUR", className }: { minor: number | null | undefined; currency?: string; className?: string }) {
  return <span className={className}>{formatMoney(minor, currency)}</span>;
}

/**
 * Text input that parses localized amounts ("1.234,56" or "1234.56") into
 * integer minor units. No floats ever reach the parent.
 */
export function MoneyInput({
  value,
  onChange,
  currency = "EUR",
  placeholder = "0.00",
  id,
}: {
  value: number;
  onChange: (minor: number) => void;
  currency?: string;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(value === 0 ? "" : (value / 100).toFixed(2));
  const [error, setError] = useState(false);

  useEffect(() => {
    setText(value === 0 ? "" : (value / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          className={error ? "border-destructive pr-10" : "pr-10"}
          onChange={(e) => {
            const raw = e.target.value.replace(",", ".");
            setText(raw);
            if (raw.trim() === "") {
              setError(false);
              onChange(0);
              return;
            }
            const minor = parseMoneyToMinor(raw);
            if (minor === null || minor < 0) {
              setError(true);
            } else {
              setError(false);
              onChange(minor);
            }
          }}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          {currency}
        </span>
      </div>
      {error && <p className="text-xs text-destructive">Enter a valid amount, e.g. 1250.00</p>}
    </div>
  );
}

export { formatMoney };
