import { useTranslation } from "react-i18next";
import { Check, Clock, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BRAND_NAME } from "../constants";
import {
  type Cell,
  type Competitor,
  DIMENSION_KEYS,
  SAOMA_MATRIX,
} from "./competitors";

interface ComparisonMatrixProps {
  competitors: Competitor[];
  /** Make competitor column headers link to their detail page (hub view). */
  linkColumns?: boolean;
}

const CELL_STYLES: Record<Cell, { Icon: typeof Check; className: string }> = {
  yes: { Icon: Check, className: "text-emerald-600" },
  partial: { Icon: Minus, className: "text-amber-500" },
  no: { Icon: X, className: "text-muted-foreground/35" },
  soon: { Icon: Clock, className: "text-sky-600" },
};

const CellMark = ({ value, label }: { value: Cell; label: string }) => {
  const { Icon, className } = CELL_STYLES[value];
  return (
    <span className="inline-flex items-center justify-center">
      <Icon className={cn("h-[18px] w-[18px]", className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
};

export const ComparisonMatrix = ({ competitors, linkColumns }: ComparisonMatrixProps) => {
  const { t } = useTranslation("compare");

  const valueLabel: Record<Cell, string> = {
    yes: t("legend.yes"),
    partial: t("legend.partial"),
    no: t("legend.no"),
    soon: t("legend.soon"),
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-muted/40 px-4 py-4 text-left font-medium text-muted-foreground"
            >
              {t("table.feature")}
            </th>
            <th
              scope="col"
              className="bg-gold-50 px-4 py-4 text-center font-serif text-base text-foreground"
            >
              {BRAND_NAME}
            </th>
            {competitors.map((c) => (
              <th
                key={c.slug}
                scope="col"
                className="px-4 py-4 text-center font-medium text-foreground/80"
              >
                {linkColumns ? (
                  <a
                    href={`/compare/saoma-vs-${c.slug}`}
                    className="transition-colors hover:text-foreground hover:underline"
                  >
                    {c.name}
                  </a>
                ) : (
                  c.name
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIMENSION_KEYS.map((key, i) => (
            <tr
              key={key}
              className={cn(
                "border-b border-border/40 last:border-0",
                i % 2 === 1 && "bg-muted/20",
              )}
            >
              <th
                scope="row"
                className={cn(
                  "sticky left-0 z-10 px-4 py-3.5 text-left font-normal text-foreground/90",
                  i % 2 === 1 ? "bg-muted/40" : "bg-background",
                )}
              >
                {t(`dimensions.${key}`)}
              </th>
              <td className="bg-gold-50/60 px-4 py-3.5 text-center">
                <CellMark value={SAOMA_MATRIX[key]} label={valueLabel[SAOMA_MATRIX[key]]} />
              </td>
              {competitors.map((c) => (
                <td key={c.slug} className="px-4 py-3.5 text-center">
                  <CellMark value={c.matrix[key]} label={valueLabel[c.matrix[key]]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** Small inline legend explaining the matrix icons. */
export const ComparisonLegend = () => {
  const { t } = useTranslation("compare");
  const items: { value: Cell; label: string }[] = [
    { value: "yes", label: t("legend.yes") },
    { value: "partial", label: t("legend.partial") },
    { value: "soon", label: t("legend.soon") },
    { value: "no", label: t("legend.no") },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
      {items.map(({ value, label }) => {
        const { Icon, className } = CELL_STYLES[value];
        return (
          <span key={value} className="inline-flex items-center gap-1.5">
            <Icon className={cn("h-4 w-4", className)} aria-hidden />
            {label}
          </span>
        );
      })}
    </div>
  );
};
