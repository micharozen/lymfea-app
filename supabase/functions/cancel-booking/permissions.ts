import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { needsStripeSettlementOnCancel } from "../_shared/cancel-booking-rules.ts";

export function needsStripeSettlement(booking: {
  payment_status?: string | null;
  payment_method?: string | null;
}): boolean {
  return needsStripeSettlementOnCancel(
    booking.payment_status,
    booking.payment_method,
  );
}

export async function assertCallerCanCancelBooking(
  supabase: SupabaseClient,
  callerUserId: string,
  booking: {
    id: string;
    hotel_id: string;
    therapist_id?: string | null;
  },
): Promise<{ isAdmin: boolean }> {
  const { data: roles, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", callerUserId);

  if (roleError) {
    throw new Error("Failed to verify role");
  }

  const roleNames = (roles ?? []).map((r) => r.role as string);
  let isAdmin = roleNames.includes("admin");

  if (!isAdmin) {
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", callerUserId)
      .maybeSingle();
    isAdmin = !!adminRow;
  }

  if (isAdmin) return { isAdmin: true };

  if (roleNames.includes("concierge")) {
    const { data: assignedHotels, error: hotelsError } = await supabase.rpc(
      "get_concierge_hotels",
      { _user_id: callerUserId },
    );
    if (hotelsError) throw new Error("Failed to verify venue access");
    const hotelIds: string[] = Array.isArray(assignedHotels)
      ? assignedHotels.map((row: { hotel_id: string }) => row.hotel_id)
      : [];
    if (hotelIds.includes(booking.hotel_id)) {
      return { isAdmin: false };
    }
  }

  const { data: callerTherapist } = await supabase
    .from("therapists")
    .select("id")
    .eq("user_id", callerUserId)
    .maybeSingle();

  if (callerTherapist) {
    if (booking.therapist_id === callerTherapist.id) {
      return { isAdmin: false };
    }
    const { data: btRow } = await supabase
      .from("booking_therapists")
      .select("id")
      .eq("booking_id", booking.id)
      .eq("therapist_id", callerTherapist.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (btRow) return { isAdmin: false };
  }

  throw new Error("Forbidden");
}
