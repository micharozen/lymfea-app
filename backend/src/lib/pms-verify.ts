import { supabaseAdmin } from "./supabase";

export interface ResolvedPmsGuest {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  checkIn?: string;
  checkOut?: string;
}

/**
 * Resolve a PMS-verified hotel guest (room + last name) via the service-role-only
 * `pms-resolve-guest` edge function. The backend has no PMS client of its own, so it
 * delegates verification + contact-detail resolution to Supabase. Returns null when
 * the room + name don't match a current reservation.
 */
export async function resolveVerifiedPmsGuest(
  hotelId: string,
  roomNumber: string,
  lastName: string,
): Promise<ResolvedPmsGuest | null> {
  if (!hotelId || !roomNumber || !lastName) return null;

  try {
    const { data, error } = await supabaseAdmin.functions.invoke("pms-resolve-guest", {
      body: { hotelId, roomNumber, lastName },
    });
    if (error) {
      console.error("[backend pms-verify] invoke error:", error);
      return null;
    }
    if (!data?.verified || !data?.guest) return null;
    return data.guest as ResolvedPmsGuest;
  } catch (e) {
    console.error("[backend pms-verify] exception:", e);
    return null;
  }
}
