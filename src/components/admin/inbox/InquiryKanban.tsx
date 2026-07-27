import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import type { EmailInquiry, EmailInquiryStatus } from "@/hooks/inbox/useEmailInquiries";
import {
  KANBAN_COLUMNS,
  STATUS_DISPLAY,
  confidenceClass,
  formatConfidence,
} from "./inquiryStatus";

interface Props {
  inquiries: EmailInquiry[];
  isLoading: boolean;
  onSelect: (inquiry: EmailInquiry) => void;
}

/**
 * Read-only board: the columns group by status, they do not set it. Every
 * transition goes through an action (convert creates a booking, reply sends an
 * email, the webhook owns received/parsed/failed), so a card is a shortcut to
 * the detail sheet rather than something to drag around.
 */
export function InquiryKanban({ inquiries, isLoading, onSelect }: Props) {
  const { t } = useTranslation("admin");

  const byStatus = useMemo(() => {
    const map = new Map<EmailInquiryStatus, EmailInquiry[]>(
      KANBAN_COLUMNS.map(status => [status, []]),
    );
    for (const inquiry of inquiries) {
      map.get(inquiry.status)?.push(inquiry);
    }
    return map;
  }, [inquiries]);

  if (isLoading) {
    return (
      <div className="text-center text-muted-foreground py-12">
        {t("inbox.loading")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto p-4">
      <div className="flex gap-3 min-w-max items-start">
        {KANBAN_COLUMNS.map(status => {
          const items = byStatus.get(status) ?? [];
          const cfg = STATUS_DISPLAY[status];
          const Icon = cfg?.Icon;
          return (
            <section key={status} className="w-[260px] flex-shrink-0 rounded-lg bg-muted/40 border border-border">
              <header className={cn("flex items-center gap-2 px-3 py-2 border-b rounded-t-lg", cfg?.cls)}>
                {Icon && <Icon className="h-3.5 w-3.5" />}
                <h3 className="text-sm font-medium flex-1">
                  {t(cfg?.tkey ?? `inbox.status.${status}`, { defaultValue: status })}
                </h3>
                <span className="text-xs tabular-nums opacity-70">{items.length}</span>
              </header>

              <div className="p-2 space-y-2">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-6">
                    {t("inbox.kanban.emptyColumn", { defaultValue: "Aucune demande" })}
                  </p>
                ) : (
                  items.map(inquiry => (
                    <button
                      key={inquiry.id}
                      type="button"
                      onClick={() => onSelect(inquiry)}
                      className="w-full text-left rounded-md border border-border bg-card p-2.5 space-y-1.5 hover:border-foreground/30 hover:shadow-sm transition-colors"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {format(new Date(inquiry.created_at), "dd/MM HH:mm")}
                        </span>
                        <span className={cn("text-[11px] tabular-nums font-medium", confidenceClass(inquiry.confidence_score))}>
                          {formatConfidence(inquiry.confidence_score)}
                        </span>
                      </div>

                      <p className="text-sm font-medium leading-snug line-clamp-2">
                        {inquiry.subject ?? (
                          <span className="text-muted-foreground italic font-normal">{t("inbox.noSubject")}</span>
                        )}
                      </p>

                      <p className="text-xs text-muted-foreground truncate">{inquiry.from_address}</p>

                      <p className="text-xs text-muted-foreground truncate">
                        {inquiry.hotel?.name ?? (
                          <span className="italic">{t("inbox.unknownVenue")}</span>
                        )}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
