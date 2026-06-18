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
import type { AlertsData } from "@/hooks/useDashboardData";

interface DashboardAlertsProps {
  alerts: AlertsData;
}

export function DashboardAlerts({ alerts }: DashboardAlertsProps) {
  const { unassigned, pendingPayments, failedPayments } = alerts;
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
          <Link
            to="/admin/bookings?status=pending"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-sm font-medium hover:bg-violet-100 transition-colors dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-200"
          >
            <UserX className="h-4 w-4" />
            {unassigned} sans thérapeute
          </Link>
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

      <Dialog open={isPendingPaymentsOpen} onOpenChange={setIsPendingPaymentsOpen}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[80vh] overflow-hidden p-0 gap-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="px-5 py-4 border-b">
            <DialogTitle>Paiements en attente</DialogTitle>
            <DialogDescription>
              Cliquez sur une réservation pour l&apos;ouvrir dans un nouvel onglet.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <div className="space-y-2">
              {alerts.pendingPaymentBookings.map((booking) => (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => openBookingInNewTab(booking.id)}
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
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
                    <div className="flex items-center gap-2 text-right">
                      <span className="font-medium tabular-nums text-foreground">{booking.amount}</span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
