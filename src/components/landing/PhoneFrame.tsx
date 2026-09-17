import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PhoneFrameProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Rayon de l'écran, à garder concentrique avec celui de la coque (`className`). */
  screenClassName?: string;
}

/**
 * Cadre de téléphone commun à la hero et aux différenciateurs : coque sombre,
 * écran 9/19 et îlot dynamique. Le contenu de l'écran est fourni par l'appelant.
 */
export const PhoneFrame = forwardRef<HTMLDivElement, PhoneFrameProps>(
  ({ children, className, screenClassName, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative w-[208px] rounded-[2.25rem] bg-zinc-900 p-2 shadow-[0_28px_60px_-20px_rgba(0,0,0,0.45)] md:w-[232px] md:rounded-[2.5rem] md:p-2.5",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative aspect-[9/19] overflow-hidden rounded-[1.8rem] bg-background md:rounded-[2.1rem]",
          screenClassName,
        )}
      >
        {/* Îlot dynamique, proportionnel à l'écran (≈ 32 % de large sur un iPhone) */}
        <span className="absolute left-1/2 top-[1.8%] z-20 aspect-[126/37] w-[31%] -translate-x-1/2 rounded-full bg-zinc-900" />
        {children}
      </div>
    </div>
  ),
);
PhoneFrame.displayName = "PhoneFrame";
