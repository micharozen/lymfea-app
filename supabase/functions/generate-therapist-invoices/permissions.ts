/**
 * Contrôle d'accès de la génération des factures thérapeutes.
 *
 * La fonction est déclarée `verify_jwt = false` et travaille en service role :
 * sans cette garde, la seule protection serait de ne pas exposer le bouton dans
 * l'UI — n'importe qui pourrait générer, écraser et envoyer par email les
 * factures de tous les thérapeutes. L'appelant doit donc être :
 *  - le service role lui-même (appels serveur / cron) → tous les lieux ;
 *  - un admin plateforme → tous les lieux ;
 *  - un concierge → uniquement les lieux qui lui sont rattachés.
 */

import { supabaseAdmin } from "../_shared/supabase-admin.ts";

export interface CallerAccess {
  /** Accès à tous les lieux (admin plateforme ou appel serveur). */
  allVenues: boolean;
  /** Lieux autorisés quand `allVenues` est faux. */
  hotelIds: string[];
}

/** Erreur portant le code HTTP à renvoyer, pour ne pas répondre 500 sur un 403. */
export class AccessError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AccessError";
    this.status = status;
  }
}

const bearerToken = (req: Request): string | null => {
  const match = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
};

export const resolveCallerAccess = async (req: Request): Promise<CallerAccess> => {
  const token = bearerToken(req);
  if (!token) throw new AccessError("Unauthorized", 401);

  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return { allVenues: true, hotelIds: [] };
  }

  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) throw new AccessError("Unauthorized", 401);

  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleNames = (roles ?? []).map((r) => String((r as { role?: unknown }).role ?? ""));

  if (roleNames.includes("admin")) return { allVenues: true, hotelIds: [] };

  // Certains admins historiques n'ont pas de ligne user_roles (même repli que
  // mark-booking-noshow / cancel-booking).
  const { data: adminRow } = await supabaseAdmin
    .from("admins")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (adminRow) return { allVenues: true, hotelIds: [] };

  if (roleNames.includes("concierge")) {
    const { data: assigned, error } = await supabaseAdmin.rpc("get_concierge_hotels", {
      _user_id: user.id,
    });
    if (error) throw new AccessError("Failed to verify venue access", 500);
    const hotelIds = Array.isArray(assigned)
      ? assigned.map((row: { hotel_id: string }) => row.hotel_id)
      : [];
    if (hotelIds.length > 0) return { allVenues: false, hotelIds };
  }

  throw new AccessError("Forbidden", 403);
};

/**
 * Un appelant restreint doit désigner explicitement son lieu : sans `hotel_id`,
 * la génération porterait sur tous les lieux du thérapeute.
 */
export const assertVenueAllowed = (
  access: CallerAccess,
  hotelId: string | undefined | null,
): void => {
  if (access.allVenues) return;
  if (!hotelId) throw new AccessError("hotel_id is required", 400);
  if (!access.hotelIds.includes(hotelId)) throw new AccessError("Forbidden", 403);
};
