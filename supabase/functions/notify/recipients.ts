import type { NotifyContext } from "./types.ts";

export interface TherapistRecipient {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Praticiens engagés sur la réservation.
 *
 * Le roster fait foi — un duo en compte plusieurs, et `bookings.therapist_id`
 * ne porte que le principal. Ce dernier reste le repli pour les réservations
 * solo historiques créées avant le roster.
 *
 * Seuls les praticiens ayant un compte (`user_id`) sont retournés : sans lui,
 * ni push ni notification in-app ne sont adressables.
 */
export async function resolveTherapists(ctx: NotifyContext): Promise<TherapistRecipient[]> {
  const { supabase, booking } = ctx;

  const { data: roster } = await supabase
    .from("booking_therapists")
    .select("therapist_id")
    .eq("booking_id", booking.id)
    .in("status", ["accepted", "reconfirm_pending"]);

  const therapistIds = [
    ...new Set(
      [
        ...(roster ?? []).map((r: { therapist_id: string }) => r.therapist_id),
        booking.therapist_id,
      ].filter((id): id is string => !!id),
    ),
  ];

  if (therapistIds.length === 0) return [];

  const { data: therapists, error } = await supabase
    .from("therapists")
    .select("id, user_id, first_name, last_name")
    .in("id", therapistIds);

  if (error) {
    console.error("[notify] Error fetching therapists:", error);
    return [];
  }

  return (therapists ?? []).filter(
    (t: { user_id: string | null }): t is TherapistRecipient => !!t.user_id,
  );
}

/** Coordonnées client disponibles, qui déterminent les canaux réellement servables. */
export function resolveClientChannels(ctx: NotifyContext): { email: boolean; sms: boolean } {
  return {
    email: !!ctx.booking.client_email,
    sms: !!ctx.booking.phone,
  };
}
