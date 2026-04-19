import * as React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});
