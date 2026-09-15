import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/integrations/supabase/client";
import { promoCodeKeys, listPromoCodeRedemptions } from "@shared/db";
import { formatPrice } from "@/lib/formatPrice";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/table/TableSkeleton";
import { TableEmptyState } from "@/components/table/TableEmptyState";
import { BadgePercent } from "lucide-react";

interface PromoCodeRedemptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promoCodeId: string | null;
  promoCodeLabel: string;
}

/** Détail des réservations ayant consommé un code promo. */
export function PromoCodeRedemptionsDialog({
  open,
  onOpenChange,
  promoCodeId,
  promoCodeLabel,
}: PromoCodeRedemptionsDialogProps) {
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();

  const { data: redemptions, isLoading } = useQuery({
    queryKey: promoCodeKeys.redemptions(promoCodeId ?? ""),
    enabled: open && !!promoCodeId,
    queryFn: () => listPromoCodeRedemptions(supabase, promoCodeId!),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-normal">
            {t('promoCodesPage.redemptionsTitle', { code: promoCodeLabel })}
          </DialogTitle>
          <DialogDescription>{t('promoCodesPage.redemptionsSubtitle')}</DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table className="text-sm w-full">
            <TableHeader>
              <TableRow className="bg-muted/20 h-8">
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                  {t('promoCodesPage.colBooking')}
                </TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                  {t('promoCodesPage.colClient')}
                </TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2">
                  {t('promoCodesPage.colDate')}
                </TableHead>
                <TableHead className="font-medium text-muted-foreground text-xs py-1.5 px-2 text-right">
                  {t('promoCodesPage.colDiscount')}
                </TableHead>
              </TableRow>
            </TableHeader>
            {isLoading ? (
              <TableSkeleton rows={5} columns={4} />
            ) : !redemptions || redemptions.length === 0 ? (
              <TableEmptyState
                colSpan={4}
                icon={BadgePercent}
                message={t('promoCodesPage.noRedemption')}
              />
            ) : (
              <TableBody>
                {redemptions.map((r) => (
                  <TableRow
                    key={r.id}
                    className="h-10 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => r.booking && navigate(`/admin/bookings/${r.booking.id}`)}
                  >
                    <TableCell className="py-0 px-2">
                      {r.booking?.booking_id ? `#${r.booking.booking_id}` : "—"}
                    </TableCell>
                    <TableCell className="py-0 px-2 truncate">
                      {[r.booking?.client_first_name, r.booking?.client_last_name]
                        .filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="py-0 px-2 whitespace-nowrap">
                      {r.booking?.booking_date
                        ? new Date(r.booking.booking_date).toLocaleDateString()
                        : new Date(r.redeemed_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="py-0 px-2 text-right font-medium text-emerald-600">
                      −{formatPrice(r.discount_amount_cents / 100, "EUR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
