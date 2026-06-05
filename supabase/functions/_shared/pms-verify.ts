// Shared PMS guest verification helper.
//
// Security model: the room number alone is NOT an authenticator. A guest must
// also provide their last name, which we match (case/accent-insensitive) against
// the reservation currently assigned to that room in the PMS. This is the single
// source of truth — both the public verify endpoint and the booking-creating
// functions call this so a client can never fabricate a "verified" state.

import { getPmsClient, buildPmsConfigFromRow } from "./pms-client.ts";
import type { GuestInfo } from "./pms-client.ts";

export interface VerifiedGuest extends GuestInfo {}

// Normalize a name for tolerant comparison: trim, lowercase, strip accents.
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/**
 * Resolve the guest currently in `roomNumber` and verify their last name matches.
 * Returns the full PMS guest info (incl. email/phone — server-side only) when the
 * room + last name match, otherwise null. Degrades silently to null on any error
 * or when guest lookup is disabled for the hotel.
 */
export async function resolveVerifiedPmsGuest(
  supabase: any,
  hotelId: string,
  roomNumber: string,
  lastName: string,
): Promise<VerifiedGuest | null> {
  if (!hotelId || !roomNumber || !lastName) return null;

  try {
    // Quick check: is guest lookup enabled for this hotel?
    const { data: hotel } = await supabase
      .from("hotels")
      .select("pms_guest_lookup_enabled")
      .eq("id", hotelId)
      .single();

    if (!hotel?.pms_guest_lookup_enabled) return null;

    const { data: pmsConfig, error: configError } = await supabase
      .from("hotel_pms_configs")
      .select("*")
      .eq("hotel_id", hotelId)
      .single();

    if (configError || !pmsConfig) {
      console.error("[pms-verify] PMS config not found:", configError);
      return null;
    }

    const pmsType = pmsConfig.pms_type;
    const config = buildPmsConfigFromRow(pmsType, pmsConfig);
    const client = getPmsClient(pmsType, config);
    const guest = await client.lookupGuestByRoom(roomNumber);

    if (!guest) return null;

    // The room number must be backed by a reservation whose surname matches.
    if (normalizeName(guest.lastName) !== normalizeName(lastName)) {
      console.log("[pms-verify] Last name mismatch for room:", roomNumber);
      return null;
    }

    return guest;
  } catch (error) {
    console.error("[pms-verify] Error:", error);
    return null;
  }
}
