import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CLIENT_TYPE_META, type BookingClientType } from "@/lib/clientTypeMeta";

interface ClientTypeBadgeProps {
  clientType: BookingClientType | string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

export function ClientTypeBadge({ clientType, size = "md", className }: ClientTypeBadgeProps) {
  const { t } = useTranslation("admin");
  if (!clientType) return null;
  const meta = CLIENT_TYPE_META[clientType as BookingClientType];
  if (!meta) return null;

  const sizeClasses = size === "sm"
    ? "h-5 px-1.5 text-[10px] gap-1"
    : "h-6 px-2 text-xs gap-1.5";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium",
        sizeClasses,
        meta.colorClass,
        className
      )}
    >
      <img src={meta.logo} alt="" className={cn("shrink-0", iconSize)} />
      <span>{t(meta.labelKey)}</span>
    </span>
  );
}
