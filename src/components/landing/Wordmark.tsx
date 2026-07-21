import { cn } from "@/lib/utils";
import { BRAND_NAME } from "./constants";

interface WordmarkProps {
  className?: string;
  variant?: "default" | "inverted";
}

export const Wordmark = ({ className, variant = "default" }: WordmarkProps) => {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-[0.4em] font-serif text-[1.45rem] leading-none tracking-tight md:text-2xl",
        variant === "inverted" ? "text-background" : "text-foreground",
        className,
      )}
    >
      {/* Le logo est une tuile pleine (fond terracotta) : arrondi, jamais détouré. */}
      <img
        src="/images/saoma.png"
        alt=""
        aria-hidden
        className="h-[1.15em] w-[1.15em] shrink-0 rounded-[0.28em] object-cover"
      />
      <span className="inline-block">
        {BRAND_NAME.toLowerCase()}
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
    </span>
  );
};
