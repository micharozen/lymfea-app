import { Link } from "react-router-dom";
import { AlertTriangle, Clock, UserX, CreditCard } from "lucide-react";
import type { AlertsData } from "@/hooks/useDashboardData";

interface DashboardAlertsProps {
  alerts: AlertsData;
}

export function DashboardAlerts({ alerts }: DashboardAlertsProps) {
  const { pendingConfirmation, unassigned, failedPayments } = alerts;
  const total = pendingConfirmation + unassigned + failedPayments;

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {pendingConfirmation > 0 && (
        <Link
          to="/admin/bookings?status=pending"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200"
        >
          <Clock className="h-4 w-4" />
          {pendingConfirmation} en attente de confirmation
        </Link>
      )}
      {unassigned > 0 && (
        <Link
          to="/admin/bookings?status=awaiting_hairdresser_selection"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 text-sm font-medium hover:bg-violet-100 transition-colors dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-200"
        >
          <UserX className="h-4 w-4" />
          {unassigned} sans thérapeute
        </Link>
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
  );
}
