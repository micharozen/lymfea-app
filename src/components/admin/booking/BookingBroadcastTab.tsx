import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Info, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useBookingBroadcastAudit,
  type BroadcastAuditRow,
} from "@/hooks/booking/useBookingBroadcastAudit";

interface BookingBroadcastTabProps {
  bookingId: string;
  enabled: boolean;
}

/** Décalage d'entrée entre deux lignes sollicitées : assez lent pour lire la cascade,
 * assez rapide pour ne pas faire attendre sur une longue liste. */
const STAGGER_MS = 60;

function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
}

function TherapistAvatar({ row, withWaves }: { row: BroadcastAuditRow; withWaves: boolean }) {
  const { therapist } = row;
  return (
    <div className="relative shrink-0">
      {withWaves && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border border-emerald-400/40 animate-broadcast-ping motion-reduce:hidden"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border border-emerald-400/40 animate-broadcast-ping [animation-delay:400ms] motion-reduce:hidden"
          />
        </>
      )}
      <Avatar className={`h-9 w-9 ${withWaves ? "" : "opacity-60"}`}>
        {therapist.profile_image && <AvatarImage src={therapist.profile_image} alt="" />}
        <AvatarFallback className="text-xs bg-stone-100 text-stone-600">
          {initials(therapist.first_name, therapist.last_name)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}

export function BookingBroadcastTab({ bookingId, enabled }: BookingBroadcastTabProps) {
  const { t } = useTranslation("admin");
  const { data, isLoading, error } = useBookingBroadcastAudit({ bookingId, enabled });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("broadcast.loading")}
      </div>
    );
  }

  if (error) {
    return <p className="py-6 text-sm text-gray-500">{t("broadcast.error")}</p>;
  }

  const notified = data?.notified ?? [];
  const notReached = data?.notReached ?? [];

  if (notified.length === 0 && notReached.length === 0) {
    return <p className="py-6 text-sm text-gray-500">{t("broadcast.empty")}</p>;
  }

  // Les non sollicités entrent après la cascade : le décalage dit qu'ils n'ont rien reçu.
  const notReachedDelay = notified.length * STAGGER_MS + 200;

  const reasonLabel = (row: BroadcastAuditRow) =>
    t(`broadcast.reasons.${row.exclusionReason ?? "unknown"}`);

  const reasonDetail = (row: BroadcastAuditRow) =>
    row.exclusionReason === "not_qualified" && row.missingTreatments.length > 0
      ? t("broadcast.reasonsLong.not_qualified", { treatments: row.missingTreatments.join(", ") })
      : t(`broadcast.reasonsLong.${row.exclusionReason ?? "unknown"}`);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-start gap-2 text-xs text-gray-500 mb-5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>{t("broadcast.disclaimer")}</p>
      </div>

      {notified.length > 0 && (
        <section>
          <h4 className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase mb-3">
            {t("broadcast.notifiedTitle")} · {notified.length}
          </h4>
          <div className="space-y-1">
            {notified.map((row, i) => (
              <div
                key={row.therapist.id}
                style={{ animationDelay: `${i * STAGGER_MS}ms` }}
                className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-stone-50 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both motion-reduce:animate-none"
              >
                <TherapistAvatar row={row} withWaves />
                <span className="text-sm text-foreground">
                  {row.therapist.first_name} {row.therapist.last_name}
                </span>
                <span
                  className="ml-auto text-xs px-2 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100"
                  title={
                    row.notifiedAt
                      ? format(parseISO(row.notifiedAt), "d MMMM yyyy 'à' HH:mm:ss", { locale: fr })
                      : undefined
                  }
                >
                  {row.notifiedAt ? format(parseISO(row.notifiedAt), "HH:mm") : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {notReached.length > 0 && (
        <section
          style={{ animationDelay: `${notReachedDelay}ms` }}
          className={`animate-in fade-in duration-500 fill-mode-both motion-reduce:animate-none ${
            notified.length > 0 ? "border-t border-stone-100 pt-5 mt-5" : ""
          }`}
        >
          <h4 className="text-xs font-semibold tracking-[0.15em] text-gray-400 uppercase mb-3">
            {t("broadcast.notReachedTitle")} · {notReached.length}
          </h4>
          <div className="space-y-1">
            {notReached.map((row) => (
              <div
                key={row.therapist.id}
                className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-stone-50"
              >
                <TherapistAvatar row={row} withWaves={false} />
                <span className="text-sm text-gray-500">
                  {row.therapist.first_name} {row.therapist.last_name}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="ml-auto text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-600 cursor-default">
                      {reasonLabel(row)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    {reasonDetail(row)}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </section>
      )}
    </TooltipProvider>
  );
}
