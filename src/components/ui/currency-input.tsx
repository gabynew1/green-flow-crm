import * as React from "react";
import { cn } from "@/lib/utils";
import { CurrencyCode } from "@/lib/currency";

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  currency?: CurrencyCode;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, currency = "RON", ...props }, ref) => {
    return (
      <div className={cn("relative flex items-center", className)}>
        <span className="absolute left-2 text-xs text-muted-foreground pointer-events-none select-none">
          {currency}
        </span>
        <input
          type="number"
          step="0.01"
          ref={ref}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          )}
          {...props}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
export type { CurrencyInputProps };
