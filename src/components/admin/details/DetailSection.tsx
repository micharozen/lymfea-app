import { LucideIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ReactNode } from "react";

interface DetailSectionProps {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  showSeparator?: boolean;
}

export function DetailSection({
  icon: Icon,
  title,
  children,
  showSeparator = true,
}: DetailSectionProps) {
  return (
    <>
      <div className="space-y-2">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
        </h3>
        {children}
      </div>
      {showSeparator && <Separator />}
    </>
  );
}

interface DetailCardProps {
  children: ReactNode;
  className?: string;
}

export function DetailCard({ children, className }: DetailCardProps) {
  return (
    <div className={`bg-muted/50 rounded-lg p-3 ${className || ""}`}>
      {children}
    </div>
  );
}

interface DetailGridProps {
  children: ReactNode;
  columns?: 2 | 3;
}

export function DetailGrid({ children, columns = 2 }: DetailGridProps) {
  return (
    <div className={`grid gap-3 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {children}
    </div>
  );
}

interface DetailStatProps {
  label: string;
  value: ReactNode;
  center?: boolean;
}

export function DetailStat({ label, value, center = false }: DetailStatProps) {
  return (
    <DetailCard className={center ? "text-center" : ""}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </DetailCard>
  );
}

interface DetailFieldProps {
  label?: string;
  value: ReactNode;
  muted?: boolean;
}

export function DetailField({ label, value, muted = false }: DetailFieldProps) {
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <p className={`text-sm ${muted ? "text-muted-foreground" : "font-medium"}`}>
        {value}
      </p>
    </div>
  );
}
