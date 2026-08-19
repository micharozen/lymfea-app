// Single source of truth for the treatment catalogue as the Inbox AI agent sees it.
//
// Both the inbound parser and the reply generator go through `get_public_treatments`
// rather than querying `treatment_menus` directly: the RPC already merges the add-on
// flag (`treatment_menus.is_addon OR treatment_categories.is_addon`) and returns the
// variants, which a plain PostgREST select cannot do (category is a text label, not a FK).
//
// Without it, add-ons such as "MASSAGE 30 MIN" (30 min, 70 €) look like ordinary
// treatments and end up proposed as standalone bookings.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface PublicTreatmentVariant {
  id: string;
  label: string | null;
  label_en: string | null;
  duration: number | null;
  price: number | null;
  price_on_request: boolean;
  guest_count: number | null;
  is_default: boolean;
}

export interface PublicTreatment {
  id: string;
  slug: string | null;
  name: string | null;
  name_en: string | null;
  category: string | null;
  duration: number | null;
  price: number | null;
  price_on_request: boolean;
  /** True when the treatment — or its category — is flagged as an add-on. */
  is_addon: boolean;
  variants: PublicTreatmentVariant[];
}

export async function fetchPublicTreatments(
  supabase: SupabaseClient,
  hotelId: string,
): Promise<PublicTreatment[]> {
  const { data, error } = await supabase.rpc("get_public_treatments", { _hotel_id: hotelId });
  if (error) {
    console.error("[publicTreatments] get_public_treatments failed:", error.message);
    return [];
  }
  return (data as Record<string, unknown>[] | null ?? []).map(normalizeTreatment);
}

function normalizeTreatment(row: Record<string, unknown>): PublicTreatment {
  return {
    id: String(row.id),
    slug: str(row.slug),
    name: str(row.name),
    name_en: str(row.name_en),
    category: str(row.category),
    duration: num(row.duration),
    price: num(row.price),
    price_on_request: Boolean(row.price_on_request),
    is_addon: Boolean(row.is_addon),
    variants: Array.isArray(row.variants)
      ? (row.variants as Record<string, unknown>[]).map(normalizeVariant)
      : [],
  };
}

function normalizeVariant(row: Record<string, unknown>): PublicTreatmentVariant {
  return {
    id: String(row.id),
    label: str(row.label),
    label_en: str(row.label_en),
    duration: num(row.duration),
    price: num(row.price),
    price_on_request: Boolean(row.price_on_request),
    guest_count: num(row.guest_count),
    is_default: Boolean(row.is_default),
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const parsed = Number.parseFloat(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
