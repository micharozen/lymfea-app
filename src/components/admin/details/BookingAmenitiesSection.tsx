import { useQuery } from "@tanstack/react-query";
import { Waves } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAmenityLabel, getAmenityType } from "@/lib/amenityTypes";
import { formatPrice } from "@/lib/formatPrice";

interface BookingAmenitiesSectionProps {
  bookingId: string;
  currency: string;
}

interface LinkedAmenity {
  id: string;
  booking_time: string;
  end_time: string | null;
  duration: number;
  price: number;
  type: string;
  name: string | null;
  color: string | null;
}

/**
 * Accès commodités (piscine, sauna, etc.) rattachés à une réservation via
 * amenity_bookings.linked_booking_id. Lecture seule — la création se fait au
 * moment de la réservation (voir useCreateBookingMutation). Ne rend rien tant
 * qu'aucun accès n'est lié.
 */
export function BookingAmenitiesSection({ bookingId, currency }: BookingAmenitiesSectionProps) {
  const { data: amenities = [] } = useQuery({
    queryKey: ["booking-linked-amenities", bookingId],
    queryFn: async (): Promise<LinkedAmenity[]> => {
      const { data, error } = await supabase
        .from("amenity_bookings")
        .select("id, booking_time, end_time, duration, price, venue_amenities:venue_amenity_id (type, name, color)")
        .eq("linked_booking_id", bookingId)
        .neq("status", "cancelled")
        .order("booking_time", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((row: any) => ({
        id: row.id,
        booking_time: row.booking_time,
        end_time: row.end_time,
        duration: row.duration,
        price: parseFloat(row.price) || 0,
        type: row.venue_amenities?.type ?? "",
        name: row.venue_amenities?.name ?? null,
        color: row.venue_amenities?.color ?? null,
      }));
    },
    staleTime: 30_000,
  });

  if (amenities.length === 0) return null;

  return (
    <section className="bg-white rounded-xl border p-6 shadow-sm">
      <h3 className="text-sm font-bold text-muted-foreground uppercase mb-4 flex items-center gap-2">
        <Waves className="h-4 w-4" /> Commodités
      </h3>

      <div className="space-y-3">
        {amenities.map((a) => {
          const typeDef = getAmenityType(a.type);
          const Icon = typeDef?.icon ?? Waves;
          const color = a.color || typeDef?.defaultColor || "#06b6d4";
          const label = a.name || getAmenityLabel(a.type, "fr");
          const timeRange = a.end_time
            ? `${a.booking_time.substring(0, 5)} – ${a.end_time.substring(0, 5)}`
            : a.booking_time.substring(0, 5);
          return (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border-l-4 bg-gray-50"
              style={{ borderLeftColor: color }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="h-5 w-5 flex-shrink-0" style={{ color }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{label}</p>
                  <p className="text-xs text-gray-500">
                    {timeRange}
                    {a.duration > 0 && ` · ${a.duration} min`}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold whitespace-nowrap">
                {a.price > 0 ? formatPrice(a.price, currency) : "Inclus"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
