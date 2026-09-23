import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { fr as frLocale } from "date-fns/locale";
import { toast } from "sonner";
import { AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { orgScopeKey, useOrgScope } from "@/hooks/useOrgScope";

/**
 * Suivi de la synthèse J-1 envoyée aux thérapeutes.
 *
 * Remplace le sondage WhatsApp par lequel la coordinatrice vérifiait que chacun
 * avait bien reçu son récapitulatif : la colonne « statut » dit qui l'a reçue,
 * ouverte et confirmée, et la relance repart d'ici.
 */

type DigestStatus = "not_sent" | "sent" | "opened" | "confirmed" | "failed";

interface DigestRow {
  therapist_id: string;
  first_name: string | null;
  last_name: string | null;
  booking_count: number;
  hotel_names: string[] | null;
  first_booking_time: string | null;
  status: DigestStatus;
  send_count: number;
  last_sent_at: string | null;
  acknowledged_at: string | null;
  last_error: string | null;
}

const STATUS_STYLES: Record<DigestStatus, string> = {
  not_sent: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  opened: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-destructive/10 text-destructive",
};

const TomorrowDigestPanel = () => {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const scope = useOrgScope();

  const [targetDate, setTargetDate] = useState(() =>
    format(addDays(new Date(), 1), "yyyy-MM-dd"),
  );
  const [resending, setResending] = useState<string | null>(null);

  const organizationId =
    scope && "organizationId" in scope ? (scope.organizationId as string) : null;

  const queryKey = ["admin", "tomorrow-digests", orgScopeKey(scope), targetDate] as const;

  const { data: rows, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_tomorrow_digests", {
        p_target_date: targetDate,
        ...(organizationId ? { p_organization_id: organizationId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as DigestRow[];
    },
    enabled: !!scope,
  });

  const resend = useMutation({
    mutationFn: async (therapistIds: string[]) => {
      const { error } = await supabase.functions.invoke("send-tomorrow-digest", {
        body: { therapistIds, targetDate, force: true },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("scheduleAlerts.digest.resent"));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error(t("scheduleAlerts.digest.resendError")),
    onSettled: () => setResending(null),
  });

  const pending = useMemo(
    () => (rows ?? []).filter((r) => r.status === "not_sent" || r.status === "failed"),
    [rows],
  );

  const dateLabel = format(parseISO(targetDate), "EEEE d MMMM", {
    locale: i18n.language === "fr" ? frLocale : undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{t("scheduleAlerts.digest.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("scheduleAlerts.digest.description")}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              {t("scheduleAlerts.digest.dateLabel")}
            </label>
            <Input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
          {pending.length > 0 && (
            <Button
              variant="outline"
              disabled={resend.isPending}
              onClick={() => {
                setResending("__all__");
                resend.mutate(pending.map((r) => r.therapist_id));
              }}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", resend.isPending && "animate-spin")} />
              {t("scheduleAlerts.digest.resendAll", { count: pending.length })}
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {t("common:loading", "Chargement…")}
        </p>
      ) : (rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {t("scheduleAlerts.digest.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-normal">
                  {t("scheduleAlerts.digest.columns.therapist")}
                </th>
                <th className="px-3 py-2 font-normal">
                  {t("scheduleAlerts.digest.columns.bookings")}
                </th>
                <th className="px-3 py-2 font-normal">
                  {t("scheduleAlerts.digest.columns.venues")}
                </th>
                <th className="px-3 py-2 font-normal">
                  {t("scheduleAlerts.digest.columns.firstSlot")}
                </th>
                <th className="px-3 py-2 font-normal">
                  {t("scheduleAlerts.digest.columns.status")}
                </th>
                <th className="px-3 py-2 font-normal text-right">
                  {t("scheduleAlerts.digest.columns.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((row) => (
                <tr key={row.therapist_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    {row.first_name} {row.last_name}
                  </td>
                  <td className="px-3 py-2">{row.booking_count}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {(row.hotel_names ?? []).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {row.first_booking_time ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs",
                        STATUS_STYLES[row.status],
                      )}
                    >
                      {t(`scheduleAlerts.digest.status.${row.status}`)}
                      {row.last_error && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertCircle className="h-3 w-3" />
                          </TooltipTrigger>
                          <TooltipContent>{row.last_error}</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                    {row.send_count > 1 && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {t("scheduleAlerts.digest.sendCount", { count: row.send_count })}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={resend.isPending}
                      onClick={() => {
                        setResending(row.therapist_id);
                        resend.mutate([row.therapist_id]);
                      }}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5 mr-1.5",
                          resending === row.therapist_id && resend.isPending && "animate-spin",
                        )}
                      />
                      {t("scheduleAlerts.digest.resend")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TomorrowDigestPanel;
