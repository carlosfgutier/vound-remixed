import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-border bg-input/40 p-3 text-sm leading-relaxed",
        "text-foreground placeholder:text-muted-foreground",
        "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40",
        "transition",
        className,
      )}
      {...props}
    />
  );
});
