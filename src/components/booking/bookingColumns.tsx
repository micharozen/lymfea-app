import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import type { TFunction } from "i18next";
import type { NavigateFunction } from "react-router-dom";
import { Clock, DoorOpen, Layers, Package, Users } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { HotelCell } from "@/components/table/EntityCell";
import i18n from "@/i18n";
import { formatPrice } from "@/lib/formatPrice";
import { paymentMethodLabel } from "@/lib/paymentMethod";
import { effectivePaymentStatus } from "@/lib/clientTypePayment";
import type { BookingWithTreatments, Hotel } from "@/hooks/booking";

const PAYMENT_TEXT_LABEL_KEYS: Record<string, string> = {
  pending: "admin:bookingColumns.paymentText.pending",
  paid: "admin:bookingColumns.paymentText.paid",
  failed: "admin:bookingColumns.paymentText.failed",
  refunded: "admin:bookingColumns.paymentText.refunded",
  charged_to_room: "admin:bookingColumns.paymentText.chargedToRoom",
  pending_partner_billing: "admin:bookingColumns.paymentText.partnerBilling",
  card_saved: "admin:bookingColumns.paymentText.cardSaved",
};

export function getPaymentTextLabel(status: string | null | undefined): string {
  if (!status) return i18n.t("admin:bookingColumns.paymentText.undefined");
  const key = PAYMENT_TEXT_LABEL_KEYS[status.toLowerCase()];
  return key ? i18n.t(key) : status;
}

/** Colonnes triables : la logique de tri vit dans BookingsList (getValue). */
export type BookingSortKey =
  | "reservation"
  | "date"
  | "time"
  | "duration"
  | "status"
  | "payment"
  | "client"
  | "treatments"
  | "total"
  | "location"
  | "therapist";

export type SortDirection = "asc" | "desc";

export interface BookingCellContext {
  getHotelInfo: (hotelId: string | null) => Hotel | null;
  navigate: NavigateFunction;
  t: TFunction;
  paymentAsText: boolean;
}

export interface BookingColumnDef {
  key: string;
  label: string;
  /** Libellé de la barre de tri mobile quand il diffère de l'en-tête. */
  sortLabel?: string;
  /** Poids relatif, normalisé sur les colonnes visibles au rendu. */
  width: number;
  align?: "left" | "center";
  /** Absent ⇒ colonne non triable. */
  sortKey?: BookingSortKey;
  defaultVisible: boolean;
  hideForConcierge?: boolean;
  cell: (booking: BookingWithTreatments, ctx: BookingCellContext) => ReactNode;
}

const HEAD_CLASS = "font-medium text-muted-foreground text-xs py-1.5 px-2 truncate";

export function columnHeadClass(column: BookingColumnDef): string {
  return column.align === "center"
    ? "font-medium text-muted-foreground text-xs py-1.5 px-2 text-center"
    : HEAD_CLASS;
}

/**
 * "Marie Dupont" → "Marie D." : le prénom en entier, l'initiale du nom.
 * `therapist_name` est un nom complet en une seule chaîne.
 */
export function formatTherapistShortName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const lastName = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(" ")} ${lastName.charAt(0).toUpperCase()}.`;
}

/** Rendu par défaut d'une valeur texte simple, tronquée. */
function text(value: string | number | null | undefined): ReactNode {
  const label = value === null || value === undefined || value === "" ? "-" : String(value);
  return <span className="block leading-tight truncate">{label}</span>;
}

export const BOOKING_COLUMNS: BookingColumnDef[] = [
  {
    key: "reservation",
    get label() { return i18n.t("admin:bookingColumns.labels.reservation"); },
    get sortLabel() { return i18n.t("admin:bookingColumns.labels.reservationLong"); },
    width: 6,
    sortKey: "reservation",
    defaultVisible: true,
    cell: (booking) => (
      <span className="leading-none flex items-center gap-1 font-medium text-primary">
        #{booking.booking_id}
        {booking.bundle_usage_id && (
          <Package className="h-3 w-3 text-amber-600 shrink-0" title={i18n.t("admin:bookingColumns.badges.bundleSession")} />
        )}
      </span>
    ),
  },
  {
    key: "date",
    label: "Date",
    width: 8,
    sortKey: "date",
    defaultVisible: true,
    cell: (booking) => (
      <span className="block leading-none">
        {format(new Date(booking.booking_date), "dd-MM-yyyy")}
      </span>
    ),
  },
  {
    key: "time",
    get label() { return i18n.t("admin:bookingColumns.labels.time"); },
    width: 6,
    sortKey: "time",
    defaultVisible: true,
    cell: (booking) => (
      <span className="block leading-none">{booking.booking_time.substring(0, 5)}</span>
    ),
  },
  {
    key: "duration",
    get label() { return i18n.t("admin:bookingColumns.labels.duration"); },
    width: 6,
    sortKey: "duration",
    defaultVisible: true,
    cell: (booking) => (
      <span className="block leading-none">
        {booking.totalDuration ? `${booking.totalDuration} min` : "-"}
      </span>
    ),
  },
  {
    key: "status",
    get label() { return i18n.t("admin:bookingColumns.labels.status"); },
    width: 10,
    sortKey: "status",
    defaultVisible: true,
    cell: (booking) => (
      <div className="flex flex-col gap-0.5 items-start">
        <StatusBadge
          status={booking.status}
          type="booking"
          className="text-[10px] px-2 py-0.5 whitespace-nowrap"
        />
        {booking.guest_count > 1 && booking.status === "pending" && (
          <span
            className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap font-medium"
            title={i18n.t("admin:bookingColumns.badges.duoTooltip", { count: booking.guest_count })}
          >
            <Users className="h-2.5 w-2.5" />
            {booking.booking_therapists?.filter((bt) => bt.status === "accepted").length || 0}/
            {booking.guest_count}
          </span>
        )}
        {booking.guest_count > 1 && booking.status === "confirmed" && (
          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 whitespace-nowrap font-medium">
            <Users className="h-2.5 w-2.5" /> {i18n.t("admin:bookingColumns.badges.duo")}
          </span>
        )}
        {booking.booking_group_id && (
          <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap font-medium">
            <Layers className="h-2.5 w-2.5" /> {i18n.t("admin:bookingColumns.badges.grouped")}
          </span>
        )}
      </div>
    ),
  },
  {
    key: "payment",
    get label() { return i18n.t("admin:bookingColumns.labels.payment"); },
    width: 11,
    align: "center",
    sortKey: "payment",
    defaultVisible: true,
    cell: (booking, { paymentAsText }) => {
      if (booking.status === "quote_pending" || booking.status === "waiting_approval") return null;
      const status = effectivePaymentStatus(booking.payment_method, booking.payment_status);
      return (
        <StatusBadge
          status={status}
          type="payment"
          className={
            paymentAsText
              ? "text-[10px] px-2 py-0.5 max-w-full truncate inline-flex items-center justify-center"
              : "text-base px-2 py-0.5 whitespace-nowrap inline-flex items-center justify-center"
          }
          customLabel={paymentAsText ? getPaymentTextLabel(status) : undefined}
        />
      );
    },
  },
  {
    key: "client",
    label: "Client",
    width: 12,
    sortKey: "client",
    defaultVisible: true,
    cell: (booking, { navigate }) => {
      const firstInitial = booking.client_first_name
        ? `${booking.client_first_name.charAt(0).toUpperCase()}.`
        : "";
      const label = [firstInitial, booking.client_last_name].filter(Boolean).join(" ");
      return booking.customer_id ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/admin/customers/${booking.customer_id}`);
          }}
          className="block leading-tight truncate text-left hover:underline hover:text-primary"
        >
          {label}
        </button>
      ) : (
        <span className="block leading-tight truncate">{label}</span>
      );
    },
  },
  {
    key: "treatments",
    get label() { return i18n.t("admin:bookingColumns.labels.treatments"); },
    width: 12,
    sortKey: "treatments",
    defaultVisible: true,
    cell: (booking) => (
      <span className="block leading-snug truncate">
        {booking.treatments.length > 0 ? booking.treatments.map((tr) => tr.name).join(", ") : "-"}
      </span>
    ),
  },
  {
    key: "total",
    label: "Total",
    width: 7,
    sortKey: "total",
    defaultVisible: true,
    cell: (booking, { getHotelInfo, t }) => (
      <span className="leading-none flex items-center gap-1">
        {booking.payment_status === "offert"
          ? t("admin:bookings.offert.tag")
          : formatPrice(booking.total_price, getHotelInfo(booking.hotel_id)?.currency || "EUR")}
        {booking.is_out_of_hours && (
          <Clock className="h-3 w-3 text-amber-500 shrink-0" title={i18n.t("admin:bookingColumns.badges.outOfHours")} />
        )}
      </span>
    ),
  },
  {
    key: "location",
    get label() { return i18n.t("admin:bookingColumns.labels.location"); },
    width: 10,
    sortKey: "location",
    defaultVisible: true,
    hideForConcierge: true,
    cell: (booking, { getHotelInfo }) => (
      <>
        <HotelCell hotel={getHotelInfo(booking.hotel_id)} />
        {booking.room_name && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground leading-tight truncate">
            <DoorOpen className="h-3 w-3 shrink-0" />
            {booking.room_name}
            {booking.secondary_room_name && ` + ${booking.secondary_room_name}`}
          </span>
        )}
      </>
    ),
  },
  {
    key: "therapist",
    get label() { return i18n.t("admin:bookingColumns.labels.therapist"); },
    width: 10,
    sortKey: "therapist",
    defaultVisible: true,
    // Un duo est porté par plusieurs praticiens : on les nomme tous, pas
    // seulement le thérapeute principal.
    cell: (booking) =>
      text(
        booking.therapist_display_names?.length
          ? booking.therapist_display_names
              .map(formatTherapistShortName)
              .filter(Boolean)
              .join(" + ")
          : formatTherapistShortName(booking.therapist_name),
      ),
  },

  // ── Colonnes optionnelles (masquées par défaut) ────────────────
  {
    key: "clientEmail",
    label: "Email",
    width: 12,
    defaultVisible: false,
    cell: (booking) => text(booking.client_email),
  },
  {
    key: "phone",
    get label() { return i18n.t("admin:bookingColumns.labels.phone"); },
    width: 9,
    defaultVisible: false,
    cell: (booking) => text(booking.phone),
  },
  {
    key: "roomNumber",
    get label() { return i18n.t("admin:bookingColumns.labels.roomNumber"); },
    width: 7,
    defaultVisible: false,
    cell: (booking) => text(booking.room_number),
  },
  {
    key: "clientType",
    get label() { return i18n.t("admin:bookingColumns.labels.clientType"); },
    width: 8,
    defaultVisible: false,
    cell: (booking, { t }) =>
      text(
        booking.client_type
          ? t(`admin:bookings.clientType.${booking.client_type}`, {
              defaultValue: booking.client_type,
            })
          : null
      ),
  },
  {
    key: "source",
    label: "Source",
    width: 8,
    defaultVisible: false,
    cell: (booking) => text(booking.source),
  },
  {
    key: "createdAt",
    get label() { return i18n.t("admin:bookingColumns.labels.createdAt"); },
    width: 9,
    defaultVisible: false,
    cell: (booking) =>
      text(booking.created_at ? format(parseISO(booking.created_at), "dd-MM-yyyy HH:mm") : null),
  },
  {
    key: "clientNote",
    get label() { return i18n.t("admin:bookingColumns.labels.clientNote"); },
    width: 12,
    defaultVisible: false,
    cell: (booking) => text(booking.client_note),
  },
  {
    key: "room",
    get label() { return i18n.t("admin:bookingColumns.labels.room"); },
    width: 9,
    defaultVisible: false,
    cell: (booking) =>
      text(
        booking.room_name
          ? booking.secondary_room_name
            ? `${booking.room_name} + ${booking.secondary_room_name}`
            : booking.room_name
          : null
      ),
  },
  {
    key: "guestCount",
    get label() { return i18n.t("admin:bookingColumns.labels.guestCount"); },
    width: 6,
    defaultVisible: false,
    cell: (booking) => text(booking.guest_count),
  },
  {
    key: "paymentMethod",
    get label() { return i18n.t("admin:bookingColumns.labels.paymentMethod"); },
    width: 10,
    defaultVisible: false,
    cell: (booking) => text(paymentMethodLabel(booking.payment_method)),
  },
  {
    key: "externalReference",
    get label() { return i18n.t("admin:bookingColumns.labels.externalReference"); },
    width: 9,
    defaultVisible: false,
    cell: (booking) => text(booking.external_reference),
  },
];
