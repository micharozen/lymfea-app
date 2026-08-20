import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Euro, User, X, Pencil } from "lucide-react";
import { formatPrice } from "@/lib/formatPrice";
import { getAmenityType, getClientTypeLabel } from "@/lib/amenityTypes";
import type { AmenityBookingForCalendar } from "@/hooks/booking";

interface AmenityBookingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: AmenityBookingForCalendar | null;
  /** Called when the user chooses to edit this booking. */
  onEdit?: (booking: AmenityBookingForCalendar) => void;
}

export function AmenityBookingDetailDialog({
  open,
  onOpenChange,
  booking,
  onEdit,
}: AmenityBookingDetailDialogProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("amenity_bookings")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["amenity-bookings"] });
      toast.success(t("admin:amenityBookingDetail.toasts.cancelled"));
      onOpenChange(false);
    },
    onError: () => toast.error(t("admin:amenityBookingDetail.errors.cancelFailed")),
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("amenity_bookings")
        .update({ status: "completed" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["amenity-bookings"] });
      toast.success(t("admin:amenityBookingDetail.toasts.completed"));
      onOpenChange(false);
    },
    onError: () => toast.error(t("admin:amenityBookingDetail.errors.updateFailed")),
  });

  if (!booking) return null;

  const typeDef = getAmenityType(booking.amenity_type);
  const Icon = typeDef?.icon;

  const durationHours = Math.floor(booking.duration / 60);
  const durationMinutes = booking.duration % 60;
  const durationFormatted = durationHours > 0
    ? (durationMinutes > 0 ? `${durationHours}h${durationMinutes}` : `${durationHours}h`)
    : `${durationMinutes}min`;

  const clientName = booking.customer
    ? `${booking.customer.first_name} ${booking.customer.last_name || ""}`.trim()
    : "—";

  const isActive = booking.status === "confirmed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5" style={{ color: booking.amenity_color }} />}
            {booking.amenity_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className="flex items-center gap-2">
            <Badge
              variant={
                booking.status === "confirmed"
                  ? "default"
                  : booking.status === "completed"
                  ? "secondary"
                  : "destructive"
              }
            >
              {booking.status === "confirmed" && t("common:status.confirmed")}
              {booking.status === "completed" && t("common:status.completed")}
              {booking.status === "cancelled" && t("common:status.cancelled")}
              {booking.status === "noshow" && t("admin:amenityBookingDetail.status.noshow")}
            </Badge>
            <Badge variant="outline">{getClientTypeLabel(booking.client_type, i18n.language)}</Badge>
          </div>

          {/* Client */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{clientName}</span>
            </div>
            {booking.customer?.phone && (
              <div className="text-sm text-muted-foreground pl-6">
                {booking.customer.phone}
              </div>
            )}
            {booking.room_number && (
              <div className="text-sm text-muted-foreground pl-6">
                {t("admin:amenityBookingDetail.room", { number: booking.room_number })}
              </div>
            )}
          </div>

          {/* Date / Time */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {booking.booking_date} · {booking.booking_time?.substring(0, 5)} · {durationFormatted}
            </span>
          </div>

          {/* Guests */}
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              {t("admin:amenityBookingDetail.guests", { count: booking.num_guests, total: booking.capacity_total })}
            </span>
          </div>

          {/* Price */}
          {booking.price > 0 && (
            <div className="flex items-center gap-2 text-sm font-medium">
              <Euro className="h-4 w-4 text-muted-foreground" />
              <span>{formatPrice(booking.price, "EUR")}</span>
            </div>
          )}
          {booking.price === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Euro className="h-4 w-4" />
              <span>{t("admin:amenityBookingDetail.free")}</span>
            </div>
          )}

          {/* Notes */}
          {booking.notes && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
              {booking.notes}
            </div>
          )}

          {/* Actions */}
          {isActive && (
            <div className="flex items-center gap-2 pt-2 border-t">
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(booking)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  {t("common:buttons.edit")}
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelMutation.mutate(booking.id)}
                  disabled={cancelMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  {t("common:buttons.cancel")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => completeMutation.mutate(booking.id)}
                  disabled={completeMutation.isPending}
                  className="bg-foreground text-background hover:bg-foreground/90"
                >
                  {t("admin:amenityBookingDetail.complete")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
