import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, ExternalLink, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AlertBooking, AlertsData } from "@/hooks/useDashboardData";

interface DashboardAlertsProps {
  alerts: AlertsData;
}

const getDaysUntilLabel = (daysUntil: number) => {
  if (daysUntil < 0) return `J+${Math.abs(daysUntil)}`;
  return `J-${daysUntil}`;
};

const getDaysUntilClassName = (daysUntil: number) => {
  if (daysUntil <= 0) {
    return "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800";
  }
  if (daysUntil <= 1) {
    return "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-200 dark:border-orange-800";
  }
  if (daysUntil <= 3) {
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800";
  }
  return "bg-muted text-muted-foreground border-border";
};

export function DashboardAlerts({ alerts }: DashboardAlertsProps) {
  const { unassigned, pendingPayments, failedPayments } = alerts;
  const [isUnassignedOpen, setIsUnassignedOpen] = useState(false);
  const [isPendingPaymentsOpen, setIsPendingPaymentsOpen] = useState(false);
  const total = unassigned + pendingPayments + failedPayments;

  if (total === 0) return null;

  const openBookingInNewTab = (bookingId: string) => {
    window.open(`/admin/bookings/${bookingId}`, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-6">
        {unassigned > 0 && (
          <button
            type="button"
            onClick={() => setIsUnassignedOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-sm font-medium hover:bg-violet-100 transition-colors dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-200"
          >
            <UserX className="h-4 w-4" />
            {unassigned} sans thérapeute
          </button>
        )}
        {pendingPayments > 0 && (
          <button
            type="button"
            onClick={() => setIsPendingPaymentsOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200"
          >
            <CreditCard className="h-4 w-4" />
            {pendingPayments} paiement{pendingPayments > 1 ? "s" : ""} en attente
          </button>
        )}
        {failedPayments > 0 && (
          <Link
            to="/admin/bookings?payment_status=failed"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-medium hover:bg-red-100 transition-colors dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
          >
            <CreditCard className="h-4 w-4" />
            {failedPayments} paiement{failedPayments > 1 ? "s" : ""} échoué{failedPayments > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      <AlertBookingsDialog
        open={isUnassignedOpen}
        onOpenChange={setIsUnassignedOpen}
        title="Réservations sans thérapeute"
        bookings={alerts.unassignedBookings}
        onSelect={openBookingInNewTab}
      />

      <AlertBookingsDialog
        open={isPendingPaymentsOpen}
        onOpenChange={setIsPendingPaymentsOpen}
        title="Paiements en attente"
        bookings={alerts.pendingPaymentBookings}
        onSelect={openBookingInNewTab}
      />
    </>
  );
}

interface AlertBookingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  bookings: AlertBooking[];
  onSelect: (bookingId: string) => void;
}

function AlertBookingsDialog({ open, onOpenChange, title, bookings, onSelect }: AlertBookingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[640px] max-h-[80vh] overflow-hidden p-0 gap-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Cliquez sur une réservation pour l&apos;ouvrir dans un nouvel onglet.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          <div className="space-y-2">
            {bookings.map((booking) => (
              <button
                key={booking.id}
                type="button"
                onClick={() => onSelect(booking.id)}
                className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <div className="flex min-h-20 items-stretch justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Réservation #{booking.bookingNumber ?? booking.id.slice(0, 8)}
                    </p>
                    <p className="font-medium text-foreground">
                      {booking.hotelName || "Lieu non renseigné"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {booking.date}
                      {booking.time ? ` · ${booking.time.slice(0, 5)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end justify-between gap-3 text-right">
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums text-foreground">{booking.amount}</span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${getDaysUntilClassName(booking.daysUntil)}`}>
                      {getDaysUntilLabel(booking.daysUntil)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
