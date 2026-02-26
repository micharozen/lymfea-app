import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DAYS_OF_WEEK = [
  { value: "1", label: "Lun", labelEn: "Mon" },
  { value: "2", label: "Mar", labelEn: "Tue" },
  { value: "3", label: "Mer", labelEn: "Wed" },
  { value: "4", label: "Jeu", labelEn: "Thu" },
  { value: "5", label: "Ven", labelEn: "Fri" },
  { value: "6", label: "Sam", labelEn: "Sat" },
  { value: "0", label: "Dim", labelEn: "Sun" },
];

interface MinimumGuaranteeEditorProps {
  value: Record<string, number>;
  onChange?: (value: Record<string, number>) => void;
  readOnly?: boolean;
}

export function MinimumGuaranteeEditor({
  value,
  onChange,
  readOnly = false,
}: MinimumGuaranteeEditorProps) {
  const { i18n } = useTranslation();
  const isFr = i18n.language?.startsWith("fr");

  const hasValues = Object.values(value).some((v) => v > 0);

  if (readOnly) {
    if (!hasValues) return null;

    return (
      <table className="border-collapse">
        <thead>
          <tr>
            {DAYS_OF_WEEK.map((day) => (
              <th
                key={day.value}
                className="text-[10px] font-medium text-muted-foreground px-1.5 pb-1 text-center"
              >
                {isFr ? day.label : day.labelEn}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {DAYS_OF_WEEK.map((day) => {
              const count = value[day.value] ?? 0;
              return (
                <td key={day.value} className="px-0.5">
                  <span
                    className={cn(
                      "flex items-center justify-center h-7 w-10 rounded-md text-xs font-semibold",
                      count > 0
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="border-collapse">
      <thead>
        <tr>
          {DAYS_OF_WEEK.map((day) => (
            <th
              key={day.value}
              className="text-[10px] font-medium text-muted-foreground px-1.5 pb-1 text-center"
            >
              {isFr ? day.label : day.labelEn}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {DAYS_OF_WEEK.map((day) => (
            <td key={day.value} className="px-0.5">
              <Input
                type="number"
                min={0}
                max={99}
                value={value[day.value] || ""}
                onChange={(e) => {
                  const num = Math.max(0, Math.min(99, parseInt(e.target.value) || 0));
                  onChange?.({ ...value, [day.value]: num });
                }}
                className="h-7 w-10 text-center text-xs px-0"
              />
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
