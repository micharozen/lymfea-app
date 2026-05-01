import { cn } from "@/lib/utils";
import { HOLISPA_NAME } from "./constants";

interface WordmarkProps {
  className?: string;
  variant?: "default" | "inverted";
}

export const Wordmark = ({ className, variant = "default" }: WordmarkProps) => {
  return (
    <span
      className={cn(
        "select-none font-serif text-[1.45rem] leading-none tracking-tight md:text-2xl",
        variant === "inverted" ? "text-background" : "text-foreground",
        className,
      )}
    >
      {HOLISPA_NAME.toLowerCase()}
      <span
        className={cn(
          "ml-0.5 inline-block",
          variant === "inverted" ? "text-gold-400" : "text-primary",
        )}
        aria-hidden
      >
        .
      </span>
    </span>
  );
};
