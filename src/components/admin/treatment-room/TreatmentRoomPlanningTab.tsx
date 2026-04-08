import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Calendar } from "lucide-react";

interface TreatmentRoomPlanningTabProps {
  roomId: string;
}

export function TreatmentRoomPlanningTab({
  roomId,
}: TreatmentRoomPlanningTabProps) {
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["treatment-room-bookings", roomId],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, booking_date, booking_time, status, guest_name, treatment_menus(name)"
        )
        .eq("room_id", roomId)
        .gte("booking_date", today)
        .not("status", "in", '("cancelled","completed")')
        .order("booking_date", { ascending: true })
        .order("booking_time", { ascending: true })
        .limit(20);

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bookings || bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Aucune réservation à venir pour cette salle
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-w-2xl">
      <h3 className="text-sm font-semibold text-foreground">
        Prochaines réservations ({bookings.length})
      </h3>
      <div className="space-y-2">
        {bookings.map((booking) => (
          <div
            key={booking.id}
            className="flex items-center gap-4 p-3 rounded-lg border bg-card"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {booking.guest_name || "Client"}
              </p>
              <p className="text-xs text-muted-foreground">
                {(booking.treatment_menus as any)?.name || "Soin"}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-medium">
                {new Date(booking.booking_date).toLocaleDateString("fr-FR", {
                  day: "2-digit",
                  month: "short",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {booking.booking_time?.substring(0, 5)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
